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

# --- build: install ALL deps and produce build/ (incl. build/server.js) ------
FROM node:22-slim AS build
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

# --- runtime: just Node + the build output + production deps ------------------
FROM node:22-slim AS frontend
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
# Run as the image's built-in non-root user (required by most k8s policies).
USER node
CMD ["node", "build/server.js"]
