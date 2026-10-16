"""Persistent historical replay control state."""
from alembic import op
from app.models.replay import ReplaySession
revision = "0003_replay_sessions"
down_revision = "0002_historical_dataset"
branch_labels = None
depends_on = None
def upgrade(): ReplaySession.__table__.create(bind=op.get_bind(), checkfirst=True)
def downgrade(): op.drop_table(ReplaySession.__tablename__)
