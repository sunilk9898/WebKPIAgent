# Lighthouse AWS Production Fix

## Problem
Lighthouse scores showing as `null` on vzytech.com production, causing missing donut charts on Performance page.

## Root Cause
Headless Chrome fails in AWS Docker environment due to resource constraints.

## Solutions (Try in Order)

### Solution 1: Increase Docker Shared Memory (Quick Fix)
Edit `docker-compose.prod.yml`:

```yaml
services:
  vzy-agent:
    # ... existing config
    shm_size: '2gb'  # Add this line
```

Then restart:
```bash
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

### Solution 2: Use /tmp Instead of /dev/shm
The code already has `--disable-dev-shm-usage` flag, but verify it's in production.

Check `src/agents/performance/performance-agent.ts` line 140:
```typescript
const CHROME_FLAGS = [
  // ...
  '--disable-dev-shm-usage',  // Must be present
  // ...
];
```

### Solution 3: Increase EC2 Instance Resources
Current recommendation: t3.medium (2 vCPU, 4GB RAM)

Upgrade to: **t3.large** (2 vCPU, 8GB RAM) or **t3.xlarge** (4 vCPU, 16GB RAM)

```bash
# On AWS Console:
# 1. Stop instance
# 2. Actions → Instance Settings → Change Instance Type
# 3. Select t3.large
# 4. Start instance
```

### Solution 4: Reduce Concurrent Scans
Edit `src/dashboard/server.ts` line 50:

```typescript
const MAX_CONCURRENT_SCANS = 1;  // Already set to 1, good
```

### Solution 5: Skip Lighthouse Retries (Temporary)
Reduce Lighthouse runs from 3 to 1 for faster scans:

Edit `src/agents/performance/performance-agent.ts` line 115:
```typescript
const LIGHTHOUSE_RUNS = 1;  // Temporarily reduce from 3
```

## Verification

After applying fixes, run a test scan:

```bash
# SSH into AWS instance
ssh -i your-key.pem ubuntu@13.205.146.249

# Check Docker logs
docker logs vzy-agent-1 --tail 100

# Trigger a scan via API
curl -X POST https://vzytech.com/api/scans \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.vzy.one/", "platform": "desktop"}'

# Check if Lighthouse scores appear
curl -s https://vzytech.com/api/reports | jq '.[0].agentResults[] | select(.agentType=="performance") | .metadata.lighthouse'
```

## Expected Result
```json
{
  "performanceScore": 63,
  "accessibilityScore": 89,
  "bestPracticesScore": 78,
  "seoScore": 92,
  "pwaScore": 0
}
```

## Quick Diagnostic Commands

```bash
# Check available memory
free -h

# Check Docker container memory
docker stats vzy-agent-1 --no-stream

# Check /dev/shm size
df -h /dev/shm

# Check Chrome processes
ps aux | grep chrome
```

## Recommended Production Setup

```yaml
# docker-compose.prod.yml
services:
  vzy-agent:
    image: vzy-agent:latest
    shm_size: '2gb'
    mem_limit: 6g
    cpus: '2'
    environment:
      - NODE_OPTIONS=--max-old-space-size=4096
```

## Alternative: Use Lighthouse CI Server
If Chrome continues to fail, consider using Google's Lighthouse CI server:

```typescript
// In performance-agent.ts
const LIGHTHOUSE_SERVER_URL = process.env.LIGHTHOUSE_SERVER_URL;
if (LIGHTHOUSE_SERVER_URL) {
  // Use remote Lighthouse server instead of local Chrome
}
```
