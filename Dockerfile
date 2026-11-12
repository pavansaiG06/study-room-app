# Production multi-stage Dockerfile for StudyHub (ARM64 + AMD64 Oracle Cloud compatible)
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Native build toolchain for sqlite3@6.0.1 and client build tools
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY client/package*.json ./client/

RUN npm ci
RUN cd client && npm ci

COPY . .
RUN cd client && npm run build

# Prune server dependencies to production-only while preserving compiled sqlite3 native binary
RUN npm prune --omit=dev

# Production Runner
FROM node:20-bookworm-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 ca-certificates && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/studyhub.db

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/server.js ./

RUN mkdir -p /app/data && chown -R node:node /app
VOLUME /app/data

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/index.js"]
