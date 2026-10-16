"""Persisted historical replay analysis results."""
from alembic import op
import app.models  # noqa
from app.models.historical import HistoricalAnalysisRun, HistoricalSensorQuality, HistoricalAnomaly
revision = "0004_replay_analytics"
down_revision = "0003_replay_sessions"
branch_labels = None
depends_on = None
def upgrade():
    bind = op.get_bind()
    for table in (HistoricalAnalysisRun.__table__, HistoricalSensorQuality.__table__, HistoricalAnomaly.__table__): table.create(bind=bind, checkfirst=True)
def downgrade():
    for table in (HistoricalAnomaly.__table__, HistoricalSensorQuality.__table__, HistoricalAnalysisRun.__table__): op.drop_table(table.name)
