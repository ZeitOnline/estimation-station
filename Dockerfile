# =============================================================================
# Dockerfile — builds the SvelteKit app (estimation-station) into a single
# standalone Node server and runs it.
#
# This is now the *only* workload: the app serves its pages AND the realtime
# WebSocket on one port (see docs/estimation-poker-plan.md §3/§7). The former
# Postgres / PostgREST / Alembic / Express "notes" stack is gone.
#
#   docker build -t app/frontend .
#   docker run -p 3000:3000 app/frontend      # → http://localhost:3000/frontend
# =============================================================================

FROM node:lts-slim@sha256:b31e7a42fdf8b8aa5f5ed477c72d694301273f1069c5a2f71d53c6482e99a2fc AS node

# --- build: install ALL deps and produce build/ (incl. build/server.js) ------
FROM node AS frontend-builder
WORKDIR /app
# Copy manifests first so `npm ci` is cached until dependencies actually change.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# `npm run build` = vite build (adapter-node) + esbuild bundle → build/server.js.
RUN npm run build
# Drop devDependencies so we can copy a lean node_modules into the runtime image.
# adapter-node bundles the app itself; only the deps our server.js keeps
# *external* (ws, jose) are actually needed at runtime.
RUN npm prune --omit=dev

FROM frontend-builder AS frontend-testing
ENTRYPOINT npm run test

# --- runtime: just Node + the build output + production deps ------------------
FROM node AS frontend
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0
COPY --from=frontend-builder /app/build ./build
COPY --from=frontend-builder /app/node_modules ./node_modules
COPY --from=frontend-builder /app/package.json ./package.json
EXPOSE 3000
# Run as the image's built-in non-root user (required by most k8s policies).
USER node
ENTRYPOINT ["node", "build/server.js"]
