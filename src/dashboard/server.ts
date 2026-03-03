// ============================================================================
// Dashboard API Server - REST API + Auth + User Management
// ============================================================================

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { Server } from 'socket.io';
import http from 'http';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import OpenAI from 'openai';
import { Logger } from '../utils/logger';
import { ResultStore } from '../store/result-store';
import { Orchestrator } from '../orchestrator';

const logger = new Logger('dashboard');
const store = new ResultStore();

// Prevent Lighthouse / Puppeteer uncaught exceptions from crashing the server
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception (kept alive)', { error: String(err), stack: err.stack?.substring(0, 500) });
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection (kept alive)', { error: String(reason) });
});

// Track running scans so we can abort them
const runningScans = new Map<string, { orchestrator: Orchestrator; abortController: AbortController }>();

// ---------------------------------------------------------------------------
// Scan Queue System — System-wide FIFO queue with max concurrency
// ---------------------------------------------------------------------------
interface QueuedScanJob {
  jobId: string;
  scanId: string;
  type: 'single' | 'batch-entry';
  batchId?: string;
  url: string;
  config: any;
  userEmail: string;
  userName: string;
  userId: string;
  status: 'queued' | 'running' | 'completed' | 'error';
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  score?: number;
  error?: string;
}

// On 4-vCPU/8GB EC2: only 1 concurrent scan to avoid Chrome resource contention.
// Each scan needs multiple Chrome instances (Lighthouse, CWV, CDN, Resource)
// and Lighthouse requires stable CPU/memory for accurate trace collection.
// Increase to 2 when running on 8+ vCPU instances.
const MAX_CONCURRENT_SCANS = 1;
const scanQueue: QueuedScanJob[] = [];
const activeJobs = new Map<string, {
  job: QueuedScanJob;
  orchestrator: Orchestrator;
  abortController: AbortController;
}>();

function broadcastQueueStatus(): void {
  const status = {
    activeScans: Array.from(activeJobs.values()).map(({ job }) => ({
      scanId: job.scanId,
      url: job.url,
      userEmail: job.userEmail,
      userName: job.userName,
      startedAt: job.startedAt,
      batchId: job.batchId,
    })),
    queuedScans: scanQueue.filter(j => j.status === 'queued').map(j => ({
      jobId: j.jobId,
      scanId: j.scanId,
      url: j.url,
      userEmail: j.userEmail,
      userName: j.userName,
      queuedAt: j.queuedAt,
      batchId: j.batchId,
    })),
    maxConcurrent: MAX_CONCURRENT_SCANS,
    activeCount: activeJobs.size,
    queueLength: scanQueue.filter(j => j.status === 'queued').length,
  };
  io.emit('queue:status', status);
}

function emitBatchProgress(job: QueuedScanJob): void {
  if (!job.batchId) return;
  const batchJobs = scanQueue.filter(j => j.batchId === job.batchId);
  const completed = batchJobs.filter(j => j.status === 'completed').length;
  const errored = batchJobs.filter(j => j.status === 'error').length;

  io.emit('batch:progress', {
    batchId: job.batchId,
    current: completed + errored,
    total: batchJobs.length,
    scanId: job.scanId,
    url: job.url,
    status: job.status,
    score: job.score,
    error: job.error,
  });
}

function checkBatchComplete(batchId: string): void {
  const batchJobs = scanQueue.filter(j => j.batchId === batchId);
  const allDone = batchJobs.every(j => j.status === 'completed' || j.status === 'error');
  if (allDone) {
    io.emit('batch:complete', { batchId, total: batchJobs.length });
    logger.info(`Batch scan completed: ${batchId} (${batchJobs.length} URLs)`);
  }
}

/**
 * Cleanup after a timed-out or aborted scan.
 * NOTE: We do NOT pkill all Chrome processes — that would kill other concurrent scans' Chrome.
 * Each agent's teardown handles its own Chrome instances via chrome-launcher .kill() and puppeteer .close().
 * This function only logs the event; the agent teardown (with 10s timeout guard) handles the actual cleanup.
 */
function logScanCleanup(scanId: string, reason: string): void {
  logger.info(`Scan cleanup: ${scanId} (${reason}) — agent teardown will handle Chrome processes`);
}

async function executeScanJob(
  job: QueuedScanJob,
  orchestrator: Orchestrator,
  abortController: AbortController,
): Promise<void> {
  const TIMEOUT = 480_000; // 8 minutes (increased: LH retries + 2 platforms + CWV)
  let timeoutHandle: NodeJS.Timeout | undefined;
  let timedOut = false;

  // Wire up real-time progress events → WebSocket
  orchestrator.onProgress((phase, agentType, progress, status) => {
    io.emit('scan:progress', {
      scanId: job.scanId,
      agent: agentType,
      progress,
      status,
      phase,
    });
  });

  try {
    const report = await Promise.race([
      orchestrator.runScan(job.config),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          reject(new Error(`Scan timeout after 8 minutes`));
        }, TIMEOUT);
      }),
    ]);

    if (timeoutHandle) clearTimeout(timeoutHandle);

    if (!abortController.signal.aborted) {
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      job.score = report.kpiScore.overallScore;

      io.emit('scan:complete', {
        scanId: job.scanId,
        url: job.url,
        score: report.kpiScore.overallScore,
        status: report.kpiScore.passesThreshold ? 'pass' : 'fail',
        batchId: job.batchId,
        userEmail: job.userEmail,
        userName: job.userName,
      });

      if (job.batchId) {
        emitBatchProgress(job);
      }

      logger.info(`Scan completed: ${job.url} → ${report.kpiScore.overallScore} (by ${job.userEmail})`);
    }
  } catch (error) {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    const errMsg = error instanceof Error ? error.message : String(error);
    job.status = 'error';
    job.completedAt = new Date().toISOString();
    job.error = errMsg;

    io.emit('scan:error', {
      scanId: job.scanId,
      url: job.url,
      error: abortController.signal.aborted ? 'Scan aborted by user' : errMsg,
      batchId: job.batchId,
      userEmail: job.userEmail,
    });

    if (job.batchId) {
      emitBatchProgress(job);
    }

    // Log cleanup — agent teardown handles Chrome via pid-specific .kill()/.close()
    if (timedOut || abortController.signal.aborted) {
      logScanCleanup(job.scanId, timedOut ? 'timeout' : 'aborted');
    }

    logger.error(`Scan failed: ${job.url}`, { error: errMsg });
  } finally {
    activeJobs.delete(job.scanId);
    runningScans.delete(job.scanId);
    broadcastQueueStatus();

    // Check if batch is complete
    if (job.batchId) {
      checkBatchComplete(job.batchId);
    }

    // Process next in queue
    processQueue();
  }
}

