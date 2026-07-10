"""Alembic environment.

Connects to Postgres using standard libpq environment variables
(PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD). No connection string is
hard-coded, so the same migrations run locally, in docker-compose, and in k8s
just by changing env vars.
"""

from alembic import context
from logging import getLogger
from logging.config import fileConfig
from os import environ
from sqlalchemy import create_engine, pool

config = context.config
fileConfig(config.config_file_name)

log = getLogger("alembic")
log.info("Setting up migrations.")

# sensible local defaults; overridden by the environment in compose/k8s
environ.setdefault("PGHOST", "localhost")
environ.setdefault("PGPORT", "5432")
environ.setdefault("PGDATABASE", "app")

# empty URL => SQLAlchemy/psycopg2 read everything from PG* env vars
engine = create_engine("postgresql://", poolclass=pool.NullPool)
connection = engine.connect()
context.configure(connection=connection, transaction_per_migration=True)

try:
    context.run_migrations()
finally:
    connection.close()

log.info("Migrations complete.")
