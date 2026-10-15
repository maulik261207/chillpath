"""Bounded Bengaluru road search; no Overpass calls on API requests."""

from __future__ import annotations

from collections import OrderedDict
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.services.road_graph import GRAPH_FILE, GraphUnavailable, OutsideGraph, load_graph
from app.services.route_conditions import RouteCondition, assess_route_conditions, choose_route_metric

router = APIRouter(prefix="/maps", tags=["route-intelligence"])
searches: OrderedDict[str, dict] = OrderedDict()


class Point(BaseModel):
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)


class SearchRequest(BaseModel):
    region_id: str = "bengaluru_centre"
    graph_version: str
    origin: Point
    destination: Point
    weight: str = "condition_aware"
    closed_edge_ids: list[str] = Field(default_factory=list, max_length=100)
    delayed_edge_ids: list[str] = Field(default_factory=list, max_length=100)
    condition: RouteCondition | None = None


class ConditionAssessmentRequest(BaseModel):
    estimated_duration_s: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    condition: RouteCondition | None = None


def region_graph(region_id: str):
    if region_id != "bengaluru_centre":
        raise HTTPException(404, "Only Bengaluru Centre has a prepared driving graph")
    try:
        return load_graph()
    except GraphUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc


@router.get("/regions")
def regions():
    available = GRAPH_FILE.exists()
    return {"items": [{"id": "bengaluru_centre", "name": "Bengaluru Centre", "available": available,
                       "coverage": load_graph().payload["coverage"] if available else "Graph preparation required"}]}


@router.get("/regions/{region_id}")
def region(region_id: str):
    graph = region_graph(region_id)
    return {key: graph.payload[key] for key in ("region_id", "name", "version", "center", "coverage", "source", "speed_policy", "dropped_weak_component_nodes")}


@router.get("/regions/{region_id}/graph")
def graph_geometry(region_id: str):
    region_graph(region_id)
    return FileResponse(GRAPH_FILE, media_type="application/json", headers={"Cache-Control": "no-cache"})


@router.post("/dijkstra")
@router.post("/recalculate")
def dijkstra(request: SearchRequest):
    graph = region_graph(request.region_id)
    if request.graph_version != graph.version:
        raise HTTPException(409, "Road graph version changed; reload the region graph")
    try:
        metric, routing_reason = choose_route_metric(
            request.weight, request.condition,
            has_traffic_penalty=bool(request.delayed_edge_ids),
        )
        origin, origin_snap_m = graph.snap((request.origin.longitude, request.origin.latitude), origin=True)
        destination, destination_snap_m = graph.snap((request.destination.longitude, request.destination.latitude))
        result = graph.search(origin, destination, metric, set(request.closed_edge_ids), set(request.delayed_edge_ids))
    except OutsideGraph as exc:
        raise HTTPException(422, f"Point is {exc.distance_m:.0f} m from supported roads; choose a point within Bengaluru Centre") from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    search_id = str(uuid4())
    searches[search_id] = {"graph_version": graph.version, "events": result.events}
    while len(searches) > 8:
        searches.popitem(last=False)
    return {
        "search_id": search_id, "graph_version": graph.version, "route_available": result.available,
        "weight": metric, "requested_weight": request.weight, "routing_reason": routing_reason,
        "origin_node_id": origin, "destination_node_id": destination,
        "origin": graph.nodes[origin], "destination": graph.nodes[destination],
        "origin_snap_m": origin_snap_m, "destination_snap_m": destination_snap_m,
        "path_edge_ids": result.path_edges, "distance_m": result.distance_m, "estimated_duration_s": result.duration_s,
        "settled_nodes": result.settled_nodes, "examined_edges": result.examined_edges,
        "event_count": len(result.events), "event_url": f"/v1/maps/searches/{search_id}/events",
        "closed_edge_ids": request.closed_edge_ids, "delayed_edge_ids": request.delayed_edge_ids,
        "duration_note": "Estimated from road speed tags or 30 km/h fallback; traffic penalties are simulated.",
        "condition_assessment": assess_route_conditions(request.condition, result.duration_s),
    }


@router.post("/assess-conditions")
def assess_conditions(request: ConditionAssessmentRequest):
    """Refresh sensor impact without repeating the road-graph search."""
    return assess_route_conditions(request.condition, request.estimated_duration_s)


@router.get("/searches/{search_id}/events")
def search_events(search_id: str, offset: int = Query(0, ge=0), limit: int = Query(2000, ge=1, le=5000)):
    search = searches.get(search_id)
    if search is None:
        raise HTTPException(404, "Search expired; recalculate to create a new playback")
    events = search["events"]
    return {"search_id": search_id, "graph_version": search["graph_version"], "offset": offset,
            "total": len(events), "events": events[offset:offset + limit],
            "next_offset": min(len(events), offset + limit)}
