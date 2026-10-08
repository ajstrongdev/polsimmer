# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv

# =============================================================================
# Install Bun once on the Node 24 Alpine base used by all stages. The app and
# its maintenance scripts still run under Node.
# =============================================================================
FROM docker.io/oven/bun:1.4.2-alpine AS bun
FROM docker.io/library/node:24-alpine AS deps

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /usr/src/app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS tooling
WORKDIR /usr/src/app
COPY . .

# Build the web application only for the runtime image. The tooling stage is
# also used for one-off migrations and seeds, which do not need a Vite build.
FROM tooling AS builder

# Vite/Nitro can exceed Node's default ~2 GiB heap during the server build.
# Keep this scoped to the build so the runtime container retains its default.
ARG BUILD_NODE_HEAP_MB=4096

# Build arguments for client-side environment variables (VITE_* prefix)
ARG VITE_APP_TITLE
ARG VITE_COMMIT_SHA
ARG VITE_INSTANCE_CONFIG
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_MEASUREMENT_ID

# Set build-time environment variables
ENV VITE_APP_TITLE=${VITE_APP_TITLE}
ENV VITE_COMMIT_SHA=${VITE_COMMIT_SHA}
ENV VITE_INSTANCE_CONFIG=${VITE_INSTANCE_CONFIG}
ENV VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY}
ENV VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN}
ENV VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID}
ENV VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET}
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID}
ENV VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID}
ENV VITE_FIREBASE_MEASUREMENT_ID=${VITE_FIREBASE_MEASUREMENT_ID}

# Mount Firebase Admin secrets at build time (for SSR)
RUN --mount=type=secret,id=firebase_project_id \
    --mount=type=secret,id=firebase_client_email \
    --mount=type=secret,id=firebase_private_key \
    FIREBASE_PROJECT_ID=$(cat /run/secrets/firebase_project_id 2>/dev/null || echo "") \
    FIREBASE_CLIENT_EMAIL=$(cat /run/secrets/firebase_client_email 2>/dev/null || echo "") \
    FIREBASE_PRIVATE_KEY=$(cat /run/secrets/firebase_private_key 2>/dev/null || echo "") \
    NODE_OPTIONS="--max-old-space-size=${BUILD_NODE_HEAP_MB}" bun run build

# Runtime dependencies are cached independently of changes to application code.
FROM docker.io/library/node:24-alpine AS production-deps
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /usr/src/app
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

# =============================================================================
# Production runtime
# =============================================================================
FROM docker.io/library/node:24-alpine AS runner

# Set production environment
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
WORKDIR /usr/src/app

COPY --from=production-deps /usr/src/app/node_modules ./node_modules

# Copy built application from builder stage
# TanStack Start with Nitro outputs to .output directory
COPY --chown=node:node --from=builder /usr/src/app/.output ./.output
COPY --chown=node:node --from=builder /usr/src/app/scripts ./scripts

# Expose the application port (non-privileged port)
EXPOSE 3000
USER node

# Run the server
# Nitro outputs a self-contained server in .output/server/index.mjs
CMD ["node", ".output/server/index.mjs"]
