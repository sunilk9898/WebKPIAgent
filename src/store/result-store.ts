// ============================================================================
// Result Store - PostgreSQL + Redis for scan results and trend data
// ============================================================================

import { Pool } from 'pg';
import Redis from 'ioredis';
import { Logger } from '../utils/logger';
import { ScanReport } from '../types';

export class ResultStore {
  private logger = new Logger('result-store');
  private pg?: Pool;
  private redis?: Redis;
  private schemaReady = false;

  constructor() {
    // Initialize PostgreSQL — use DATABASE_URL or default local connection
    const dbUrl = process.env.DATABASE_URL || 'postgresql://vzy:changeme@localhost:5432/vzy_agent';
    try {
      this.pg = new Pool({ connectionString: dbUrl, connectionTimeoutMillis: 5000 });
    } catch (error) {
      this.logger.warn('Failed to create PostgreSQL pool, falling back to file storage', { error: String(error) });
    }

    // Initialize Redis if configured
    if (process.env.REDIS_URL) {
      this.redis = new Redis(process.env.REDIS_URL);
    }
  }

  // Ensure scan_reports table exists (called lazily on first use)
  private async ensureSchema(): Promise<void> {
    if (this.schemaReady || !this.pg) return;
    try {
      await this.pg.query(`
        CREATE TABLE IF NOT EXISTS scan_reports (
          id VARCHAR(100) PRIMARY KEY,
          scan_id VARCHAR(100) NOT NULL,
          target_url TEXT NOT NULL,
          platform VARCHAR(20) NOT NULL,
          overall_score DECIMAL(5,2) NOT NULL,
          security_score DECIMAL(5,2),
          performance_score DECIMAL(5,2),
          code_quality_score DECIMAL(5,2),
          critical_findings_count INTEGER DEFAULT 0,
          report_json JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_scan_reports_target ON scan_reports(target_url);
        CREATE INDEX IF NOT EXISTS idx_scan_reports_date ON scan_reports(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_scan_reports_score ON scan_reports(overall_score);
      `);
      this.schemaReady = true;
    } catch (error) {
      this.logger.warn('Failed to ensure schema', { error: String(error) });
    }
  }

  // ---------------------------------------------------------------------------
  // Save Report
  // ---------------------------------------------------------------------------
  async saveReport(report: ScanReport): Promise<void> {
    await this.ensureSchema();

    // Store in PostgreSQL for persistent history
    if (this.pg) {
      try {
        await this.pg.query(
          `INSERT INTO scan_reports (id, scan_id, target_url, platform, overall_score,
           security_score, performance_score, code_quality_score,
           critical_findings_count, report_json, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO UPDATE SET
             overall_score = EXCLUDED.overall_score,
             security_score = EXCLUDED.security_score,
             performance_score = EXCLUDED.performance_score,
             code_quality_score = EXCLUDED.code_quality_score,
             critical_findings_count = EXCLUDED.critical_findings_count,
             report_json = EXCLUDED.report_json`,
          [
            report.id,
            report.scanId,
            report.target.url || report.target.repoPath,
            report.platform,
            report.kpiScore.overallScore,
            report.kpiScore.grades.security.rawScore,
            report.kpiScore.grades.performance.rawScore,
            report.kpiScore.grades.codeQuality.rawScore,
            report.criticalFindings.length,
            JSON.stringify(report),
            report.generatedAt,
          ],
        );
        this.logger.info('Report saved to PostgreSQL');
      } catch (error) {
        this.logger.error('Failed to save report to PostgreSQL', { error: String(error) });
      }
    }

    // Cache latest report in Redis for fast access
    if (this.redis) {
      try {
        const key = `report:latest:${report.target.url || report.target.repoPath}`;
        await this.redis.set(key, JSON.stringify(report), 'EX', 86400 * 30); // 30 day TTL

        // Add to trend set
        const trendKey = `trend:${report.target.url || report.target.repoPath}`;
        await this.redis.zadd(trendKey, report.generatedAt.getTime(), JSON.stringify({
          date: report.generatedAt,
          score: report.kpiScore.overallScore,
          security: report.kpiScore.grades.security.rawScore,
          performance: report.kpiScore.grades.performance.rawScore,
          codeQuality: report.kpiScore.grades.codeQuality.rawScore,
        }));
        this.logger.info('Report cached in Redis');
      } catch (error) {
        this.logger.error('Failed to cache report in Redis', { error: String(error) });
      }
    }

    // Fallback: save to local filesystem
    if (!this.pg && !this.redis) {
      const fs = require('fs');
      const path = require('path');
      const dir = path.join(process.cwd(), 'scan-results');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const filename = `${report.scanId}_${report.generatedAt.toISOString().replace(/[:.]/g, '-')}.json`;
      fs.writeFileSync(path.join(dir, filename), JSON.stringify(report, null, 2));
      this.logger.info(`Report saved to file: ${filename}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Get Latest Report
  // ---------------------------------------------------------------------------
  async getLatestReport(target: string): Promise<ScanReport | null> {
    await this.ensureSchema();

    // Try Redis first
    if (this.redis) {
      try {
        const cached = await this.redis.get(`report:latest:${target}`);
        if (cached) return JSON.parse(cached);
      } catch (error) {
        this.logger.warn('Redis lookup failed', { error: String(error) });
      }
    }

    // Fall back to PostgreSQL
    if (this.pg) {
      try {
        const result = await this.pg.query(
          `SELECT report_json FROM scan_reports
           WHERE target_url = $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [target],
        );
        if (result.rows[0]) return result.rows[0].report_json;
      } catch (error) {
        this.logger.warn('PostgreSQL lookup failed', { error: String(error) });
      }
    }

