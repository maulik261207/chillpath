"""Baseline existing ChillPath schema without dropping development data."""
from alembic import op
import app.models  # noqa: F401
from app.db.base import Base

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    # create_all is additive and is safe for existing databases; it does not alter or drop tables.
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)

def downgrade():
    # Baseline is intentionally irreversible so existing records cannot be dropped accidentally.
    pass
