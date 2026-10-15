from datetime import datetime, timezone

from fastapi import APIRouter


router = APIRouter(prefix="/engines", tags=["engines"])


@router.get("/status")
async def engine_status():
    return {
        "connected": True,
        "service": "ChillPath FastAPI",
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "engines": [
            {
                "id": "sensor-health-v1",
                "name": "Sensor health",
                "group": "Sensor trust",
                "status": "operational",
                "description": "Scores sample coverage and flags temporal outliers without rewriting raw evidence.",
                "inputs": ["temperature samples", "expected sample count"],
            },
            {
                "id": "vibration-v1",
                "name": "Vibration assessment",
                "group": "Sensor trust",
                "status": "ready",
                "description": "Evaluates accelerometer RMS and peak force when compatible hardware is configured.",
                "inputs": ["accelerometer vectors", "device capability manifest"],
            },
            {
                "id": "fusion-v1",
                "name": "Evidence fusion",
                "group": "Sensor trust",
                "status": "operational",
                "description": "Keeps environmental condition and evidence quality separate when forming confidence.",
                "inputs": ["temperature", "product limits", "evidence status"],
            },
            {
                "id": "classification-v1",
                "name": "Excursion classification",
                "group": "Condition intelligence",
                "status": "operational",
                "description": "Distinguishes a valid excursion, suspected sensor fault, normal state, and insufficient evidence.",
                "inputs": ["timestamped samples", "temperature policy"],
            },
            {
                "id": "exposure-v1",
                "name": "Exposure accounting",
                "group": "Condition intelligence",
                "status": "operational",
                "description": "Separates verified and uncertain exposure using bounded holds between measurements.",
                "inputs": ["timestamped samples", "temperature policy"],
            },
            {
                "id": "recovery-v1",
                "name": "Recovery ranking",
                "group": "Decision support",
                "status": "operational",
                "description": "Ranks feasible interventions while keeping approval with the operator.",
                "inputs": ["remaining budget", "route delay", "evidence uncertainty"],
            },
            {
                "id": "route-resistance-v1",
                "name": "Low-resistance routing",
                "group": "Decision support",
                "status": "operational",
                "description": "Prefers straighter, lower-obstacle candidates and preserves the selected transport mode.",
                "inputs": ["route candidates", "straightness", "obstacle score", "transport mode"],
            },
        ],
    }
