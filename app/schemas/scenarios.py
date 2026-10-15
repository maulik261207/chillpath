from pydantic import BaseModel, Field
from app.services.scenarios import ScenarioType

class ScenarioRequest(BaseModel):
    scenario_type: ScenarioType
    seed: int = 1
    duration: int = Field(default=5, ge=1, le=1000)

