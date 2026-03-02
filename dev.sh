#!/usr/bin/env bash
# =============================================================================
# VZY Agent - Dev Startup Script
# Starts backend (port 3001) + dashboard (port 4000) with proper cleanup
# Usage: ./dev.sh          (start both)
#        ./dev.sh stop     (stop both)
#        ./dev.sh restart  (restart both)
# =============================================================================

set -e

BACKEND_PORT=3001
DASHBOARD_PORT=4000
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
DASHBOARD_DIR="$PROJECT_DIR/dashboard"
BACKEND_LOG="/tmp/vzy-backend.log"
DASHBOARD_LOG="/tmp/vzy-dashboard.log"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[VZY]${NC} $1"; }
warn() { echo -e "${YELLOW}[VZY]${NC} $1"; }
err()  { echo -e "${RED}[VZY]${NC} $1"; }

kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill -9 2>/dev/null || true
    log "Killed process(es) on port $port"
    sleep 1
  fi
}

stop_all() {
  log "Stopping services..."
  kill_port $BACKEND_PORT
  kill_port $DASHBOARD_PORT
  log "All services stopped."
}

check_health() {
  local url=$1
  local name=$2
  local max_wait=$3
  local waited=0

  while [ $waited -lt "$max_wait" ]; do
    local http_code
    http_code=$(curl -sf -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    if [ "$http_code" != "000" ]; then
      log "$name is healthy at $url"
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done

  err "$name failed to start within ${max_wait}s — check logs"
  return 1
}

start_all() {
  log "Starting VZY Agent development environment..."
  echo ""

  # ── Clean kill any existing processes ──
  kill_port $BACKEND_PORT
  kill_port $DASHBOARD_PORT

  # ── Start Backend ──
  log "Starting backend on port $BACKEND_PORT..."
  cd "$PROJECT_DIR"
  DASHBOARD_PORT=$BACKEND_PORT npx ts-node src/dashboard/server.ts > "$BACKEND_LOG" 2>&1 &
  local backend_pid=$!
  log "Backend PID: $backend_pid (log: $BACKEND_LOG)"

  # ── Start Dashboard ──
  log "Starting dashboard on port $DASHBOARD_PORT..."
  cd "$DASHBOARD_DIR"
  PORT=$DASHBOARD_PORT npx next dev -p $DASHBOARD_PORT > "$DASHBOARD_LOG" 2>&1 &
  local dashboard_pid=$!
  log "Dashboard PID: $dashboard_pid (log: $DASHBOARD_LOG)"

  echo ""

  # ── Health checks ──
  check_health "http://localhost:$BACKEND_PORT/api/health" "Backend" 15 || true
  check_health "http://localhost:$DASHBOARD_PORT" "Dashboard" 15 || true

  echo ""
  log "═══════════════════════════════════════════════"
  log "  Dashboard:  http://localhost:$DASHBOARD_PORT"
  log "  Backend:    http://localhost:$BACKEND_PORT"
  log "  Credentials: admin@dishtv.in / admin123"
  log "═══════════════════════════════════════════════"
  echo ""
  log "Logs:  tail -f $BACKEND_LOG $DASHBOARD_LOG"
  log "Stop:  ./dev.sh stop"
}

# ── Main ──
case "${1:-start}" in
  stop)    stop_all ;;
  restart) stop_all; start_all ;;
  start)   start_all ;;
  *)       echo "Usage: ./dev.sh [start|stop|restart]"; exit 1 ;;
esac
