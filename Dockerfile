# ============================================================================
# VZY OTT Verification Agent - Production Docker Image
# ============================================================================

# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* tsconfig.json ./
RUN npm ci --ignore-scripts

COPY src/ src/
RUN npm run build

# Stage 2: Production
FROM node:20-slim

# Install Google Chrome (not Chromium) for Puppeteer & Lighthouse.
# Google Chrome includes complete trace infrastructure required by Lighthouse's
# Lantern simulation engine. Debian Chromium lacks some tracing features,
# causing LanternError on certain sites.
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
  && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
  && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
  && apt-get update \
  && apt-get install -y google-chrome-stable --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
# CHROME_PATH is used by chrome-launcher (for Lighthouse)
ENV CHROME_PATH=/usr/bin/google-chrome-stable
ENV NODE_ENV=production

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Create non-root user
RUN groupadd -r agent && useradd -r -g agent -d /app agent
RUN mkdir -p /app/logs /app/scan-results && chown -R agent:agent /app
USER agent

# Expose ports
EXPOSE 3000 9090

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Run dashboard API server (port 3000) which also initializes the scheduler
CMD ["node", "dist/dashboard/server.js"]
