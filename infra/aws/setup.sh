#!/usr/bin/env bash
# =============================================================================
# VZY OTT Agent — EC2 Instance Setup Script (One-Time Provisioning)
# =============================================================================
# Run this ON the EC2 instance after SSH-ing in:
#   chmod +x setup.sh && sudo ./setup.sh
#
# Tested on: Ubuntu 22.04 LTS (t3.medium)
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[SETUP]${NC} $1"; }
warn() { echo -e "${YELLOW}[SETUP]${NC} $1"; }
err()  { echo -e "${RED}[SETUP]${NC} $1"; exit 1; }

# =============================================================================
# Pre-flight checks
# =============================================================================
if [ "$EUID" -ne 0 ]; then
  err "Please run as root (sudo ./setup.sh)"
fi

log "Starting VZY Agent server setup..."
echo ""

# =============================================================================
# 1. System updates
# =============================================================================
log "Updating system packages..."
apt-get update -y
apt-get upgrade -y
apt-get install -y \
  apt-transport-https \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  software-properties-common \
  unzip \
  htop \
  fail2ban \
  ufw

# =============================================================================
# 2. Install Docker Engine
# =============================================================================
log "Installing Docker..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  log "Docker installed successfully"
else
  log "Docker already installed: $(docker --version)"
fi

# Add ubuntu user to docker group
usermod -aG docker ubuntu || true

# =============================================================================
# 3. Install Docker Compose v2
# =============================================================================
log "Docker Compose version: $(docker compose version)"

# =============================================================================
# 4. Configure Swap (important for t3.medium with 4GB RAM + Chromium)
# =============================================================================
log "Configuring 4GB swap..."
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  log "4GB swap enabled"
else
  log "Swap already configured"
fi

# Optimize swap behavior
sysctl vm.swappiness=10
echo 'vm.swappiness=10' >> /etc/sysctl.conf

# =============================================================================
# 5. Firewall (UFW)
# =============================================================================
log "Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable
log "Firewall configured (SSH + HTTP + HTTPS only)"

# =============================================================================
# 6. Fail2Ban (SSH brute-force protection)
# =============================================================================
log "Configuring Fail2Ban..."
cat > /etc/fail2ban/jail.local << 'JAIL'
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 5
bantime = 3600
findtime = 600
JAIL
systemctl enable fail2ban
systemctl restart fail2ban
log "Fail2Ban enabled"

# =============================================================================
# 7. Create application directory
# =============================================================================
APP_DIR="/opt/vzy-agent"
log "Creating application directory at $APP_DIR..."
mkdir -p "$APP_DIR"
chown ubuntu:ubuntu "$APP_DIR"

# =============================================================================
# 8. Auto-cleanup cron (Docker images/volumes)
# =============================================================================
log "Setting up Docker auto-cleanup cron..."
cat > /etc/cron.weekly/docker-cleanup << 'CRON'
#!/bin/bash
docker system prune -f --volumes 2>/dev/null
CRON
chmod +x /etc/cron.weekly/docker-cleanup

# =============================================================================
# 9. Log rotation for Docker
# =============================================================================
log "Configuring Docker log rotation..."
mkdir -p /etc/docker
cat > /etc/docker/daemon.json << 'DAEMON'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  }
}
DAEMON
systemctl restart docker

# =============================================================================
# 10. Install Certbot for Let's Encrypt SSL
# =============================================================================
log "Installing Certbot..."
apt-get install -y certbot
mkdir -p /var/www/certbot

# =============================================================================
# Summary
# =============================================================================
echo ""
log "═══════════════════════════════════════════════════════════════"
log "  ✅ Server setup complete!"
log "═══════════════════════════════════════════════════════════════"
log ""
log "  Next steps:"
log "  1. Clone your repo:    cd /opt/vzy-agent && git clone <YOUR_REPO_URL> ."
log "  2. Create env file:    cp .env.production.example .env.production"
log "  3. Edit env values:    nano .env.production"
log "  4. Setup SSL:          sudo bash scripts/ssl-setup.sh YOUR_DOMAIN.com"
log "  5. Start services:     docker compose -f docker-compose.prod.yml up -d --build"
log ""
log "  Server specs:"
log "    OS:    $(lsb_release -ds)"
log "    RAM:   $(free -h | awk '/Mem:/ {print $2}')"
log "    Swap:  $(free -h | awk '/Swap:/ {print $2}')"
log "    Disk:  $(df -h / | awk 'NR==2 {print $2}')"
log "    Docker: $(docker --version)"
log "═══════════════════════════════════════════════════════════════"
