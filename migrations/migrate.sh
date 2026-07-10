#!/bin/sh
# =============================================================================
# migrate.sh  —  the single entrypoint that brings the database up to date.
# =============================================================================
# Order matters:
#   1. `alembic upgrade head`  applies every pending migration in versions/.
#      Each migration just runs its paired .sql file (see versions/*.py).
#   2. auth.sql + api.sql are re-applied every time. They are the "current"
#      definition of roles and the API layer, and are written with
#      `create or replace`, so re-running them is safe and always leaves the
#      API in sync with the latest code.
# =============================================================================
set -e

export PGDATABASE=${PGDATABASE:=app}

echo ">> Applying migrations (alembic upgrade head)..."
alembic upgrade head

echo ">> (Re)creating roles from api/auth.sql..."
psql --quiet --set=ON_ERROR_STOP=on --file=../api/auth.sql

echo ">> (Re)creating API views/functions from api/api.sql..."
psql --quiet --set=ON_ERROR_STOP=on --file=../api/api.sql

echo ">> Database is up to date."
