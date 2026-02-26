# syntax=docker/dockerfile:1
#
# Multi-stage production build for jem-sec-attest (Next.js standalone output).
# Stage 1 (builder): compiles the app and produces .next/standalone/
# Stage 2 (runner):  minimal runtime image — only the standalone output + static assets
#
# Build:  docker build -t jem-sec-attest .
# Run:    docker run -p 3000:3000 --env-file .env.docker jem-sec-attest

# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9.15.4

# Copy lockfile and manifests first to leverage Docker layer caching
COPY pnpm-lock.yaml package.json ./

# Install all dependencies (including devDependencies needed for build)
RUN pnpm install --frozen-lockfile

# Copy the rest of the source
COPY . .

RUN pnpm next build

# Copy public assets, static files, and tenant config into the standalone directory.
# Config YAMLs contain ${ENV_VAR} placeholders substituted at runtime — no secrets are baked in.
RUN cp -r public .next/standalone/ && \
    cp -r .next/static .next/standalone/.next/static && \
    cp -r config .next/standalone/config

# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Install curl for the Docker HEALTHCHECK command
RUN apk add --no-cache curl

# Create a non-root user/group (uid/gid 1001) for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

# Copy the standalone build output from the builder stage
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Runtime environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Switch to non-root user
USER nextjs

EXPOSE 3000

# Docker health check — requires /api/health route to return HTTP 200
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start the standalone Next.js server
CMD ["node", "server.js"]