function processQueue(): void {
  while (activeJobs.size < MAX_CONCURRENT_SCANS) {
    const nextJob = scanQueue.find(j => j.status === 'queued');
    if (!nextJob) break;

    nextJob.status = 'running';
    nextJob.startedAt = new Date().toISOString();

    const orchestrator = new Orchestrator();
    const abortController = new AbortController();
    activeJobs.set(nextJob.scanId, { job: nextJob, orchestrator, abortController });
    // Also update the legacy runningScans map for abort endpoint compatibility
    runningScans.set(nextJob.scanId, { orchestrator, abortController });

    broadcastQueueStatus();

    // Notify the specific user their scan started
    io.to(`user:${nextJob.userId}`).emit('scan:started', {
      scanId: nextJob.scanId,
      jobId: nextJob.jobId,
      url: nextJob.url,
    });

    logger.info(`Scan started: ${nextJob.url} (by ${nextJob.userEmail}, queue: ${scanQueue.filter(j => j.status === 'queued').length} remaining)`);

    // Run scan asynchronously (don't await)
    executeScanJob(nextJob, orchestrator, abortController);
  }
}

// Queue cleanup — remove completed/errored jobs older than 1 hour every 10 minutes
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  let removed = 0;
  while (
    scanQueue.length > 0 &&
    (scanQueue[0].status === 'completed' || scanQueue[0].status === 'error') &&
    new Date(scanQueue[0].completedAt || scanQueue[0].queuedAt).getTime() < oneHourAgo
  ) {
    scanQueue.shift();
    removed++;
  }
  if (removed > 0) {
    logger.info(`Queue cleanup: removed ${removed} old entries`);
  }
}, 10 * 60 * 1000);

const JWT_SECRET = process.env.JWT_SECRET || 'vzy-dashboard-secret-key-2026';
const JWT_EXPIRES_IN = '24h';
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// ---------------------------------------------------------------------------
// PostgreSQL Connection
// ---------------------------------------------------------------------------
const pg = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://vzy:changeme@localhost:5432/vzy_agent',
});

// ---------------------------------------------------------------------------
// Express Setup
// ---------------------------------------------------------------------------
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(helmet());
app.use(express.json());
app.use(express.static('dashboard-ui'));

// ---------------------------------------------------------------------------
// JWT Auth Middleware
// ---------------------------------------------------------------------------
interface AuthRequest extends Request {
  user?: { id: string; email: string; name: string; role: string };
}