    // Fall back to file system — filter by target URL
    try {
      const fs = require('fs');
      const path = require('path');
      const dir = path.join(process.cwd(), 'scan-results');
      if (!fs.existsSync(dir)) return null;

      const files = fs.readdirSync(dir)
        .filter((f: string) => f.endsWith('.json'))
        .sort()
        .reverse();

      for (const file of files) {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        const report = JSON.parse(content);
        const reportTarget = report.target?.url || report.target?.repoPath || '';
        if (reportTarget === target) {
          return report;
        }
      }
    } catch {
      // No previous results
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Get Trend Data
  // ---------------------------------------------------------------------------
  async getTrend(target: string, days: number = 30): Promise<{ date: Date; score: number }[]> {
    // Try Redis first
    if (this.redis) {
      try {
        const since = Date.now() - days * 86400 * 1000;
        const results = await this.redis.zrangebyscore(`trend:${target}`, since, '+inf');
        if (results.length > 0) {
          return results.map((r) => JSON.parse(r));
        }
        // Redis returned empty — fall through to PostgreSQL
      } catch {
        // Redis error — fall through
      }
    }

    // Fall back to PostgreSQL for historical data
    if (this.pg) {
      try {
        const result = await this.pg.query(
          `SELECT created_at as date, overall_score as score,
                  security_score as security, performance_score as performance,
                  code_quality_score as "codeQuality"
           FROM scan_reports
           WHERE target_url = $1 AND created_at > NOW() - INTERVAL '${days} days'
           ORDER BY created_at`,
          [target],
        );
        return result.rows;
      } catch {
        // Fall through
      }
    }

    return [];
  }

  // ---------------------------------------------------------------------------
  // Database Schema Setup
  // ---------------------------------------------------------------------------
  async initializeSchema(): Promise<void> {
    if (!this.pg) return;

    await this.pg.query(`
      CREATE TABLE IF NOT EXISTS scan_reports (
        id VARCHAR(100) PRIMARY KEY,
        scan_id VARCHAR(100) NOT NULL,
        target_url TEXT NOT NULL,
        platform VARCHAR(20) NOT NULL,
        overall_score DECIMAL(5,2) NOT NULL,
        security_score DECIMAL(5,2),
        performance_score DECIMAL(5,2),
        code_quality_score DECIMAL(5,2),
        critical_findings_count INTEGER DEFAULT 0,
        report_json JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

        -- Indexes for common queries
        CONSTRAINT idx_target_date UNIQUE (target_url, created_at)
      );

      CREATE INDEX IF NOT EXISTS idx_scan_reports_target ON scan_reports(target_url);
      CREATE INDEX IF NOT EXISTS idx_scan_reports_date ON scan_reports(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_scan_reports_score ON scan_reports(overall_score);
    `);

    this.logger.info('Database schema initialized');
  }
}
