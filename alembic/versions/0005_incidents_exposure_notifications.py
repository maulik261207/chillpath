"""Historical replay incidents, exposure summaries, and mock notifications."""
from alembic import op
from app.models.historical import HistoricalIncident, HistoricalExposure, MockNotification
revision = "0005_incidents_exposure_notifications"
down_revision = "0004_replay_analytics"
branch_labels = None
depends_on = None
def upgrade():
    bind = op.get_bind()
    for table in (HistoricalIncident.__table__, HistoricalExposure.__table__, MockNotification.__table__): table.create(bind=bind, checkfirst=True)
def downgrade():
    for table in (MockNotification.__table__, HistoricalExposure.__table__, HistoricalIncident.__table__): op.drop_table(table.name)
