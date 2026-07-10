# =============================================================================
# Multi-stage Dockerfile. Each `FROM ... AS <name>` is a build TARGET you can
# build independently:  docker build --target migrator -t app/migrator .
#
# This mirrors the wally/merkl layout (postgres / postgrest / migrator / node
# targets), but everything here is self-contained and readable.
# =============================================================================

# --- base images we reuse (pin tags; add @sha256 digests for real projects) --
FROM postgres:17-alpine            AS postgres
FROM postgrest/postgrest:v13.0.8   AS postgrest
FROM node:22-slim                  AS node-base
FROM python:3.12-slim              AS python-base


# --- migrator: runs alembic + applies auth.sql/api.sql (see migrate.sh) ------
FROM python-base AS migrator
# postgresql-client gives us `psql`, which migrate.sh uses.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pyproject.toml ./
RUN pip install --no-cache-dir alembic psycopg2-binary
COPY migrations migrations
COPY api api
WORKDIR /app/migrations
# migrate.sh reads PG* env vars for the connection.
ENTRYPOINT ["sh", "migrate.sh"]


# --- node: your own server (production build) --------------------------------
FROM node-base AS node
WORKDIR /app
COPY node/package.json node/package-lock.json* ./
RUN npm install --omit=dev
COPY node/ ./
EXPOSE 3001
CMD ["npm", "start"]

# NOTE: the planning-poker realtime WebSocket server used to be its own target
# here. It now lives inside the SvelteKit app (frontend/) and is served on the
# same port as the app — see docs/estimation-poker-plan.md §3/§7. A production
# `frontend` target is a future task (the app currently runs via `npm run dev`).