function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; name: string; role: string };
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Database Initialization: Users Table + Default Admin
// ---------------------------------------------------------------------------
async function initializeAuthDB() {
  try {
    // Create users table
    await pg.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'developer',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_login TIMESTAMP WITH TIME ZONE,
        created_by UUID REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    `);

    // Create scan_reports table if not exists
    await pg.query(`
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
    `);

    // Seed default admin if no users exist
    const userCount = await pg.query('SELECT COUNT(*) FROM users');
    if (parseInt(userCount.rows[0].count) === 0) {
      const adminPassword = await bcrypt.hash('admin123', 12);
      const devopsPassword = await bcrypt.hash('devops123', 12);
      const devPassword = await bcrypt.hash('dev123', 12);
      const execPassword = await bcrypt.hash('exec123', 12);

      await pg.query(
        `INSERT INTO users (email, name, password_hash, role) VALUES
          ($1, $2, $3, $4),
          ($5, $6, $7, $8),
          ($9, $10, $11, $12),
          ($13, $14, $15, $16)`,
        [
          'admin@dishtv.in', 'Admin User', adminPassword, 'admin',
          'devops@dishtv.in', 'DevOps Engineer', devopsPassword, 'devops',
          'dev@dishtv.in', 'Developer', devPassword, 'developer',
          'exec@dishtv.in', 'Executive', execPassword, 'executive',
        ],
      );
      logger.info('Default users seeded: admin@dishtv.in / admin123');
    }

    logger.info('Auth database initialized');
  } catch (error) {
    logger.error('Failed to initialize auth DB', { error: String(error) });
  }
}

// ============================= AUTH ROUTES =================================

// Login
app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const result = await pg.query(
      'SELECT id, email, name, password_hash, role, is_active FROM users WHERE email = $1',
      [email.toLowerCase()],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated. Contact your administrator.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    await pg.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN },
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });

    logger.info(`User logged in: ${user.email} [${user.role}]`);
  } catch (error) {
    logger.error('Login error', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user
app.get('/api/auth/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pg.query(
      'SELECT id, email, name, role, is_active, created_at, last_login FROM users WHERE id = $1',
      [req.user!.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================= USER MANAGEMENT (Admin Only) =================

// List all users
app.get('/api/auth/users', authMiddleware, requireRole('admin'), async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pg.query(
      `SELECT id, email, name, role, is_active, created_at, last_login, updated_at
       FROM users ORDER BY created_at ASC`,
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('Failed to list users', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new user
app.post('/api/auth/users', authMiddleware, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const { email, name, password, role } = req.body;

  if (!email || !name || !password || !role) {
    return res.status(400).json({ error: 'email, name, password, and role are required' });
  }

  const validRoles = ['admin', 'devops', 'developer', 'executive'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
  }

  try {
    // Check for existing email
    const existing = await pg.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pg.query(
      `INSERT INTO users (email, name, password_hash, role, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, name, role, is_active, created_at`,
      [email.toLowerCase(), name, passwordHash, role, req.user!.id],
    );

    logger.info(`User created by ${req.user!.email}: ${email} [${role}]`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Failed to create user', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a user
app.put('/api/auth/users/:id', authMiddleware, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, role, is_active, password } = req.body;

  try {
    // Prevent admin from deactivating themselves
    if (id === req.user!.id && is_active === false) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (role !== undefined) {
      const validRoles = ['admin', 'devops', 'developer', 'executive'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
      }
      updates.push(`role = $${paramIndex++}`);
      values.push(role);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      updates.push(`password_hash = $${paramIndex++}`);
      values.push(hash);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pg.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, email, name, role, is_active, created_at, updated_at, last_login`,
      values,
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    logger.info(`User updated by ${req.user!.email}: ${result.rows[0].email}`);
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Failed to update user', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a user
app.delete('/api/auth/users/:id', authMiddleware, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  if (id === req.user!.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  try {
    const result = await pg.query(
      'DELETE FROM users WHERE id = $1 RETURNING id, email',
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    logger.info(`User deleted by ${req.user!.email}: ${result.rows[0].email}`);
    res.json({ message: 'User deleted', id: result.rows[0].id });
  } catch (error) {
    logger.error('Failed to delete user', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================= EXISTING API ENDPOINTS =======================

// Get latest scan report
app.get('/api/reports/latest', async (req, res) => {
  const target = req.query.target as string;
  if (!target) return res.status(400).json({ error: 'target query param required' });

  const report = await store.getLatestReport(target);
  if (!report) return res.status(404).json({ error: 'No reports found' });
  res.json(report);
});

// Get trend data
app.get('/api/trends', async (req, res) => {
  const target = req.query.target as string;
  const days = parseInt(req.query.days as string) || 30;

  if (!target) return res.status(400).json({ error: 'target query param required' });

  const trend = await store.getTrend(target, days);
  res.json(trend);
});

// Trigger manual scan (goes through the queue)
app.post('/api/scans', authMiddleware, requireRole('admin', 'devops') as any, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { url, repoPath, agents, platform } = req.body;

  if (!url && !repoPath) {
    return res.status(400).json({ error: 'url or repoPath required' });
  }

  const config = Orchestrator.createConfig({ url, repoPath, agents, platform, thresholds: systemConfig.thresholds });

  const job: QueuedScanJob = {
    jobId: `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    scanId: config.id,
    type: 'single',
    url: url || repoPath || '',
    config,
    userEmail: authReq.user!.email,
    userName: authReq.user!.name,
    userId: authReq.user!.id,
    status: 'queued',
    queuedAt: new Date().toISOString(),
  };

  scanQueue.push(job);
  const position = scanQueue.filter(j => j.status === 'queued').length;
  logger.info(`Scan queued by ${authReq.user!.email}: ${job.url} (position: ${position})`);

  res.json({
    status: activeJobs.size < MAX_CONCURRENT_SCANS ? 'started' : 'queued',
    scanId: config.id,
    jobId: job.jobId,
    queuePosition: position,
  });

  // Trigger queue processor
  processQueue();
});

// Batch scan — decompose into individual queue entries (queue handles concurrency)
app.post('/api/scans/batch', authMiddleware, requireRole('admin', 'devops') as any, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const { urls, agents, platform } = req.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'urls array required' });
  }

  if (urls.length > 20) {
    return res.status(400).json({ error: 'Maximum 20 URLs per batch' });
  }

  const batchId = `batch_${Date.now()}`;

  // De-duplicate and trim URLs
  const uniqueUrls = [...new Set(urls.map((u: string) => u.trim()).filter(Boolean))];

  const scanEntries = uniqueUrls.map((url: string) => {
    const config = Orchestrator.createConfig({ url, agents, platform, thresholds: systemConfig.thresholds });
    const job: QueuedScanJob = {
      jobId: `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      scanId: config.id,
      type: 'batch-entry',
      batchId,
      url,
      config,
      userEmail: authReq.user!.email,
      userName: authReq.user!.name,
      userId: authReq.user!.id,
      status: 'queued',
      queuedAt: new Date().toISOString(),
    };
    scanQueue.push(job);
    return { url, scanId: config.id, status: 'queued' };
  });

  logger.info(`Batch ${batchId} queued by ${authReq.user!.email}: ${uniqueUrls.length} URLs`);

  res.json({
    batchId,
    total: scanEntries.length,
    scans: scanEntries,
  });

  io.emit('batch:start', { batchId, total: scanEntries.length, userEmail: authReq.user!.email, userName: authReq.user!.name });
  processQueue();
});

// Abort a running or queued scan
app.post('/api/scans/:scanId/abort', authMiddleware, requireRole('admin', 'devops') as any, async (req: AuthRequest, res: Response) => {
  const { scanId } = req.params;

  // Check if it's a queued (not yet running) scan — just remove from queue
  const queuedIdx = scanQueue.findIndex(j => j.scanId === scanId && j.status === 'queued');
  if (queuedIdx !== -1) {
    const job = scanQueue[queuedIdx];
    job.status = 'error';
    job.error = 'Scan aborted by user';
    job.completedAt = new Date().toISOString();
    io.emit('scan:error', { scanId, url: job.url, error: 'Scan aborted by user', batchId: job.batchId });
    broadcastQueueStatus();
    if (job.batchId) checkBatchComplete(job.batchId);
    logger.info(`Queued scan aborted by ${req.user!.email}: ${scanId}`);
    return res.json({ message: 'Queued scan aborted', scanId });
  }

  // Check if it's a running scan
  const running = runningScans.get(scanId);
  if (!running) {
    return res.status(404).json({ error: 'Scan not found or already completed' });
  }

  try {
    // Signal abort
    running.abortController.abort();

    // Try to stop the orchestrator if it has a cancel method
    if (typeof (running.orchestrator as any).cancel === 'function') {
      await (running.orchestrator as any).cancel();
    }

    runningScans.delete(scanId);
    io.emit('scan:error', { scanId, error: 'Scan aborted by user' });

    logger.info(`Scan aborted by ${req.user!.email}: ${scanId}`);
    res.json({ message: 'Scan aborted', scanId });
  } catch (error) {
    logger.error('Failed to abort scan', { error: String(error), scanId });
    res.status(500).json({ error: 'Failed to abort scan' });
  }
});

// Get current queue status (REST endpoint for initial page load)
app.get('/api/scans/queue', authMiddleware as any, async (_req: AuthRequest, res: Response) => {
  res.json({
    activeScans: Array.from(activeJobs.values()).map(({ job }) => ({
      scanId: job.scanId,
      url: job.url,
      userEmail: job.userEmail,
      userName: job.userName,
      startedAt: job.startedAt,
      batchId: job.batchId,
    })),
    queuedScans: scanQueue.filter(j => j.status === 'queued').map(j => ({
      jobId: j.jobId,
      scanId: j.scanId,
      url: j.url,
      userEmail: j.userEmail,
      userName: j.userName,
      queuedAt: j.queuedAt,
      batchId: j.batchId,
    })),
    maxConcurrent: MAX_CONCURRENT_SCANS,
    activeCount: activeJobs.size,
    queueLength: scanQueue.filter(j => j.status === 'queued').length,
  });
});

// ============================= REPORT ENDPOINTS ==============================

// Get report by scan ID
app.get('/api/reports/:scanId', async (req, res) => {
  const { scanId } = req.params;
  try {
    const result = await pg.query(
      'SELECT report_json FROM scan_reports WHERE scan_id = $1 LIMIT 1',
      [scanId],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Report not found' });
    res.json(result.rows[0].report_json);
  } catch (error) {
    logger.error('Failed to get report', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get report history with optional target filter
app.get('/api/reports', async (req, res) => {
  const target = req.query.target as string;
  const limit = parseInt(req.query.limit as string) || 20;
  try {
    let query: string;
    let params: any[];
    if (target) {
      query = 'SELECT report_json FROM scan_reports WHERE target_url = $1 ORDER BY created_at DESC LIMIT $2';
      params = [target, limit];
    } else {
      query = 'SELECT report_json FROM scan_reports ORDER BY created_at DESC LIMIT $1';
      params = [limit];
    }
    const result = await pg.query(query, params);
    res.json(result.rows.map((r: any) => r.report_json));
  } catch (error) {
    logger.error('Failed to get reports', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================= SYSTEM CONFIG =================================

// In-memory config (persistent via PostgreSQL in production)
let systemConfig = {
  schedule: { cron: '0 2 * * *', timezone: 'Asia/Kolkata', enabled: true },
  thresholds: { overall: 95, security: 90, performance: 95, codeQuality: 85 },
  notifications: {
    slack: { enabled: false, channel: '#ott-monitoring' },
    email: { enabled: false, recipients: ['cto@dishtv.in'] },
    jira: { enabled: false, projectKey: 'OTT', autoCreate: false },
  },
};

// Load config from DB on startup
async function loadSystemConfig() {
  try {
    await pg.query(`
      CREATE TABLE IF NOT EXISTS system_config (
        key VARCHAR(50) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    const result = await pg.query("SELECT value FROM system_config WHERE key = 'main'");
    if (result.rows.length > 0) {
      systemConfig = { ...systemConfig, ...result.rows[0].value };
    }
  } catch {
    // Use defaults
  }
}

app.get('/api/config', authMiddleware as any, async (_req, res) => {
  res.json(systemConfig);
});

app.patch('/api/config', authMiddleware as any, requireRole('admin', 'devops') as any, async (req: AuthRequest, res: Response) => {
  try {
    systemConfig = { ...systemConfig, ...req.body };
    await pg.query(
      `INSERT INTO system_config (key, value, updated_at) VALUES ('main', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify(systemConfig)],
    );
    logger.info(`Config updated by ${req.user!.email}`);
    res.json(systemConfig);
  } catch (error) {
    logger.error('Failed to save config', { error: String(error) });
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// ============================= WEBHOOK LOGS ==================================

app.get('/api/webhooks/logs', authMiddleware as any, async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  try {
    // Create webhook_logs table if not exists
    await pg.query(`
      CREATE TABLE IF NOT EXISTS webhook_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        event VARCHAR(100) NOT NULL,
        source VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL,
        payload JSONB DEFAULT '{}'
      )
    `);
    const result = await pg.query(
      'SELECT id, timestamp, event, source, status, payload FROM webhook_logs ORDER BY timestamp DESC LIMIT $1',
      [limit],
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('Failed to get webhook logs', { error: String(error) });
    res.json([]); // Return empty array on failure so frontend doesn't crash
  }
});

// ============================= JIRA INTEGRATION ==============================

app.post('/api/jira/create', authMiddleware as any, requireRole('admin', 'devops') as any, async (req: AuthRequest, res: Response) => {
  const { findingId } = req.body;
  if (!findingId) return res.status(400).json({ error: 'findingId required' });

  // Placeholder - would connect to actual Jira API with JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN
  const ticketId = `OTT-${Math.floor(Math.random() * 9000) + 1000}`;
  logger.info(`Jira ticket created: ${ticketId} for finding ${findingId} by ${req.user!.email}`);
  res.json({ ticketId, url: `${process.env.JIRA_HOST || 'https://dishtv.atlassian.net'}/browse/${ticketId}` });
});

// ============================= AI CHAT ENDPOINT ==============================

// List available scan reports for chat context selection
app.get('/api/chat/reports', authMiddleware as any, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pg.query(
      `SELECT scan_id, target_url, created_at, overall_score,
              report_json->'platform' as platform
       FROM scan_reports ORDER BY created_at DESC LIMIT 20`,
    );
    const reports = result.rows.map((r: any) => ({
      scanId: r.scan_id,
      target: r.target_url,
      score: r.overall_score != null ? Number(r.overall_score) : null,
      platform: r.platform ? String(r.platform).replace(/"/g, '') : null,
      createdAt: r.created_at,
    }));
    res.json({ reports });
  } catch (error) {
    logger.error('Chat reports list error', { error: String(error) });
    res.status(500).json({ error: 'Failed to list reports' });
  }
});

app.post('/api/chat', authMiddleware as any, async (req: AuthRequest, res: Response) => {
  const { message, mode, scanId, history } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  if (!mode || !['developer', 'management'].includes(mode)) {
    return res.status(400).json({ error: 'mode must be "developer" or "management"' });
  }

  try {
    // Load full scan report context if scanId is provided
    let reportData: any = null;
    if (scanId) {
      const result = await pg.query(
        'SELECT report_json FROM scan_reports WHERE scan_id = $1',
        [scanId],
      );
      if (result.rows.length > 0) {
        reportData = result.rows[0].report_json;
      }
    }

    // If OpenAI is not configured, return fallback
    if (!openai) {
      return res.json({
        reply: 'AI chat requires an OpenAI API key. Configure OPENAI_API_KEY in your environment to enable the AI assistant.',
        mode,
      });
    }

    // Build rich system prompt based on mode
    const basePrompt = mode === 'developer'
      ? `You are an expert OTT platform security and performance analyst assistant.
Your role: Help developers understand vulnerabilities, performance issues, and code quality problems.
Response format requirements:
- Use markdown headings (##, ###) to structure responses
- Use **bold** for severity levels and key terms
- Use bullet points for lists
- Include code blocks with language tags when showing code fixes
- Tag findings by priority: **[CRITICAL]**, **[HIGH]**, **[MEDIUM]**, **[LOW]**
- Provide: root cause analysis, remediation steps, code-level suggestions
- Reference specific findings from the scan report by title
- Be specific and technical, cite evidence from the report`
      : `You are an executive briefing assistant for OTT platform risk analysis.
Your role: Translate technical findings into business language for management.
Response format requirements:
- Use markdown headings (##, ###) to structure responses
- Use **bold** for risk levels and key metrics
- Structure as: Executive Summary → Risk Classification → Business Impact → Recommendations
- Tag risks: **[CRITICAL RISK]**, **[HIGH RISK]**, **[MEDIUM RISK]**, **[LOW RISK]**
- Include estimated financial/customer impact where possible
- Provide: compliance status, strategic recommendations, priority actions
- Focus on ROI, customer impact, regulatory exposure
- Use clear non-technical language`;

    const messages: any[] = [
      { role: 'system', content: basePrompt },
    ];

    // Add deep report context if available
    if (reportData) {
      const kpi = reportData.kpiScore || {};
      const grades = kpi.grades || {};

      // Build comprehensive context with all agent data
      const deepContext: any = {
        target: reportData.target,
        platform: reportData.platform,
        generatedAt: reportData.generatedAt,
        scores: {
          overall: kpi.overallScore,
          passesThreshold: kpi.passesThreshold,
          security: { raw: grades.security?.rawScore, weighted: grades.security?.weightedScore, weight: '40%' },
          performance: { raw: grades.performance?.rawScore, weighted: grades.performance?.weightedScore, weight: '35%' },
          codeQuality: { raw: grades.codeQuality?.rawScore, weighted: grades.codeQuality?.weightedScore, weight: '25%' },
        },
        executiveSummary: reportData.executiveSummary,
        trend: kpi.trend ? { direction: kpi.trend.direction, delta: kpi.trend.delta } : null,
        regressions: (kpi.regressions || []).map((r: any) => ({
          metric: r.metric, previous: r.previousValue, current: r.currentValue, delta: r.delta, severity: r.severity,
        })),
        criticalFindings: (reportData.criticalFindings || []).slice(0, 25).map((f: any) => ({
          title: f.title, severity: f.severity, agent: f.agent, category: f.category,
          evidence: f.evidence?.substring(0, 200),
          remediation: f.remediation?.substring(0, 250),
          cweId: f.cweId, cvssScore: f.cvssScore,
        })),
        recommendations: (reportData.recommendations || []).map((r: any) => ({
          priority: r.priority, title: r.title, description: r.description,
          impact: r.impact, effort: r.effort, category: r.category,
        })),
      };

      // Add agent-specific metadata summaries
      const agentResults = reportData.agentResults || [];
      for (const agent of agentResults) {
        if (agent.agentType === 'security' && agent.metadata) {
          const m = agent.metadata;
          deepContext.securityDetails = {
            sslGrade: m.sslAnalysis?.grade,
            sslIssues: m.sslAnalysis?.issues,
            headerScore: m.headerAnalysis?.score,
            missingHeaders: m.headerAnalysis?.missing,
            corsIssues: m.corsAnalysis?.issues,
            corsWildcard: m.corsAnalysis?.wildcardDetected,
            tokenLeaks: (m.tokenLeaks || []).map((t: any) => ({ type: t.type, location: t.location, severity: t.severity })),
            drmAnalysis: m.drmAnalysis,
            owaspFindings: (m.owaspFindings || []).slice(0, 10).map((o: any) => ({
              category: o.category, name: o.name, risk: o.risk, details: o.details?.substring(0, 100),
            })),
            dependencyVulns: (m.dependencyVulns || []).slice(0, 10).map((d: any) => ({
              package: d.package, version: d.version, vulnerability: d.vulnerability,
              severity: d.severity, cveId: d.cveId, fixVersion: d.fixVersion,
            })),
            apiExposure: (m.apiExposure || []).slice(0, 10).map((a: any) => ({
              endpoint: a.endpoint, method: a.method, authenticated: a.authenticated, issues: a.issues,
            })),
          };
        }
        if (agent.agentType === 'performance' && agent.metadata) {
          const m = agent.metadata;
          deepContext.performanceDetails = {
            lighthouse: m.lighthouse,
            coreWebVitals: m.coreWebVitals,
            playerMetrics: m.playerMetrics,
            cdnMetrics: m.cdnMetrics ? {
              hitRatio: m.cdnMetrics.hitRatio, avgLatency: m.cdnMetrics.avgLatency,
              p95Latency: m.cdnMetrics.p95Latency, compression: m.cdnMetrics.compressionEnabled,
            } : null,
            resourceMetrics: m.resourceMetrics ? {
              totalSize: m.resourceMetrics.totalSize, jsSize: m.resourceMetrics.jsSize,
              cssSize: m.resourceMetrics.cssSize, imageSize: m.resourceMetrics.imageSize,
              requestCount: m.resourceMetrics.requestCount,
              renderBlockingCount: m.resourceMetrics.renderBlockingResources?.length,
            } : null,
          };
        }
        if (agent.agentType === 'code-quality' && agent.metadata) {
          const m = agent.metadata;
          deepContext.codeQualityDetails = {
            lintResults: m.lintResults,
            complexity: m.complexity,
            deadCodeCount: m.deadCode?.length,
            memoryLeaks: (m.memoryLeaks || []).slice(0, 5).map((l: any) => ({
              type: l.type, file: l.file, description: l.description, severity: l.severity,
            })),
            asyncIssues: (m.asyncIssues || []).slice(0, 5).map((a: any) => ({
              type: a.type, file: a.file, description: a.description,
            })),
            antiPatterns: (m.antiPatterns || []).slice(0, 5).map((p: any) => ({
              pattern: p.pattern, file: p.file, suggestion: p.suggestion,
            })),
          };
        }
      }

      messages.push({
        role: 'system',
        content: `Here is the complete scan report data. Use this as your primary knowledge base. Answer ONLY based on this data — do not fabricate findings.\n\n${JSON.stringify(deepContext)}`,
      });
    }

    // Add conversation history for multi-turn context (last 10 messages)
    if (Array.isArray(history)) {
      for (const h of history.slice(-10)) {
        if (h.role === 'user' || h.role === 'assistant') {
          messages.push({ role: h.role, content: h.content?.substring(0, 500) });
        }
      }
    }

    messages.push({ role: 'user', content: message });

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
      messages,
      max_tokens: 2000,
      temperature: 0.5,
    });

    const reply = completion.choices[0]?.message?.content || 'No response generated.';

    res.json({ reply, mode });
  } catch (error) {
    logger.error('Chat endpoint error', { error: String(error) });
    res.status(500).json({ error: 'Failed to process chat request' });
  }
});

// ============================= REPORT GENERATION ENDPOINT =====================

app.post('/api/reports/:scanId/generate', authMiddleware as any, requireRole('admin', 'devops', 'developer') as any, async (req: AuthRequest, res: Response) => {
  const { scanId } = req.params;
  const { mode } = req.body;

  if (!mode || !['management', 'developer'].includes(mode)) {
    return res.status(400).json({ error: 'mode must be "management" or "developer"' });
  }

  try {
    // Load scan report from PostgreSQL
    const result = await pg.query(
      'SELECT report_json FROM scan_reports WHERE scan_id = $1',
      [scanId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const reportData = result.rows[0].report_json;

    // If OpenAI is not configured, return a structured fallback
    if (!openai) {
      const overallScore = reportData.kpiScore?.overallScore ?? reportData.overallScore ?? 'N/A';
      const securityScore = reportData.kpiScore?.grades?.security?.rawScore ?? reportData.securityScore ?? 'N/A';
      const performanceScore = reportData.kpiScore?.grades?.performance?.rawScore ?? reportData.performanceScore ?? 'N/A';
      const codeQualityScore = reportData.kpiScore?.grades?.codeQuality?.rawScore ?? reportData.codeQualityScore ?? 'N/A';
      const findings = reportData.criticalFindings || [];
      const recommendations = reportData.recommendations || [];

      const fallbackContent = mode === 'management'
        ? `# Executive Summary\n\n` +
          `**Overall Score:** ${overallScore}/100\n` +
          `**Security Score:** ${securityScore}/100\n` +
          `**Performance Score:** ${performanceScore}/100\n` +
          `**Code Quality Score:** ${codeQualityScore}/100\n\n` +
          `**Critical Findings:** ${findings.length}\n\n` +
          `## Risk Assessment\n\n` +
          (Number(securityScore) < 70 ? '- **HIGH RISK**: Security score below acceptable threshold. Immediate remediation recommended.\n' : '') +
          (Number(performanceScore) < 70 ? '- **MEDIUM RISK**: Performance degradation detected. User experience may be impacted.\n' : '') +
          (Number(codeQualityScore) < 70 ? '- **MEDIUM RISK**: Code quality issues may increase maintenance costs.\n' : '') +
          `\n## Top Recommendations\n` +
          recommendations.slice(0, 5).map((r: any, i: number) => `${i + 1}. ${r.title || r}`).join('\n') +
          `\n\n## Critical Issues Requiring Attention\n` +
          findings.slice(0, 5).map((f: any, i: number) => `${i + 1}. **[${(f.severity || 'info').toUpperCase()}]** ${f.title || f.description || f}`).join('\n') +
          `\n\n*Note: AI-enhanced report generation requires an OpenAI API key. Configure OPENAI_API_KEY for detailed analysis.*`
        : `# Developer Report\n\n` +
          `**Overall Score:** ${overallScore}/100\n` +
          `**Security Score:** ${securityScore}/100\n` +
          `**Performance Score:** ${performanceScore}/100\n` +
          `**Code Quality Score:** ${codeQualityScore}/100\n\n` +
          `## Critical Findings (${findings.length} total)\n\n` +
          findings.slice(0, 15).map((f: any, i: number) => {
            const parts = [`${i + 1}. **[${(f.severity || 'info').toUpperCase()}]** ${f.title || f.description || f}`];
            if (f.evidence) parts.push(`   - Evidence: \`${f.evidence}\``);
            if (f.remediation) parts.push(`   - Fix: ${f.remediation}`);
            if (f.agent) parts.push(`   - Agent: ${f.agent}`);
            return parts.join('\n');
          }).join('\n') +
          `\n\n## Recommendations\n` +
          recommendations.slice(0, 10).map((r: any, i: number) => {
            const parts = [`${i + 1}. **${r.title || r}**`];
            if (r.priority) parts.push(`   - Priority: ${r.priority}`);
            if (r.impact) parts.push(`   - Impact: ${r.impact}`);
            return parts.join('\n');
          }).join('\n') +
          `\n\n*Note: AI-enhanced report generation requires an OpenAI API key. Configure OPENAI_API_KEY for detailed analysis.*`;

      return res.json({
        content: fallbackContent,
        mode,
        scanId,
        generatedAt: new Date().toISOString(),
      });
    }

    // Build a condensed report summary to stay within token limits
    const condensed = {
      target: reportData.target,
      platform: reportData.platform,
      overallScore: reportData.kpiScore?.overallScore,
      grades: {
        security: reportData.kpiScore?.grades?.security,
        performance: reportData.kpiScore?.grades?.performance,
        codeQuality: reportData.kpiScore?.grades?.codeQuality,
      },
      executiveSummary: reportData.executiveSummary,
      criticalFindings: (reportData.criticalFindings || []).slice(0, 20).map((f: any) => ({
        title: f.title, severity: f.severity, agent: f.agent,
        evidence: f.evidence?.substring(0, 150), remediation: f.remediation?.substring(0, 200),
      })),
      recommendations: (reportData.recommendations || []).slice(0, 10).map((r: any) => ({
        title: r.title, priority: r.priority, impact: r.impact, agent: r.agent,
      })),
      regressions: reportData.kpiScore?.regressions,
    };

    // Build system prompt based on mode
    const systemPrompt = mode === 'management'
      ? 'Generate an executive management report for an OTT platform scan. Include: 1) Risk Posture Summary with RAG status, 2) Financial Exposure estimate, 3) Compliance Status (OWASP, PCI-DSS, SOC2), 4) Customer Impact Assessment, 5) Strategic Roadmap with 30/60/90 day timeline, 6) Executive Recommendations (max 5). Use clear business language, no code snippets.'
      : 'Generate a detailed developer report for an OTT platform scan. Include: 1) Vulnerability Deep-Dive with CWE references, 2) Code Fix Patches (show before/after code), 3) Configuration Recommendations (nginx, CDN, headers), 4) Performance Optimization Guide, 5) Dependency Upgrade Path, 6) Architecture Recommendations. Be specific and technical.';

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_REPORT_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(condensed) },
      ],
      max_tokens: 3000,
      temperature: 0.3,
    });

    const content = completion.choices[0]?.message?.content || 'No report generated.';

    res.json({
      content,
      mode,
      scanId,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Report generation error', { error: String(error), scanId });
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ============================= COMPETITIVE COMPARISON ========================

function extractComparisonData(report: any, url: string) {
  const secMeta = report.agentResults?.find((r: any) => r.agentType === 'security')?.metadata || {};
  const perfMeta = report.agentResults?.find((r: any) => r.agentType === 'performance')?.metadata || {};

  return {
    url,
    scanId: report.scanId,
    scannedAt: report.generatedAt,
    overallScore: report.kpiScore?.overallScore || 0,
    securityScore: report.kpiScore?.grades?.security?.rawScore || 0,
    performanceScore: report.kpiScore?.grades?.performance?.rawScore || 0,
    codeQualityScore: report.kpiScore?.grades?.codeQuality?.rawScore || 0,
    sslGrade: secMeta.sslAnalysis?.grade || 'N/A',
    headerScore: secMeta.headerAnalysis?.score || 0,
    missingHeaders: secMeta.headerAnalysis?.missing || [],
    corsIssues: secMeta.corsAnalysis?.issues || [],
    tokenLeakCount: (secMeta.tokenLeaks || []).length,
    dependencyVulnCount: (secMeta.dependencyVulns || []).length,
    drmStatus: {
      widevineDetected: secMeta.drmAnalysis?.widevineDetected || false,
      fairplayDetected: secMeta.drmAnalysis?.fairplayDetected || false,
      licenseUrlExposed: secMeta.drmAnalysis?.licenseUrlExposed || false,
    },
    owaspSummary: (secMeta.owaspFindings || []).reduce((acc: any[], f: any) => {
      const existing = acc.find((a: any) => a.category === f.category);
      if (existing) { existing.count++; } else { acc.push({ category: f.category, risk: f.risk, count: 1 }); }
      return acc;
    }, []),
    lighthouseScores: {
      performance: perfMeta.lighthouse?.performanceScore || 0,
      accessibility: perfMeta.lighthouse?.accessibilityScore || 0,
      bestPractices: perfMeta.lighthouse?.bestPracticesScore || 0,
      seo: perfMeta.lighthouse?.seoScore || 0,
    },
    coreWebVitals: perfMeta.coreWebVitals || {},
    criticalFindingsCount: (report.criticalFindings || []).filter((f: any) => f.severity === 'critical').length,
    highFindingsCount: (report.criticalFindings || []).filter((f: any) => f.severity === 'high').length,
    totalFindingsCount: report.agentResults?.reduce((sum: number, r: any) => sum + (r.findings?.length || 0), 0) || 0,
  };
}

// List all previously scanned URLs for auto-populating competition analysis
app.get('/api/compare/scanned-urls', authMiddleware as any, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await pg.query(
      `SELECT target_url, overall_score, created_at
       FROM scan_reports
       ORDER BY created_at DESC`,
    );

    // Deduplicate by URL, keeping the latest scan for each
    const seen = new Map<string, { url: string; score: number; scannedAt: string }>();
    for (const row of result.rows) {
      if (!seen.has(row.target_url)) {
        seen.set(row.target_url, {
          url: row.target_url,
          score: row.overall_score ?? 0,
          scannedAt: row.created_at,
        });
      }
    }

    res.json({ urls: Array.from(seen.values()) });
  } catch (error) {
    logger.error('Failed to list scanned URLs', { error: String(error) });
    res.status(500).json({ error: 'Failed to list scanned URLs' });
  }
});

// Delete all scan reports for a specific URL
app.delete('/api/compare/scanned-urls', authMiddleware as any, requireRole('admin', 'devops') as any, async (req: AuthRequest, res: Response) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }
  try {
    const result = await pg.query('DELETE FROM scan_reports WHERE target_url = $1', [url]);
    logger.info(`Deleted ${result.rowCount} scan reports for ${url}`);
    res.json({ deleted: result.rowCount, url });
  } catch (error) {
    logger.error('Failed to delete scanned URL', { error: String(error) });
    res.status(500).json({ error: 'Failed to delete scanned URL' });
  }
});

app.post('/api/compare', authMiddleware as any, async (req: AuthRequest, res: Response) => {
  const { primaryUrl, competitorUrls } = req.body;

  if (!primaryUrl || typeof primaryUrl !== 'string') {
    return res.status(400).json({ error: 'primaryUrl is required and must be a string' });
  }
  if (!competitorUrls || !Array.isArray(competitorUrls) || competitorUrls.length < 1 || competitorUrls.length > 19) {
    return res.status(400).json({ error: 'competitorUrls must be an array with 1-19 items' });
  }

  try {
    const allUrls = [primaryUrl, ...competitorUrls];
    const SCAN_TIMEOUT = 5 * 60 * 1000; // 5 minutes

    // For each URL, fetch latest report from DB or trigger a fresh scan
    const reportPromises = allUrls.map(async (url: string) => {
      const dbResult = await pg.query(
        'SELECT report_json, target_url, overall_score, created_at FROM scan_reports WHERE target_url = $1 ORDER BY created_at DESC LIMIT 1',
        [url],
      );

      if (dbResult.rows.length > 0) {
        return dbResult.rows[0].report_json;
      }

      // No existing report — trigger a fresh scan with timeout
      const config = Orchestrator.createConfig({
        url,
        agents: ['security', 'performance', 'code-quality'],
        platform: 'both',
        thresholds: systemConfig.thresholds,
      });
      const orchestrator = new Orchestrator();
      const report = await Promise.race([
        orchestrator.runScan(config),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Scan timeout after 5 minutes for ${url}`)), SCAN_TIMEOUT),
        ),
      ]);
      return report;
    });

    const settled = await Promise.allSettled(reportPromises);

    // Extract comparison data from successful results
    const comparisonResults: any[] = [];
    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      if (result.status === 'fulfilled' && result.value) {
        comparisonResults.push(extractComparisonData(result.value, allUrls[i]));
      } else {
        const errMsg = result.status === 'rejected' ? (result.reason?.message || String(result.reason)) : 'No data returned';
        logger.warn(`Compare: scan failed for ${allUrls[i]}`, { error: errMsg });
        // Return a complete ComparisonSiteData object with zeroed values for failed scans
        comparisonResults.push({
          url: allUrls[i],
          scanId: 'failed',
          scannedAt: new Date().toISOString(),
          overallScore: 0,
          securityScore: 0,
          performanceScore: 0,
          codeQualityScore: 0,
          sslGrade: 'N/A',
          headerScore: 0,
          missingHeaders: [],
          corsIssues: [],
          tokenLeakCount: 0,
          dependencyVulnCount: 0,
          drmStatus: { widevineDetected: false, fairplayDetected: false, licenseUrlExposed: false },
          owaspSummary: [],
          lighthouseScores: { performance: 0, accessibility: 0, bestPractices: 0, seo: 0 },
          coreWebVitals: {},
          criticalFindingsCount: 0,
          highFindingsCount: 0,
          totalFindingsCount: 0,
          error: errMsg,
        });
      }
    }

    const primaryData = comparisonResults[0];
    const competitorData = comparisonResults.slice(1);

    // AI comparison analysis
    let aiAnalysis: any = {};

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        const OpenAIDynamic = (await import('openai')).default;
        const openaiClient = new OpenAIDynamic({ apiKey: openaiKey });

        const condensed = {
          primary: { url: primaryData.url, overall: primaryData.overallScore, security: primaryData.securityScore, performance: primaryData.performanceScore, codeQuality: primaryData.codeQualityScore, ssl: primaryData.sslGrade, headers: primaryData.headerScore, findings: primaryData.totalFindingsCount, critical: primaryData.criticalFindingsCount },
          competitors: competitorData.map((c: any) => ({ url: c.url, overall: c.overallScore, security: c.securityScore, performance: c.performanceScore, codeQuality: c.codeQualityScore, ssl: c.sslGrade, headers: c.headerScore, findings: c.totalFindingsCount, critical: c.criticalFindingsCount })),
        };

        const response = await openaiClient.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: `You are an OTT platform security and performance analyst. Analyze the competitive comparison data and provide a structured JSON response. Return ONLY valid JSON with these fields:
{
  "competitiveGapScore": number (0-100, how far the primary site is from leader in each area),
  "verdict": string (2-3 sentence "Who is Leading?" verdict),
  "leader": string (URL of the overall technical leader),
  "primaryStrengths": string[] (3-5 strengths of primary site),
  "primaryWeaknesses": string[] (3-5 weaknesses of primary site),
  "competitorInsights": [{ "url": string, "strengths": string[], "weaknesses": string[] }],
  "improvementRoadmap": [
    { "timeframe": "30-day", "actions": string[] },
    { "timeframe": "60-day", "actions": string[] },
    { "timeframe": "90-day", "actions": string[] }
  ],
  "strategicSuggestions": string[] (5-7 strategic recommendations),
  "successMatrix": [{ "metric": string, "primary": number, "competitors": [{ "url": string, "value": number }], "leader": string, "gap": number }],
  "riskRating": "low"|"medium"|"high"|"critical",
  "businessImpactScore": number (0-100)
}` },
            { role: 'user', content: `Compare these OTT platforms:\n${JSON.stringify(condensed, null, 2)}` },
          ],
          temperature: 0.3,
          max_tokens: 3000,
        });

        const content = response.choices[0]?.message?.content || '{}';
        aiAnalysis = JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
      } catch (e) {
        logger.warn('Failed to parse AI comparison analysis, using fallback');
      }
    }

    // Fallback if AI analysis is empty (no OpenAI key or parsing failed)
    if (!aiAnalysis.verdict) {
      const allSites = [primaryData, ...competitorData].filter((s: any) => !s.error);
      const leader = allSites.length > 0
        ? allSites.reduce((best: any, s: any) => s.overallScore > best.overallScore ? s : best, allSites[0])
        : primaryData;
      const gap = leader.overallScore - primaryData.overallScore;

      aiAnalysis = {
        competitiveGapScore: Math.max(0, Math.min(100, Math.round(gap * 2))),
        verdict: `${leader.url} leads with a score of ${leader.overallScore.toFixed(1)}. ${primaryData.url} scores ${primaryData.overallScore.toFixed(1)}, trailing by ${gap.toFixed(1)} points.`,
        leader: leader.url,
        primaryStrengths: [primaryData.securityScore >= 80 ? 'Strong security posture' : '', primaryData.performanceScore >= 80 ? 'Good performance metrics' : '', primaryData.codeQualityScore >= 80 ? 'High code quality' : ''].filter(Boolean),
        primaryWeaknesses: [primaryData.securityScore < 70 ? 'Security needs improvement' : '', primaryData.performanceScore < 70 ? 'Performance optimization required' : '', primaryData.codeQualityScore < 70 ? 'Code quality issues detected' : ''].filter(Boolean),
        competitorInsights: competitorData.map((c: any) => ({
          url: c.url,
          strengths: [c.securityScore >= 80 ? 'Strong security' : '', c.performanceScore >= 80 ? 'Good performance' : ''].filter(Boolean),
          weaknesses: [c.securityScore < 70 ? 'Security gaps' : '', c.performanceScore < 70 ? 'Performance issues' : ''].filter(Boolean),
        })),
        improvementRoadmap: [
          { timeframe: '30-day', actions: ['Fix critical security vulnerabilities', 'Optimize Core Web Vitals'] },
          { timeframe: '60-day', actions: ['Implement missing security headers', 'Reduce JavaScript bundle size'] },
          { timeframe: '90-day', actions: ['Achieve target KPI score of 95', 'Full OWASP compliance'] },
        ],
        strategicSuggestions: ['Focus on security hardening to close the gap', 'Optimize CDN configuration for better performance', 'Address DRM protection issues', 'Reduce dependency vulnerabilities', 'Improve Core Web Vitals metrics'],
        successMatrix: [
          { metric: 'Overall Score', primary: primaryData.overallScore, competitors: competitorData.map((c: any) => ({ url: c.url, value: c.overallScore })), leader: leader.url, gap },
          { metric: 'Security', primary: primaryData.securityScore, competitors: competitorData.map((c: any) => ({ url: c.url, value: c.securityScore })), leader: allSites.reduce((b: any, s: any) => s.securityScore > b.securityScore ? s : b, allSites[0]).url, gap: Math.max(...allSites.map((s: any) => s.securityScore)) - primaryData.securityScore },
          { metric: 'Performance', primary: primaryData.performanceScore, competitors: competitorData.map((c: any) => ({ url: c.url, value: c.performanceScore })), leader: allSites.reduce((b: any, s: any) => s.performanceScore > b.performanceScore ? s : b, allSites[0]).url, gap: Math.max(...allSites.map((s: any) => s.performanceScore)) - primaryData.performanceScore },
          { metric: 'Code Quality', primary: primaryData.codeQualityScore, competitors: competitorData.map((c: any) => ({ url: c.url, value: c.codeQualityScore })), leader: allSites.reduce((b: any, s: any) => s.codeQualityScore > b.codeQualityScore ? s : b, allSites[0]).url, gap: Math.max(...allSites.map((s: any) => s.codeQualityScore)) - primaryData.codeQualityScore },
        ],
        riskRating: primaryData.overallScore >= 90 ? 'low' : primaryData.overallScore >= 70 ? 'medium' : primaryData.overallScore >= 50 ? 'high' : 'critical',
        businessImpactScore: Math.round(100 - gap),
      };
    }

    res.json({
      primary: primaryData,
      competitors: competitorData,
      aiAnalysis,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Compare endpoint error', { error: String(error) });
    res.status(500).json({ error: 'Failed to process comparison' });
  }
});

// Health check (public)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ============================= WEBSOCKET ===================================
io.on('connection', (socket) => {
  logger.info(`Dashboard client connected: ${socket.id}`);

  // Join a user-specific room for targeted notifications
  const token = socket.handshake.auth?.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
      socket.join(`user:${decoded.id}`);
      (socket as any).data = { userId: decoded.id, userEmail: decoded.email };
      logger.info(`Socket ${socket.id} joined room user:${decoded.id} (${decoded.email})`);
    } catch {
      // Token invalid; still allow connection for public broadcasts
    }
  }

  // Send current queue status to newly connected client
  broadcastQueueStatus();

  socket.on('disconnect', () => {
    logger.info(`Dashboard client disconnected: ${socket.id}`);
  });
});

// ============================= START SERVER =================================
const PORT = parseInt(process.env.DASHBOARD_PORT || '3000');

async function start() {
  await initializeAuthDB();
  await loadSystemConfig();
  server.listen(PORT, () => {
    logger.info(`Dashboard API running on http://localhost:${PORT}`);
    logger.info(`Default admin credentials: admin@dishtv.in / admin123`);
  });
}

start().catch((err) => {
  logger.error('Failed to start server', { error: String(err) });
  process.exit(1);
});
