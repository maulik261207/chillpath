"""Cached OSM driving graph and an instrumented, directed Dijkstra search."""

from __future__ import annotations

import heapq
import json
import math
from collections import defaultdict
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

GRAPH_FILE = Path(__file__).resolve().parents[2] / "data" / "bengaluru_centre.json"
SNAP_LIMIT_M = 350


class GraphUnavailable(Exception):
    pass


class OutsideGraph(Exception):
    def __init__(self, distance_m: float) -> None:
        self.distance_m = distance_m


def haversine(a: tuple[float, float], b: tuple[float, float]) -> float:
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 12_742_000 * math.asin(math.sqrt(h))


@dataclass(frozen=True)
class SearchResult:
    available: bool
    path_edges: list[str]
    distance_m: float | None
    duration_s: float | None
    events: list[dict]
    settled_nodes: int
    examined_edges: int
    snapped_origin: str
    snapped_destination: str


class RoadGraph:
    def __init__(self, payload: dict) -> None:
        self.payload = payload
        self.version = str(payload["version"])
        self.nodes: dict[str, tuple[float, float]] = {str(node): (float(lon), float(lat)) for node, lon, lat in payload["nodes"]}
        self.edges: dict[str, dict] = {edge["id"]: edge for edge in payload["edges"]}
        self.outgoing: dict[str, list[dict]] = defaultdict(list)
        for edge in self.edges.values():
            if edge["u"] not in self.nodes or edge["v"] not in self.nodes:
                raise ValueError("Edge references missing node")
            if not all(math.isfinite(float(edge[name])) and float(edge[name]) > 0 for name in ("length_m", "time_s")):
                raise ValueError("Edge has nonpositive or invalid weight")
            self.outgoing[edge["u"]].append(edge)
        for edges in self.outgoing.values():
            edges.sort(key=lambda edge: edge["id"])

    def snap(self, coordinate: tuple[float, float], *, origin: bool = False) -> tuple[str, float]:
        candidates = self.outgoing.keys() if origin else self.nodes.keys()
        node = min(candidates, key=lambda key: haversine(coordinate, self.nodes[key]), default=None)
        if node is None:
            raise GraphUnavailable("No accessible graph nodes")
        distance = haversine(coordinate, self.nodes[node])
        if distance > SNAP_LIMIT_M:
            raise OutsideGraph(distance)
        return node, round(distance, 1)

    def search(self, source: str, destination: str, metric: str = "distance", closed: set[str] | None = None,
               delayed: set[str] | None = None) -> SearchResult:
        if source not in self.nodes or destination not in self.nodes:
            raise ValueError("Unknown graph node")
        if metric not in {"distance", "time"}:
            raise ValueError("Unsupported routing metric")
        closed, delayed = closed or set(), delayed or set()
        if (closed | delayed) - self.edges.keys():
            raise ValueError("Unknown restricted edge")
        distance = {source: 0.0}
        predecessor: dict[str, tuple[str, str]] = {}
        queue = [(0.0, source)]
        settled: set[str] = set()
        events: list[dict] = []
        examined = 0
        while queue:
            cost, node = heapq.heappop(queue)
            if node in settled or cost > distance[node] + 1e-9:
                continue
            settled.add(node)
            events.append({"s": len(events), "t": "settled", "n": node})
            if node == destination:
                events.append({"s": len(events), "t": "destination", "n": node})
                break
            for edge in self.outgoing[node]:
                if edge["id"] in closed:
                    continue
                examined += 1
                events.append({"s": len(events), "t": "examined", "e": edge["id"]})
                weight = float(edge["length_m"] if metric == "distance" else edge["time_s"])
                if edge["id"] in delayed:
                    weight *= 4  # Clearly simulated traffic penalty; no live traffic source.
                candidate = cost + weight
                target = edge["v"]
                if candidate + 1e-9 < distance.get(target, math.inf):
                    distance[target] = candidate
                    predecessor[target] = (node, edge["id"])
                    heapq.heappush(queue, (candidate, target))
                    events.append({"s": len(events), "t": "relaxed", "e": edge["id"], "n": target})

        if destination not in settled:
            events.append({"s": len(events), "t": "unreachable"})
            return SearchResult(False, [], None, None, events, len(settled), examined, source, destination)
        path: list[str] = []
        node = destination
        while node != source:
            previous, edge_id = predecessor[node]
            path.append(edge_id)
            node = previous
        path.reverse()
        events.append({"s": len(events), "t": "complete"})
        return SearchResult(True, path, round(sum(self.edges[e]["length_m"] for e in path), 1),
                            round(sum(self.edges[e]["time_s"] * (4 if e in delayed else 1) for e in path), 1),
                            events, len(settled), examined, source, destination)


@lru_cache(maxsize=1)
def load_graph() -> RoadGraph:
    if not GRAPH_FILE.exists():
        raise GraphUnavailable("Bengaluru road graph has not been prepared; run scripts/prepare_bengaluru_graph.py")
    return RoadGraph(json.loads(GRAPH_FILE.read_text()))
