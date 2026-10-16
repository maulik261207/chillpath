"""Historical research dataset storage and import provenance."""
from alembic import op
import app.models.historical  # noqa: F401
from app.models.historical import HistoricalDataset, DatasetImportJob, HistoricalSensor, HistoricalMeasurement, ExperimentAction

revision = "0002_historical_dataset"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None

def upgrade():
    bind = op.get_bind()
    for table in (HistoricalDataset.__table__, DatasetImportJob.__table__, HistoricalSensor.__table__, HistoricalMeasurement.__table__, ExperimentAction.__table__):
        table.create(bind=bind, checkfirst=True)

def downgrade():
    for table in (ExperimentAction.__table__, HistoricalMeasurement.__table__, HistoricalSensor.__table__, DatasetImportJob.__table__, HistoricalDataset.__table__):
        op.drop_table(table.name)
