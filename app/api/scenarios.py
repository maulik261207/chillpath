from fastapi import APIRouter
from app.schemas.scenarios import ScenarioRequest
from app.services.scenarios import run_scenario

router = APIRouter(prefix="/simulations", tags=["simulations"])

@router.post("")
async def create_simulation(request: ScenarioRequest):
    result = run_scenario(request.scenario_type, request.seed, request.duration)
    return {"status": "completed", "demo": True, "scenario": result}

