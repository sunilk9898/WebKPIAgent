#!/bin/bash
# =============================================================================
# Quick Deploy Script for Lighthouse Fix on AWS Production
# =============================================================================
# Run this script on your AWS instance to apply the Lighthouse fix
# Usage: bash DEPLOY_FIX_NOW.sh
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[FIX]${NC} $1"; }
warn() { echo -e "${YELLOW}[FIX]${NC} $1"; }
err()  { echo -e "${RED}[FIX]${NC} $1"; exit 1; }

log "Starting Lighthouse fix deployment..."
echo ""

# Check if we're in the right directory
if [ ! -f "docker-compose.prod.yml" ]; then
  err "docker-compose.prod.yml not found. Please run this script from the project root."
fi

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
  err ".env.production not found. Please create it from .env.production.example first."
fi

# Backup current .env.production
log "Backing up .env.production..."
cp .env.production .env.production.backup.$(date +%Y%m%d_%H%M%S)

# Check if LIGHTHOUSE_RUNS already exists
if grep -q "LIGHTHOUSE_RUNS" .env.production; then
  warn "LIGHTHOUSE_RUNS already exists in .env.production"
  log "Current value: $(grep LIGHTHOUSE_RUNS .env.production)"
  read -p "Do you want to update it to LIGHTHOUSE_RUNS=2? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    sed -i.bak 's/^LIGHTHOUSE_RUNS=.*/LIGHTHOUSE_RUNS=2/' .env.production
    log "Updated LIGHTHOUSE_RUNS=2"
  fi
else
  log "Adding LIGHTHOUSE_RUNS=2 to .env.production..."
  echo "" >> .env.production
  echo "# --- Performance Agent Configuration ---" >> .env.production
  echo "# Reduce Lighthouse runs in resource-constrained environments" >> .env.production
  echo "LIGHTHOUSE_RUNS=2" >> .env.production
  log "Added LIGHTHOUSE_RUNS=2"
fi

echo ""
log "Stopping containers..."
docker-compose -f docker-compose.prod.yml down

echo ""
log "Rebuilding agent container (this may take 2-3 minutes)..."
docker-compose -f docker-compose.prod.yml build --no-cache agent

echo ""
log "Starting all containers..."
docker-compose -f docker-compose.prod.yml up -d

echo ""
log "Waiting for services to stabilize (30 seconds)..."
sleep 30

echo ""
log "Checking container status..."
docker-compose -f docker-compose.prod.yml ps

echo ""
log "Checking agent logs (last 20 lines)..."
docker-compose -f docker-compose.prod.yml logs --tail 20 agent

echo ""
log "═══════════════════════════════════════════════════════════"
log "  ✅ Lighthouse fix deployed successfully!"
log "═══════════════════════════════════════════════════════════"
echo ""
log "Next steps:"
log "  1. Wait 2 minutes for services to fully start"
log "  2. Login to https://vzytech.com"
log "  3. Go to Control Center → Run Scan"
log "  4. Scan URL: https://www.vzy.one/"
log "  5. Platform: Desktop"
log "  6. Agents: Performance only"
log "  7. Wait 3-4 minutes for scan to complete"
log "  8. Check Performance page for Lighthouse donut charts"
echo ""
log "Monitor logs with:"
log "  docker-compose -f docker-compose.prod.yml logs -f agent"
echo ""
log "Check memory usage with:"
log "  docker stats vzy-agent --no-stream"
echo ""
log "Verify Lighthouse scores with:"
log "  curl -s https://vzytech.com/api/reports | jq '.[0].agentResults[] | select(.agentType==\"performance\") | .metadata.lighthouse'"
echo ""
log "═══════════════════════════════════════════════════════════"
