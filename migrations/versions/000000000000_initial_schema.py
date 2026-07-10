""" Initial schema

Revision ID: 000000000000
Revises:
Create Date: 2024-01-01 00:00:00.000000

The .py file is deliberately dumb: it just reads the .sql file sitting next to
it and executes it. Keeping the actual DDL in plain .sql (not Python) is the
ZEIT convention — the .sql is what you read, review, and understand.
"""

from alembic import op
from os import path

# revision identifiers, used by Alembic.
revision = '000000000000'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    base, _ = path.splitext(__file__)
    sql = open(base + '.sql').read()
    op.execute(sql)


def downgrade():
    NotImplemented
