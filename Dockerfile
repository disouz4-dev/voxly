# ============================================================
# Voxly - Multi-stage Dockerfile for Electron Build
# ============================================================

# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY app/package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Build Electron app
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++ \
    && npm install -g electron-builder
COPY app/package*.json ./
RUN npm ci
COPY app/ ./
RUN npm run build:win

# Stage 3: Production image (for serving web app)
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -g 1001 -S voxly && \
    adduser -S voxly -u 1001

COPY web/ ./web/
COPY --from=deps /app/node_modules ./web/node_modules

RUN chown -R voxly:voxly /app
USER voxly

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["npx", "serve", "web/public", "-l", "3000"]
