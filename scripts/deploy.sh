#!/usr/bin/env bash
# =============================================================================
# VZY OTT Agent — Production Deployment Script
# =============================================================================
# Usage:
#   bash scripts/deploy.sh                  # Full deploy (pull + build + restart)
#   bash scripts/deploy.sh --quick          # Quick deploy (pull + restart, no rebuild)
#   bash scripts/deploy.sh --status         # Show service status
#   bash scripts/deploy.sh --logs           # Tail all logs
#   bash scripts/deploy.sh --backup-db      # Backup PostgreSQL database
#   bash scripts/deploy.sh --restore-db <f> # Restore database from file
# =============================================================================

set -euo pipefail

APP_DIR="/opt/vzy-agent"
COMPOSE_FILE="docker-compose.prod.yml"
BACKUP_DIR="/opt/vzy-agent/backups"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[DEPLOY]${NC} $1"; }
err()  { echo -e "${RED}[DEPLOY]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[DEPLOY]${NC} $1"; }

cd "$APP_DIR" || err "App directory $APP_DIR not found"

# =============================================================================
# Commands
# =============================================================================

show_status() {
  log "Service Status:"
  echo ""
  docker compose -f "$COMPOSE_FILE" ps
  echo ""
  log "Resource Usage:"
  docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null || true
}

show_logs() {
  docker compose -f "$COMPOSE_FILE" logs -f --tail=100
}

backup_db() {
  mkdir -p "$BACKUP_DIR"
  local timestamp
  timestamp=$(date +"%Y%m%d_%H%M%S")
  local backup_file="$BACKUP_DIR/vzy_agent_$timestamp.sql.gz"

  log "Backing up database to $backup_file..."
  docker exec vzy-postgres pg_dump -U vzy -d vzy_agent | gzip > "$backup_file"

  if [ -f "$backup_file" ]; then
    local size
    size=$(du -h "$backup_file" | cut -f1)
    log "Backup complete: $backup_file ($size)"
  else
    err "Backup failed!"
  fi

  # Keep only last 7 backups
  local count
  count=$(ls -1 "$BACKUP_DIR"/*.sql.gz 2>/dev/null | wc -l)
  if [ "$count" -gt 7 ]; then
    ls -1t "$BACKUP_DIR"/*.sql.gz | tail -n +8 | xargs rm -f
    log "Cleaned old backups (kept last 7)"
  fi
}

restore_db() {
  local backup_file="${1:-}"
  if [ -z "$backup_file" ]; then
    err "Usage: bash scripts/deploy.sh --restore-db <backup-file.sql.gz>"
  fi
  if [ ! -f "$backup_file" ]; then
    err "File not found: $backup_file"
  fi

  warn "⚠️  This will REPLACE the current database with the backup."
  read -p "Are you sure? (yes/no): " confirm
  if [ "$confirm" != "yes" ]; then
    log "Restore cancelled."
    return
  fi

  log "Restoring database from $backup_file..."
  gunzip -c "$backup_file" | docker exec -i vzy-postgres psql -U vzy -d vzy_agent
  log "Database restored successfully!"
}

full_deploy() {
  log "Starting full deployment..."
  echo ""

  # Step 1: Pull latest code
  log "Pulling latest code..."
  git pull origin main

  # Step 2: Backup database
  log "Creating pre-deploy database backup..."
  backup_db

  # Step 3: Build and restart
  log "Building Docker images..."
  docker compose -f "$COMPOSE_FILE" build --no-cache

  log "Restarting services..."
  docker compose -f "$COMPOSE_FILE" up -d

  # Step 4: Wait for health
  log "Waiting for services to be healthy..."
  sleep 10

  # Step 5: Health check
  local backend_health
  backend_health=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null || echo "000")
  local dashboard_health
  dashboard_health=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost:4000 2>/dev/null || echo "000")

  echo ""
  if [ "$backend_health" = "200" ]; then
    log "✅ Backend API: healthy"
  else
    warn "⚠️  Backend API: not responding (HTTP $backend_health)"
  fi

  if [ "$dashboard_health" = "200" ] || [ "$dashboard_health" = "302" ]; then
    log "✅ Dashboard: healthy"
  else
    warn "⚠️  Dashboard: not responding (HTTP $dashboard_health)"
  fi

  echo ""
  show_status

  # Step 6: Cleanup old images
  log "Cleaning up old Docker images..."
  docker image prune -f

  echo ""
  log "═══════════════════════════════════════════════"
  log "  ✅ Deployment complete!"
  log "═══════════════════════════════════════════════"
}

quick_deploy() {
  log "Starting quick deployment (no rebuild)..."

  git pull origin main

  docker compose -f "$COMPOSE_FILE" up -d

  sleep 5
  show_status
  log "Quick deploy complete!"
}

# =============================================================================
# Main
# =============================================================================
case "${1:-}" in
  --status)
    show_status
    ;;
  --logs)
    show_logs
    ;;
  --backup-db)
    backup_db
    ;;
  --restore-db)
    restore_db "${2:-}"
    ;;
  --quick)
    quick_deploy
    ;;
  *)
    full_deploy
    ;;
esac
