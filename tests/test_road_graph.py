import networkx as nx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.road_graph import OutsideGraph, RoadGraph, haversine, load_graph


def fixture_graph():
    nodes = [[str(i), 77.59 + i * 0.001, 12.97] for i in range(5)]
    def edge(name, u, v, length, seconds):
        return {"id": name, "u": str(u), "v": str(v), "length_m": length, "time_s": seconds,
                "geometry": [[nodes[u][1], nodes[u][2]], [nodes[v][1], nodes[v][2]]]}
    edges = [edge("a", 0, 1, 100, 20), edge("b", 0, 1, 70, 40),
             edge("c", 1, 2, 50, 30), edge("d", 0, 2, 170, 15),
             edge("e", 2, 3, 40, 10)]
    return RoadGraph({"version": "fixture", "nodes": nodes, "edges": edges})


@pytest.mark.parametrize("metric,expected", [("distance", ["b", "c", "e"]), ("time", ["d", "e"])])
def test_dijkstra_matches_networkx(metric, expected):
    graph = fixture_graph()
    result = graph.search("0", "3", metric)
    reference = nx.MultiDiGraph()
    for edge in graph.edges.values():
        reference.add_edge(edge["u"], edge["v"], key=edge["id"], weight=edge["length_m" if metric == "distance" else "time_s"])
    assert result.available and result.path_edges == expected
    assert sum(graph.edges[e]["length_m" if metric == "distance" else "time_s"] for e in result.path_edges) == nx.shortest_path_length(reference, "0", "3", weight="weight")
    assert [event["s"] for event in result.events] == list(range(len(result.events)))
    assert result.events[-1]["t"] == "complete"


def test_parallel_edges_one_way_and_closure():
    graph = fixture_graph()
    assert graph.search("0", "3", closed={"b"}).path_edges == ["a", "c", "e"]
    assert graph.search("0", "3", closed={"a", "b", "d"}).available is False
    assert graph.search("3", "0").available is False


def test_delay_recalculates_and_same_node():
    graph = fixture_graph()
    assert graph.search("0", "3", "time", delayed={"d"}).path_edges == ["a", "c", "e"]
    same = graph.search("2", "2")
    assert same.available and same.path_edges == [] and same.distance_m == 0


def test_invalid_graph_and_snap_boundary():
    graph = fixture_graph()
    with pytest.raises(ValueError, match="Unknown restricted edge"):
        graph.search("0", "3", closed={"bogus"})
    with pytest.raises(OutsideGraph):
        graph.snap((78.0, 13.0))
    bad = {"version": "x", "nodes": [["1", 77.59, 12.97], ["2", 77.60, 12.97]],
           "edges": [{"id": "bad", "u": "1", "v": "2", "length_m": -2, "time_s": 3, "geometry": []}]}
    with pytest.raises(ValueError, match="nonpositive"):
        RoadGraph(bad)


def test_bundled_osm_geometry_and_recalculation():
    graph = load_graph()
    assert len(graph.nodes) > 500 and len(graph.edges) > 1000
    for edge in graph.edges.values():
        assert len(edge["geometry"]) >= 2
        assert haversine(graph.nodes[edge["u"]], edge["geometry"][0]) < 15
        assert haversine(graph.nodes[edge["v"]], edge["geometry"][-1]) < 15
    source, _ = graph.snap((77.5902, 12.9711), origin=True)
    destination, _ = graph.snap((77.6064, 12.9784))
    first = graph.search(source, destination)
    assert first.available and first.path_edges
    assert all(edge_id in graph.edges for edge_id in first.path_edges)
    # Close a middle route segment, leaving the source accessible.
    blocked = first.path_edges[len(first.path_edges) // 2]
    changed = graph.search(source, destination, closed={blocked})
    assert blocked not in changed.path_edges
    assert not changed.available or changed.distance_m >= first.distance_m


def test_route_api_events_and_graph_version():
    graph = load_graph()
    request = {"region_id": "bengaluru_centre", "graph_version": graph.version,
               "origin": {"longitude": 77.5902, "latitude": 12.9711},
               "destination": {"longitude": 77.6064, "latitude": 12.9784},
               "weight": "distance"}
    with TestClient(app) as client:
        region = client.get("/v1/maps/regions/bengaluru_centre")
        assert region.status_code == 200
        assert region.json()["version"] == graph.version
        response = client.post("/v1/maps/dijkstra", json=request)
        assert response.status_code == 200
        route = response.json()
        assert route["route_available"] and route["graph_version"] == graph.version
        page = client.get(route["event_url"], params={"offset": 0, "limit": 100})
        assert page.status_code == 200
        assert page.json()["events"][0]["t"] == "settled"
        assert page.json()["total"] == route["event_count"]
        stale = client.post("/v1/maps/dijkstra", json={**request, "graph_version": "stale"})
        assert stale.status_code == 409
