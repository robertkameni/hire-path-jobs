# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

# Copy root workspace manifest + api manifests
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/

# Install all workspace deps from root (hoisted)
RUN npm install --ignore-scripts --workspace=apps/api

# Copy source
COPY apps/api ./apps/api
COPY packages ./packages

# Build api
WORKDIR /app/apps/api
RUN npm run build

# Prune dev dependencies
WORKDIR /app
RUN npm prune --omit=dev --workspace=apps/api

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:24-alpine AS runner

WORKDIR /app

# Tini for proper signal handling + PID 1 management
RUN apk add --no-cache tini

# Non-root user
RUN addgroup -S app && adduser -S app -G app

COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=app:app /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=app:app /app/apps/api/package.json ./apps/api/package.json

USER app

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/dist/main"]
