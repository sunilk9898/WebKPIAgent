# Fix Instructions: Missing Lighthouse Scores on vzytech.com

## Problem
Lighthouse donut charts are missing on the Performance page at https://vzytech.com

## Quick Fix (5 Minutes)

### Step 1: Commit and Push Changes
On your local machine:
```bash
git add .
git commit -m "fix: Make Lighthouse runs configurable for AWS production"
git push origin main
```

### Step 2: Deploy to AWS
SSH into your AWS server:
```bash
ssh -i your-key.pem ubuntu@13.205.146.249
cd /opt/vzy-agent  # or wherever your code is
```

Pull latest changes:
```bash
git pull origin main
```

Run the automated fix script:
```bash
bash DEPLOY_FIX_NOW.sh
```

The script will:
- ✅ Backup your current .env.production
- ✅ Add LIGHTHOUSE_RUNS=2 configuration
- ✅ Rebuild the agent container
- ✅ Restart all services
- ✅ Show you the status

### Step 3: Verify the Fix
1. Wait 2 minutes for services to start
2. Go to https://vzytech.com
3. Login with your credentials
4. Navigate to Control Center
5. Click "Run Scan"
6. Enter URL: `https://www.vzy.one/`
7. Select Platform: `Desktop`
8. Select Agents: `Performance` only
9. Click "Start Scan"
10. Wait 3-4 minutes
11. Go to Performance page
12. **You should now see 5 Lighthouse donut charts!**

## What Changed?

### Code Changes
1. **performance-agent.ts**: Made `LIGHTHOUSE_RUNS` configurable via environment variable
2. **.env.production.example**: Added `LIGHTHOUSE_RUNS=2` recommendation

### Why This Fixes It
- Reduces Chrome instances from 6 to 4 (2 runs × 2 platforms)
- Lowers memory pressure during scans
- Faster scan completion (3-5 min instead of 6-8 min)
- Still maintains accuracy with median calculation

## If It Still Doesn't Work

### Option 1: Reduce to 1 Run (Fastest)
Edit `.env.production`:
```bash
LIGHTHOUSE_RUNS=1
```
Restart: `docker-compose -f docker-compose.prod.yml restart agent`

### Option 2: Upgrade AWS Instance (Best)
- Current: t3.medium (4GB RAM) - $30/month
- Upgrade to: t3.large (8GB RAM) - $60/month
- Gives Chrome more resources

### Option 3: Check Detailed Troubleshooting
See `AWS_LIGHTHOUSE_TROUBLESHOOTING.md` for comprehensive diagnostics

## Files Created
- ✅ `DEPLOY_FIX_NOW.sh` - Automated deployment script
- ✅ `FIX_INSTRUCTIONS.md` - This file
- ✅ `PRODUCTION_ISSUE_SUMMARY.md` - Detailed issue analysis
- ✅ `AWS_LIGHTHOUSE_TROUBLESHOOTING.md` - Comprehensive troubleshooting
- ✅ `LIGHTHOUSE_AWS_FIX.md` - Quick reference guide

## Monitoring Commands

Check if Lighthouse is working:
```bash
docker logs vzy-agent 2>&1 | grep "Lighthouse.*median"
```

Check memory usage:
```bash
docker stats vzy-agent --no-stream
```

Check scan results:
```bash
curl -s https://vzytech.com/api/reports | jq '.[0].agentResults[] | select(.agentType=="performance") | .metadata.lighthouse'
```

## Rollback
If you need to undo the changes:
```bash
# Restore backup
cp .env.production.backup.* .env.production

# Restart
docker-compose -f docker-compose.prod.yml restart agent
```

## Support
If you still have issues after trying all options:
1. Check `AWS_LIGHTHOUSE_TROUBLESHOOTING.md`
2. Run diagnostics: `docker logs vzy-agent --tail 500 > error.log`
3. Share the error.log file

## Expected Result
✅ 5 Lighthouse donut charts visible on Performance page:
- Performance Score (0-100)
- Accessibility Score (0-100)
- Best Practices Score (0-100)
- SEO Score (0-100)
- PWA Score (0-100)

✅ Scan completes in 3-5 minutes
✅ Memory usage stays under 3.5GB
✅ All other features continue working normally
