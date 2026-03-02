#!/usr/bin/env bash
# =============================================================================
# VZY OTT Agent — Let's Encrypt SSL Setup
# =============================================================================
# Usage: sudo bash scripts/ssl-setup.sh yourdomain.com [your-email@example.com]
#
# This script:
#   1. Obtains SSL certificate from Let's Encrypt
#   2. Updates nginx.conf with your domain
#   3. Sets up auto-renewal cron
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[SSL]${NC} $1"; }
warn() { echo -e "${YELLOW}[SSL]${NC} $1"; }
err()  { echo -e "${RED}[SSL]${NC} $1"; exit 1; }

DOMAIN="${1:-}"
EMAIL="${2:-}"

if [ -z "$DOMAIN" ]; then
  err "Usage: sudo bash scripts/ssl-setup.sh <domain> [email]"
fi

if [ "$EUID" -ne 0 ]; then
  err "Please run as root (sudo)"
fi

# =============================================================================
# Step 1: Stop nginx if running (to free port 80)
# =============================================================================
log "Stopping nginx container if running..."
docker stop vzy-nginx 2>/dev/null || true

# =============================================================================
# Step 2: Get SSL certificate
# =============================================================================
log "Obtaining SSL certificate for $DOMAIN..."

CERTBOT_ARGS=(
  certonly
  --standalone
  -d "$DOMAIN"
  --agree-tos
  --non-interactive
)

if [ -n "$EMAIL" ]; then
  CERTBOT_ARGS+=(--email "$EMAIL")
else
  CERTBOT_ARGS+=(--register-unsafely-without-email)
fi

certbot "${CERTBOT_ARGS[@]}"

if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  err "Certificate was not created. Check certbot output above."
fi

log "SSL certificate obtained successfully!"

# =============================================================================
# Step 3: Update nginx.conf with actual domain
# =============================================================================
NGINX_CONF="$(dirname "$(readlink -f "$0")")/../infra/aws/nginx.conf"

if [ -f "$NGINX_CONF" ]; then
  log "Updating nginx.conf with domain: $DOMAIN"
  sed -i "s/YOUR_DOMAIN\.com/$DOMAIN/g" "$NGINX_CONF"
  log "nginx.conf updated"
else
  warn "Could not find nginx.conf at $NGINX_CONF — update manually"
fi

# =============================================================================
# Step 4: Update .env.production with domain
# =============================================================================
ENV_FILE="$(dirname "$(readlink -f "$0")")/../.env.production"

if [ -f "$ENV_FILE" ]; then
  log "Updating .env.production with domain: $DOMAIN"
  sed -i "s/^DOMAIN=.*/DOMAIN=$DOMAIN/" "$ENV_FILE"
  log ".env.production updated"
else
  warn "No .env.production found — set DOMAIN=$DOMAIN manually"
fi

# =============================================================================
# Step 5: Auto-renewal cron
# =============================================================================
log "Setting up SSL auto-renewal..."
cat > /etc/cron.d/certbot-renew << CRON
# Renew Let's Encrypt SSL certificates daily at 3:00 AM
0 3 * * * root certbot renew --quiet --deploy-hook "docker restart vzy-nginx"
CRON
chmod 644 /etc/cron.d/certbot-renew
log "Auto-renewal cron configured (daily at 3 AM)"

# =============================================================================
# Step 6: Restart nginx
# =============================================================================
log "Starting nginx..."
cd "$(dirname "$(readlink -f "$0")")/.."
docker compose -f docker-compose.prod.yml up -d nginx

echo ""
log "═══════════════════════════════════════════════════════════════"
log "  ✅ SSL setup complete for $DOMAIN"
log "═══════════════════════════════════════════════════════════════"
log "  Certificate: /etc/letsencrypt/live/$DOMAIN/"
log "  Auto-renew:  daily at 3 AM (cron)"
log "  Test:        https://$DOMAIN"
log "═══════════════════════════════════════════════════════════════"
