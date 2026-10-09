# syntax=docker/dockerfile:1
# STRATA web (Next.js 15, standalone output). Build context = repo root:
#   docker build -f apps/web/Dockerfile --build-arg ENGINE_URL=http://engine:8000 -t strata-web .
#
# ENGINE_URL is a BUILD-time value: `next build` bakes the /api/engine/* rewrite destination into
# .next/routes-manifest.json, and the standalone server reads rewrites from that manifest, not from
# next.config.ts. Changing it means rebuilding the image (docker compose build web).
ARG NODE_IMAGE=node:22-alpine

# ---------- deps: install exactly what the lockfile says (dev deps included; next build needs typescript)
FROM ${NODE_IMAGE} AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /repo/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- build: mirror the repo layout so ../../config (externalDir + the @config/* tsconfig path) resolves
FROM ${NODE_IMAGE} AS builder
ARG ENGINE_URL=http://engine:8000
ENV ENGINE_URL=${ENGINE_URL} \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo/apps/web
COPY --from=deps /repo/apps/web/node_modules ./node_modules
COPY config/ /repo/config/
COPY apps/web/ ./
# public/ is empty in the repo (git does not track empty dirs), so make sure it exists for the copy below.
# Lint is not part of `npm run check`; type errors still fail the build.
RUN mkdir -p public \
 && node node_modules/next/dist/bin/next build --no-lint

# ---------- run: only the traced standalone server + static assets
FROM ${NODE_IMAGE} AS runner
ARG ENGINE_URL=http://engine:8000
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    ENGINE_URL=${ENGINE_URL}
WORKDIR /app
# outputFileTracingRoot = repo root, so the standalone tree is rooted at the repo and the server is apps/web/server.js
COPY --from=builder --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=4 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
