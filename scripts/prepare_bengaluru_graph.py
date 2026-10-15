"""Fetch once and cache a bounded, directed OpenStreetMap driving graph.

Run from the repository root: .venv/bin/python scripts/prepare_bengaluru_graph.py
The largest weak component is retained so one-way streets remain usable. The
GraphML download is local and ignored; the compact JSON is bundled for demos.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import networkx as nx
import osmnx as ox

ROOT = Path(__file__).resolve().parents[1]
GRAPHML = ROOT / "data" / "bengaluru_centre.graphml"
OSM_XML = ROOT / "data" / "bengaluru_centre.osm"
OUTPUT = ROOT / "data" / "bengaluru_centre.json"
CENTER = (12.9716, 77.5946)
RADIUS_M = 2200


def speed_kph(tags: object) -> float:
    tags = tags if isinstance(tags, list) else [tags]
    for tag in tags:
        value = str(tag).lower().split(";")[0].strip()
        try:
            speed = float(value.split()[0])
            if "mph" in value:
                speed *= 1.609344
            if 5 <= speed <= 130:
                return speed
        except (ValueError, IndexError):
            pass
    return 30.0


def prepare() -> dict:
    if GRAPHML.exists():
        graph = ox.load_graphml(GRAPHML)
    elif OSM_XML.exists():
        # OSM's bounded map API can provide source XML when Overpass is busy.
        # Filter to drivable road classes before caching the directed graph.
        graph = ox.graph_from_xml(OSM_XML, bidirectional=False, simplify=False, retain_all=True)
        driving = {"motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link",
                   "secondary", "secondary_link", "tertiary", "tertiary_link", "residential",
                   "service", "unclassified", "living_street", "road"}
        graph.remove_edges_from((u, v, key) for u, v, key, values in list(graph.edges(keys=True, data=True))
                                if not ({str(value) for value in (values.get("highway") if isinstance(values.get("highway"), list) else [values.get("highway")])} & driving)
                                or str(values.get("motor_vehicle", "yes")) == "no"
                                or str(values.get("access", "yes")) in {"private", "no"})
        graph.remove_nodes_from(list(nx.isolates(graph)))
        graph = ox.simplification.simplify_graph(graph)
        ox.save_graphml(graph, GRAPHML)
    else:
        ox.settings.use_cache = True
        ox.settings.requests_timeout = 180
        graph = ox.graph_from_point(CENTER, dist=RADIUS_M, network_type="drive", simplify=True, retain_all=True)
        GRAPHML.parent.mkdir(parents=True, exist_ok=True)
        ox.save_graphml(graph, GRAPHML)

    if not isinstance(graph, nx.MultiDiGraph) or not graph.is_directed():
        raise ValueError("OSMnx did not return a directed driving MultiDiGraph")
    components = list(nx.weakly_connected_components(graph))
    if not components:
        raise ValueError("Downloaded driving graph is empty")
    largest = max(components, key=len)
    total_nodes = graph.number_of_nodes()
    graph = graph.subgraph(largest).copy()
    if graph.number_of_edges() < 50:
        raise ValueError("Driving graph is too small for a useful demonstration")

    nodes = [
        [str(node), round(float(values["x"]), 7), round(float(values["y"]), 7)]
        for node, values in sorted(graph.nodes(data=True), key=lambda entry: str(entry[0]))
    ]
    edges = []
    for u, v, key, values in sorted(graph.edges(keys=True, data=True), key=lambda entry: tuple(str(x) for x in entry[:3])):
        length = float(values.get("length", 0))
        if not math.isfinite(length) or length <= 0:
            raise ValueError(f"Invalid length for edge {u}:{v}:{key}")
        geometry = values.get("geometry")
        coords = list(geometry.coords) if geometry is not None else [
            (graph.nodes[u]["x"], graph.nodes[u]["y"]),
            (graph.nodes[v]["x"], graph.nodes[v]["y"]),
        ]
        coords = [[round(float(lon), 7), round(float(lat), 7)] for lon, lat in coords]
        speed = speed_kph(values.get("maxspeed"))
        highway = values.get("highway", "road")
        edges.append({
            "id": f"{u}:{v}:{key}", "u": str(u), "v": str(v),
            "length_m": round(length, 2), "speed_kph": speed,
            "time_s": round(length * 3.6 / speed, 3),
            "geometry": coords,
            "highway": str(highway[0] if isinstance(highway, list) else highway),
        })

    coverage = "About 2 km × 2 km central Bengaluru OSM extract" if OSM_XML.exists() else "Bounded 2.2 km radius driving network"
    body = {"region_id": "bengaluru_centre", "name": "Bengaluru Centre", "center": [CENTER[1], CENTER[0]],
            "coverage": coverage, "source": "OpenStreetMap via OSMnx",
            "speed_policy": "OSM maxspeed when valid; otherwise 30 km/h. No live traffic.",
            "dropped_weak_component_nodes": total_nodes - len(nodes), "nodes": nodes, "edges": edges}
    canonical = json.dumps(body, separators=(",", ":"), sort_keys=True).encode()
    body["version"] = hashlib.sha256(canonical).hexdigest()[:16]
    OUTPUT.write_text(json.dumps(body, separators=(",", ":")))
    return {"version": body["version"], "nodes": len(nodes), "edges": len(edges),
            "dropped_weak_component_nodes": body["dropped_weak_component_nodes"]}


if __name__ == "__main__":
    print(prepare())
