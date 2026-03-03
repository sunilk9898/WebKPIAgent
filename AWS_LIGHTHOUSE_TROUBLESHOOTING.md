# AWS Lighthouse Missing Scores - Complete Fix Guide

## Problem
Lighthouse donut charts missing on vzytech.com Performance page because Lighthouse returns score=0.

## Quick Fix (Apply This First)

### Step 1: Update Environment Variable
SSH into your AWS instance:
```bash
ssh -i your-key.pem ubuntu@13.205.146.249
cd /opt/vzy-agent  # or wherever your code is
```

Edit `.env.production` and add:
```bash
LIGHTHOUSE_RUNS=2
```

### Step 2: Rebuild and Restart
```bash
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml build --no-cache agent
docker-compose -f docker-compose.prod.yml up -d
```

### Step 3: Verify Fix
Wait 2 minutes, then trigger a test scan:
```bash
# Get auth token first (login via dashboard or use existing token)
TOKEN="your-jwt-token-here"

# Trigger scan
curl -X POST https://vzytech.com/api/scans \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.vzy.one/", "platform": "desktop", "agents": ["performance"]}'

# Wait 3-4 minutes for scan to complete, then check results
curl -s https://vzytech.com/api/reports | jq '.[0].agentResults[] | select(.agentType=="performance") | .metadata.lighthouse'
```

Expected output:
```json
{
  "performanceScore": 63,
  "accessibilityScore": 89,
  "bestPracticesScore": 78,
  "seoScore": 92,
  "pwaScore": 0
}
```

## If Quick Fix Doesn't Work

### Diagnostic Step 1: Check Chrome Installation
```bash
docker exec -it vzy-agent bash
google-chrome-stable --version
# Should show: Google Chrome 131.x.x.x
```

### Diagnostic Step 2: Check Memory
```bash
# On host
free -h
# Should show at least 2GB available

# Docker container stats
docker stats vzy-agent --no-stream
# MEM USAGE should be under 3GB
```

### Diagnostic Step 3: Check Logs
```bash
docker logs vzy-agent --tail 200 | grep -i lighthouse
# Look for errors like:
# - "LanternError"
# - "Chrome crashed"
# - "Timeout"
# - "score=0"
```

### Diagnostic Step 4: Manual Lighthouse Test
```bash
docker exec -it vzy-agent bash
cd /app
npx lighthouse https://example.com --output json --output-path /tmp/test.json --chrome-flags="--headless=new --no-sandbox --disable-gpu"
cat /tmp/test.json | jq '.categories.performance.score'
# Should show a number like 0.95 (not null)
```

## Advanced Fixes

### Fix 1: Increase Instance Size
If you're on t3.medium (4GB RAM), upgrade to t3.large (8GB RAM):

1. AWS Console → EC2 → Select instance
2. Actions → Instance Settings → Change Instance Type
3. Select t3.large
4. Start instance
5. Rebuild containers

### Fix 2: Reduce Concurrent Scans
Edit `src/dashboard/server.ts` line 50:
```typescript
const MAX_CONCURRENT_SCANS = 1;  // Already set, verify it's 1
```

### Fix 3: Increase Lighthouse Timeout
Edit `src/agents/performance/performance-agent.ts`:

Find the `LIGHTHOUSE_DESKTOP_CONFIG` and `LIGHTHOUSE_MOBILE_CONFIG` objects and add:
```typescript
settings: {
  // ... existing settings
  maxWaitForLoad: 60000,  // Increase from default 45s to 60s
}
```

### Fix 4: Use Simpler Throttling
Edit `src/agents/performance/performance-agent.ts`:

Change throttling method from 'simulate' to 'provided':
```typescript
const LIGHTHOUSE_DESKTOP_CONFIG = {
  extends: 'lighthouse:default' as const,
  settings: {
    formFactor: 'desktop' as const,
    throttlingMethod: 'provided' as const,  // Changed from 'simulate'
    // ... rest of config
  },
};
```

## Production Deployment Checklist

After applying fixes, deploy to production:

```bash
# 1. Commit changes
git add .
git commit -m "fix: Lighthouse AWS configuration for production"
git push origin main

# 2. On AWS instance
cd /opt/vzy-agent
git pull origin main

# 3. Rebuild with no cache
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d

# 4. Monitor logs
docker-compose -f docker-compose.prod.yml logs -f agent

# 5. Trigger test scan via dashboard
# Login at https://vzytech.com
# Go to Control Center → Run Scan
# URL: https://www.vzy.one/
# Platform: Desktop
# Agents: Performance only

# 6. Check Performance page after 3-4 minutes
# Should see Lighthouse donut charts
```

## Monitoring Commands

```bash
# Watch container resources
watch -n 2 'docker stats vzy-agent --no-stream'

# Follow logs in real-time
docker logs vzy-agent -f --tail 50

# Check Lighthouse-specific logs
docker logs vzy-agent 2>&1 | grep -A 5 "Lighthouse"

# Check Chrome processes
docker exec vzy-agent ps aux | grep chrome

# Check disk space
df -h
```

## Expected Behavior After Fix

1. Lighthouse runs complete successfully (not score=0)
2. Performance page shows 5 donut charts:
   - Performance (green/yellow/red)
   - Accessibility (green/yellow/red)
   - Best Practices (green/yellow/red)
   - SEO (green/yellow/red)
   - PWA (green/yellow/red)
3. Scan duration: 3-5 minutes (desktop + mobile)
4. Memory usage: 2-3GB during scan, 500MB idle

## Still Not Working?

If Lighthouse continues to fail after all fixes:

### Option A: Disable Lighthouse Temporarily
Edit `src/agents/performance/performance-agent.ts`:

```typescript
protected async scan(config: ScanConfig): Promise<void> {
  const url = await this.resolveRedirects(config.target.url!);
  const platforms: Platform[] = config.platform === 'both' ? ['desktop', 'mweb'] : [config.platform];

  for (const platform of platforms) {
    this.logger.info(`Running performance scan for ${platform}`);

    // TEMPORARILY SKIP LIGHTHOUSE
    // await this.runLighthouse(url, platform);

    // Phase 2: Core Web Vitals (real measurement)
    await this.measureCoreWebVitals(url, platform);

    // Phase 3: OTT Player Metrics
    await this.measurePlayerMetrics(url, platform);
  }

  // ... rest of scan
}
```

This will show Core Web Vitals data but skip Lighthouse donut charts.

### Option B: Use External Lighthouse Service
Consider using PageSpeed Insights API or Lighthouse CI server:

```typescript
// In performance-agent.ts
const LIGHTHOUSE_API_URL = process.env.LIGHTHOUSE_API_URL;
if (LIGHTHOUSE_API_URL) {
  // Call external Lighthouse service instead of local Chrome
  const response = await axios.post(LIGHTHOUSE_API_URL, { url, platform });
  // Process response
}
```

## Contact Support

If none of these fixes work, provide these diagnostics:

```bash
# System info
uname -a
free -h
df -h
docker --version
docker-compose --version

# Container info
docker ps -a
docker stats --no-stream
docker logs vzy-agent --tail 500 > lighthouse-error.log

# Chrome test
docker exec vzy-agent google-chrome-stable --version
docker exec vzy-agent google-chrome-stable --headless=new --no-sandbox --dump-dom https://example.com | head -20
```

Share `lighthouse-error.log` and the output of the above commands.
