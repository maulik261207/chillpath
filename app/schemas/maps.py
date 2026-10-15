from typing import Literal
from pydantic import BaseModel, Field

TravelMode = Literal[
    "walk", "hike", "scooter", "motorcycle", "drive", "light_truck",
    "bicycle", "mountain_bike", "road_bike", "bus", "medium_truck",
    "truck", "truck_dangerous_goods", "heavy_truck", "long_truck",
    "transit", "approximated_transit",
]

class Coordinate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)

class RouteRequest(BaseModel):
    waypoints: list[Coordinate] = Field(min_length=2, max_length=20)
    mode: TravelMode = "drive"
    alternatives: int = Field(default=1, ge=1, le=3)

class RerouteRequest(BaseModel):
    waypoints: list[Coordinate] = Field(min_length=2, max_length=20)
    modes: list[TravelMode] = Field(default=["drive", "light_truck"])

