""" ${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""

from alembic import op
${imports if imports else "from os import path"}


# revision identifiers, used by Alembic.
revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}


def upgrade():
    ${upgrades if upgrades else """base, _ = path.splitext(__file__)
    sql = open(base + '.sql').read()
    op.execute(sql)"""}


def downgrade():
    ${downgrades if downgrades else "NotImplemented"}
