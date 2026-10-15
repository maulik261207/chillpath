from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field

class RouteEventCreate(BaseModel):
    organization_id: UUID
    event_type: str = Field(min_length=1, max_length=50)
    occurred_at: datetime
    source: str = "operator"
    idempotency_key: str = Field(min_length=1, max_length=160)
    details: dict = Field(default_factory=dict)

class OperatorActionCreate(BaseModel):
    organization_id: UUID
    action_type: str
    decision: str = Field(pattern="^(accepted|rejected)$")
    reason: str = Field(min_length=1, max_length=1000)

