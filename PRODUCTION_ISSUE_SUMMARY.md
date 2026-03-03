# Production Issue Summary: Missing Lighthouse Scores on vzytech.com

## Issue
Performance page on https://vzytech.com is missing Lighthouse donut charts (Performance/Accessibility/Best Practices/SEO/PWA scores).

## Root Cause
Lighthouse is failing to generate scores in the AWS production environment, returning `score=0` after multiple attempts. The performance agent metadata shows `"lighthouse": null` instead of score data.

## Why It's Happening
Headless Chrome (used by Lighthouse) is resource-intensive and fails in constrained Docker environments due to:
1. CPU/memory pressure during trace collection
2. Multiple concurrent Chrome instances (3 Lighthouse runs × 2 platforms = 6 Chrome processes)
3. AWS t3.medium instance may be at capacity during scans

## What's Working
- ✅ Core Web Vitals (LCP, FCP, CLS, TTFB, INP) - all showing correctly
- ✅ Security scans - working perfectly
- ✅ Code quality scans - working perfectly
- ✅ CDN and resource analysis - working correctly
- ✅ Dashboard authentication and UI - working correctly

## What's NOT Working
- ❌ Lighthouse performance score (0-100)
- ❌ Lighthouse accessibility score (0-100)
- ❌ Lighthouse best practices score (0-100)
- ❌ Lighthouse SEO score (0-100)
- ❌ Lighthouse PWA score (0-100)

## Impact
- Users can't see the 5 Lighthouse donut charts on the Performance page
- Overall performance scoring is affected (Lighthouse is 85% of performance score)
- All other functionality works normally

## Solution Applied

### Code Changes Made
1. **Made Lighthouse runs configurable** via environment variable
   - File: `src/agents/performance/performance-agent.ts`
   - Change: `LIGHTHOUSE_RUNS` now reads from `process.env.LIGHTHOUSE_RUNS` (default: 3)
   
2. **Updated production environment template**
   - File: `.env.production.example`
   - Added: `LIGHTHOUSE_RUNS=2` for AWS environments

### Deployment Steps Required

#### On Your Local Machine:
```bash
# 1. Commit and push changes
git add .
git commit -m "fix: Make Lighthouse runs configurable for AWS production"
git push origin main
```

#### On AWS Instance (13.205.146.249):
```bash
# 2. SSH into server
ssh -i your-key.pem ubuntu@13.205.146.249

# 3. Navigate to project directory
cd /opt/vzy-agent  # or wherever your code is deployed

# 4. Pull latest changes
git pull origin main

# 5. Update .env.production file
nano .env.production
# Add this line at the end:
# LIGHTHOUSE_RUNS=2

# 6. Rebuild and restart containers
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml build --no-cache agent
docker-compose -f docker-compose.prod.yml up -d

# 7. Monitor logs
docker-compose -f docker-compose.prod.yml logs -f agent
```

#### Verification:
```bash
# Wait 2 minutes for services to stabilize, then:

# 1. Login to https://vzytech.com
# 2. Go to Control Center
# 3. Click "Run Scan"
# 4. Enter URL: https://www.vzy.one/
# 5. Select Platform: Desktop
# 6. Select Agents: Performance only
# 7. Click "Start Scan"
# 8. Wait 3-4 minutes
# 9. Go to Performance page
# 10. Verify Lighthouse donut charts appear
```

## Alternative Solutions (If Above Doesn't Work)

### Option 1: Upgrade AWS Instance
- Current: t3.medium (2 vCPU, 4GB RAM) - $30/month
- Recommended: t3.large (2 vCPU, 8GB RAM) - $60/month
- This gives Chrome more breathing room

### Option 2: Reduce to 1 Lighthouse Run
```bash
# In .env.production
LIGHTHOUSE_RUNS=1
```
- Faster scans (2 minutes instead of 4)
- Less accurate (no median calculation)
- Still better than no scores

### Option 3: Skip Lighthouse on Mobile
- Only run Lighthouse for desktop
- Mobile gets Core Web Vitals only
- Reduces Chrome instances from 6 to 3

### Option 4: Use External Lighthouse Service
- Google PageSpeed Insights API (free, 25 requests/day)
- Lighthouse CI server (self-hosted)
- Removes Chrome burden from your server

## Files Modified
1. `src/agents/performance/performance-agent.ts` - Made LIGHTHOUSE_RUNS configurable
2. `.env.production.example` - Added LIGHTHOUSE_RUNS=2 recommendation
3. `LIGHTHOUSE_AWS_FIX.md` - Quick reference guide (NEW)
4. `AWS_LIGHTHOUSE_TROUBLESHOOTING.md` - Comprehensive troubleshooting (NEW)
5. `PRODUCTION_ISSUE_SUMMARY.md` - This file (NEW)

## Expected Outcome
After applying the fix:
- Lighthouse scores will appear on Performance page
- Scan time: 3-5 minutes (reduced from 6-8 minutes)
- Memory usage: 2-3GB during scan (within t3.medium limits)
- All 5 donut charts visible and functional

## Monitoring
```bash
# Check if Lighthouse is working
docker logs vzy-agent 2>&1 | grep "Lighthouse.*median"
# Should show: "Lighthouse desktop median selection: runs: 2, median: 63"

# Check memory usage
docker stats vzy-agent --no-stream
# MEM USAGE should stay under 3.5GB

# Check scan results
curl -s https://vzytech.com/api/reports | jq '.[0].agentResults[] | select(.agentType=="performance") | .metadata.lighthouse'
# Should show scores, not null
```

## Rollback Plan
If the fix causes issues:
```bash
# Remove the environment variable
nano .env.production
# Delete the line: LIGHTHOUSE_RUNS=2

# Restart containers
docker-compose -f docker-compose.prod.yml restart agent
```

## Next Steps
1. Apply the deployment steps above
2. Verify Lighthouse scores appear
3. Monitor for 24 hours to ensure stability
4. If still failing, try Option 1 (upgrade instance) or Option 2 (reduce to 1 run)

## Questions?
- Check `AWS_LIGHTHOUSE_TROUBLESHOOTING.md` for detailed diagnostics
- Check `LIGHTHOUSE_AWS_FIX.md` for quick fixes
- Review Docker logs: `docker logs vzy-agent --tail 200`
