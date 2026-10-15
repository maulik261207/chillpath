import { useCallback, useEffect, useRef, useState } from 'react';
import { Map as LibreMapClass, Marker, NavigationControl, setWorkerUrl, type Map as LibreMap, type GeoJSONSource } from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AlertTriangle, ArrowRight, Check, ChevronDown, MapPin, Route, X } from './uiMarks';
import { api, apiBase, connectedMode, organizationId } from './api';
import { useApp } from './store/demoStore';
import './route-intelligence.css';

type Coordinate = [number, number];
type GraphEdge = { id: string; u: string; v: string; length_m: number; time_s: number; geometry: Coordinate[]; highway: string };
type RoadGraph = { version: string; name: string; center: Coordinate; coverage: string; speed_policy: string; nodes: [string, number, number][]; edges: GraphEdge[] };
type ConditionAssessment = { source: 'simulation' | 'sensor' | 'unavailable'; risk: 'normal' | 'at_risk' | 'critical' | 'review' | 'unknown'; signals: string[]; unassessed: string[]; duration_within_exposure_budget: boolean | null; recommendation: string };
type RouteConditionPayload = { source: 'simulation' | 'sensor'; observed_at: string | null; temperature_c: number | null; humidity_pct: number | null; vibration_rms_g: number | null; vibration_peak_g: number | null; evidence_state: string; temperature_min_c: number | null; temperature_max_c: number | null; remaining_exposure_seconds: number | null };
type StoredShipment = { id: string; external_ref: string; origin_label: string; destination_label: string; status: string };
type SearchResult = { search_id: string; graph_version: string; route_available: boolean; path_edge_ids: string[]; distance_m: number | null; estimated_duration_s: number | null; origin: Coordinate; destination: Coordinate; condition_assessment: ConditionAssessment; routing_reason: string };
type PickMode = 'origin' | 'destination' | 'closure' | null;
type View = 'india' | 'city';
type FeatureCollection = { type: 'FeatureCollection'; features: Array<{ type: 'Feature'; properties: Record<string, string>; geometry: { type: 'LineString' | 'Point'; coordinates: Coordinate[] | Coordinate } }> };
type AddressResult = { formatted?: string; address_line1?: string; address_line2?: string; lat: number; lon: number };

const CITY_DEFAULT_START: Coordinate = [77.5902, 12.9711];
const CITY_DEFAULT_END: Coordinate = [77.6064, 12.9784];
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
const MAP_KEY = import.meta.env.VITE_MAPTILER_API_KEY as string | undefined;
setWorkerUrl(mapWorkerUrl);
const CORRIDORS = [
  { id: 'IN-1001', product: 'Insulin · demo', from: 'Delhi', to: 'Mumbai', status: 'Healthy', color: '#68704d', points: [[77.209, 28.614], [76.8, 27.2], [73.9, 22.9], [72.878, 19.076]] as Coordinate[], temp: 4.3, humidity: 61, budget: 45, eta: 'Demo estimate pending' },
  { id: 'IN-1002', product: 'Clinical samples · demo', from: 'Mumbai', to: 'Pune', status: 'At risk', color: '#f0ad6e', points: [[72.878, 19.076], [73.15, 18.8], [73.856, 18.52]] as Coordinate[], temp: 7.8, humidity: 65, budget: 30, eta: 'Demo estimate pending' },
  { id: 'IN-1003', product: 'Vaccine · demo', from: 'Bengaluru', to: 'Hyderabad', status: 'Healthy', color: '#68704d', points: [[77.595, 12.972], [77.6, 14.4], [78.487, 17.385]] as Coordinate[], temp: 4.5, humidity: 59, budget: 60, eta: 'Demo estimate pending' },
  { id: 'IN-1004', product: 'Biologics · demo', from: 'Kolkata', to: 'Delhi', status: 'Sensor review', color: '#82745d', points: [[88.364, 22.573], [84.2, 25.7], [77.209, 28.614]] as Coordinate[], temp: 5.1, humidity: 63, budget: 45, eta: 'Demo estimate pending' },
];

function lineFeatures(ids: Iterable<string>, edges: Map<string, GraphEdge>): FeatureCollection {
  return { type: 'FeatureCollection', features: Array.from(ids, id => edges.get(id)).filter((edge): edge is GraphEdge => Boolean(edge)).map(edge => ({ type: 'Feature', properties: { id: edge.id }, geometry: { type: 'LineString', coordinates: edge.geometry } })) };
}

function setSource(map: LibreMap, id: string, data: FeatureCollection) {
  (map.getSource(id) as GeoJSONSource | undefined)?.setData(data as never);
}

function addCityLayers(map: LibreMap, graph: RoadGraph) {
  if (map.getSource('ri-roads')) return;
  const edges = new Map(graph.edges.map(edge => [edge.id, edge]));
  map.addSource('ri-roads', { type: 'geojson', data: lineFeatures(edges.keys(), edges) as never });
  map.addSource('ri-old', { type: 'geojson', data: EMPTY as never });
  map.addSource('ri-best', { type: 'geojson', data: EMPTY as never });
  map.addSource('ri-closed', { type: 'geojson', data: EMPTY as never });
  map.addLayer({ id: 'ri-road-base', type: 'line', source: 'ri-roads', paint: { 'line-color': '#817c70', 'line-opacity': 0.45, 'line-width': 1.4 } });
  map.addLayer({ id: 'ri-old-line', type: 'line', source: 'ri-old', paint: { 'line-color': '#f0ad6e', 'line-opacity': 0.65, 'line-width': 3, 'line-dasharray': [2, 2] } });
  map.addLayer({ id: 'ri-best-glow', type: 'line', source: 'ri-best', paint: { 'line-color': '#68704d', 'line-opacity': 0, 'line-width': 0 } });
  map.addLayer({ id: 'ri-best-core', type: 'line', source: 'ri-best', paint: { 'line-color': '#68704d', 'line-width': 4.2, 'line-opacity': 1 } });
  map.addLayer({ id: 'ri-closed-line', type: 'line', source: 'ri-closed', paint: { 'line-color': '#ff695c', 'line-width': 5, 'line-opacity': 0.94, 'line-dasharray': [1, 1] } });
  map.addLayer({ id: 'ri-road-hit', type: 'line', source: 'ri-roads', paint: { 'line-color': '#ffffff', 'line-width': 18, 'line-opacity': 0 } });
}

function interpolateRoute(path: string[], edges: Map<string, GraphEdge>, fraction: number): Coordinate | null {
  const segments = path.map(id => edges.get(id)).filter((edge): edge is GraphEdge => Boolean(edge));
  if (!segments.length) return null;
  const total = segments.reduce((sum, edge) => sum + edge.length_m, 0);
  let remaining = Math.max(0, Math.min(1, fraction)) * total;
  for (const edge of segments) {
    if (remaining > edge.length_m) { remaining -= edge.length_m; continue; }
    const coords = edge.geometry;
    if (coords.length < 2) return coords[0] ?? null;
    const progress = remaining / edge.length_m;
    const index = Math.min(coords.length - 2, Math.floor(progress * (coords.length - 1)));
    const local = progress * (coords.length - 1) - index;
    return [coords[index][0] + (coords[index + 1][0] - coords[index][0]) * local,
      coords[index][1] + (coords[index + 1][1] - coords[index][1]) * local];
  }
  return segments.at(-1)!.geometry.at(-1) ?? null;
}

function AddressSearch({ label, value, graph, role, onTextChange, onSelect }: {
  label: string; value: string; graph: RoadGraph | null; role: 'origin' | 'destination';
  onTextChange: (value: string) => void; onSelect: (value: string, point: Coordinate) => void;
}) {
  const [results, setResults] = useState<AddressResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [chosen, setChosen] = useState(false);
  useEffect(() => {
    if (chosen || value.trim().length < 3) { setResults([]); setLoading(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true); setMessage('');
      void api<{ results: AddressResult[] }>(`/maps/autocomplete?text=${encodeURIComponent(`${value.trim()}, Bengaluru, Karnataka, India`)}&limit=5`, { signal: controller.signal })
        .then(data => setResults((data.results ?? []).filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lon))))
        .catch(cause => { if (!controller.signal.aborted) setMessage(cause instanceof Error ? cause.message : 'Address search unavailable.'); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [chosen, value]);
  const choose = (item: AddressResult) => {
    if (!graph) { setMessage('Road coverage is still loading. Try again shortly.'); return; }
    const distance = (node: [string, number, number]) => Math.hypot((item.lon - node[1]) * 108000 * Math.cos(item.lat * Math.PI / 180), (item.lat - node[2]) * 111000);
    const outbound = role === 'origin' ? new Set(graph.edges.map(edge => edge.u)) : null;
    let nearest: [string, number, number] | undefined;
    for (const node of graph.nodes) if ((!outbound || outbound.has(node[0])) && (!nearest || distance(node) < distance(nearest))) nearest = node;
    if (!nearest || distance(nearest) > 350) { setMessage('This address is outside the supported Bengaluru road area. Choose one within the highlighted city roads.'); return; }
    setChosen(true); setResults([]); setMessage('');
    onSelect(item.formatted || [item.address_line1, item.address_line2].filter(Boolean).join(', ') || value, [nearest[1], nearest[2]]);
  };
  return <div className="ri-field ri-address"><label htmlFor={`ri-${role}-address`}>{label}</label><input id={`ri-${role}-address`} type="search" autoComplete="off" placeholder="Search a Bengaluru address" value={value} onChange={event => { setChosen(false); setMessage(''); onTextChange(event.target.value); }}/>{loading && <small>Searching addresses…</small>}{results.length > 0 && <div className="ri-address-results" role="listbox" aria-label={`${label} suggestions`}>{results.map((item, index) => <button key={`${item.lat}-${item.lon}-${index}`} type="button" role="option" aria-selected="false" onClick={() => choose(item)}><MapPin size={14}/>{item.formatted || [item.address_line1, item.address_line2].filter(Boolean).join(', ')}</button>)}</div>}{message && <small className="ri-address-error" role="alert">{message}</small>}</div>;
}

export default function RouteIntelligence() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const graphRef = useRef<RoadGraph | null>(null);
  const edgesRef = useRef<Map<string, GraphEdge>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const pickRef = useRef<PickMode>(null);
  const viewRef = useRef<View>('india');
  const runRef = useRef<((closed?: string[]) => void) | null>(null);
  const closedRef = useRef<string[]>([]);
  const [view, setView] = useState<View>('india');
  const [graph, setGraph] = useState<RoadGraph | null>(null);
  const [origin, setOrigin] = useState<Coordinate>(CITY_DEFAULT_START);
  const [destination, setDestination] = useState<Coordinate>(CITY_DEFAULT_END);
  const [originLabel, setOriginLabel] = useState('');
  const [destinationLabel, setDestinationLabel] = useState('');
  const [originChosen, setOriginChosen] = useState(false);
  const [destinationChosen, setDestinationChosen] = useState(false);
  const [weight, setWeight] = useState<'condition_aware' | 'distance' | 'time'>('condition_aware');
  const [pick, setPick] = useState<PickMode>(null);
  const [closed, setClosed] = useState<string[]>([]);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [previousPath, setPreviousPath] = useState<string[]>([]);
  const [complete, setComplete] = useState(false);
  const [assessment, setAssessment] = useState<ConditionAssessment | null>(null);
  const [storedShipments, setStoredShipments] = useState<StoredShipment[]>([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState('demo');
  const [storedCondition, setStoredCondition] = useState<RouteConditionPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mapError, setMapError] = useState('');
  const [selected, setSelected] = useState(CORRIDORS[2]);
  const [leftOpen, setLeftOpen] = useState(() => !window.matchMedia('(max-width: 720px)').matches);
  const [rightOpen, setRightOpen] = useState(() => !window.matchMedia('(max-width: 720px)').matches);
  const scenario = useApp(state => state.scenario);
  const temperature = useApp(state => state.temperatureC);
  const exposure = useApp(state => state.confirmedExposureSeconds);
  const uncertain = useApp(state => state.uncertainExposureSeconds);
  const delaySeconds = useApp(state => state.delaySeconds);
  const elapsed = useApp(state => state.elapsedSeconds);
  const evidence = useApp(state => state.evidenceState);
  const humidity = useApp(state => state.readings.at(-1)?.humidityPct ?? null);
  const observedAt = useApp(state => state.readings.at(-1)?.observedAt ?? null);
  pickRef.current = pick;
  viewRef.current = view;

  useEffect(() => {
    if (!connectedMode || !organizationId) return;
    const controller = new AbortController();
    void api<StoredShipment[]>(`/shipments?organization_id=${encodeURIComponent(organizationId)}`, { signal: controller.signal })
      .then(setStoredShipments).catch(() => { /* Demo routing remains available if the connected API is offline. */ });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (selectedShipmentId === 'demo' || !organizationId || view !== 'city') {
      setStoredCondition(null);
      return;
    }
    const orgId = organizationId;
    const controller = new AbortController();
    const refresh = () => {
      void api<{ condition: RouteConditionPayload | null }>(
        `/shipments/${encodeURIComponent(selectedShipmentId)}/route-condition?organization_id=${encodeURIComponent(orgId)}`,
        { signal: controller.signal },
      ).then(data => setStoredCondition(data.condition))
        .catch(() => { if (!controller.signal.aborted) setStoredCondition(null); });
    };
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => { window.clearInterval(timer); controller.abort(); };
  }, [selectedShipmentId, view]);

  useEffect(() => {
    if (!mapContainer.current || !MAP_KEY) return;
    const map = new LibreMapClass({ container: mapContainer.current,
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(MAP_KEY)}`,
      center: [79.5, 21], zoom: 4.1, minZoom: 3.3, maxZoom: 17 });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
    map.on('error', event => { if (String(event.error?.message ?? '').match(/401|403|style|key|worker failed|webgl/i)) setMapError('Map unavailable. Check the MapTiler browser key, allowed origins, and browser graphics support.'); });
    map.on('load', () => {
      map.addSource('ri-corridors', { type: 'geojson', data: { type: 'FeatureCollection', features: CORRIDORS.map(c => ({ type: 'Feature', properties: { id: c.id, color: c.color }, geometry: { type: 'LineString', coordinates: c.points } })) } as never });
      map.addLayer({ id: 'ri-corridor-lines', type: 'line', source: 'ri-corridors', paint: { 'line-color': ['get', 'color'], 'line-opacity': 0.68, 'line-width': 2.5, 'line-dasharray': [3, 2] } });
      map.addSource('ri-corridor-dots', { type: 'geojson', data: { type: 'FeatureCollection', features: CORRIDORS.flatMap(c => [c.points[0], c.points.at(-1)!].map(coordinate => ({ type: 'Feature', properties: { id: c.id, color: c.color }, geometry: { type: 'Point', coordinates: coordinate } }))) } as never });
      map.addLayer({ id: 'ri-corridor-points', type: 'circle', source: 'ri-corridor-dots', paint: { 'circle-color': ['get', 'color'], 'circle-radius': 5, 'circle-stroke-color': '#06141f', 'circle-stroke-width': 2 } });
      if (graphRef.current) addCityLayers(map, graphRef.current);
    });
    map.on('click', event => {
      if (viewRef.current !== 'city' || !graphRef.current || !map.getLayer('ri-road-hit')) return;
      const hits = map.queryRenderedFeatures(event.point, { layers: ['ri-road-hit'] });
      if (!hits.length) { setError('Choose a road within the supported Bengaluru Centre graph.'); return; }
      const action = pickRef.current;
      if (!action) return;
      if (action === 'closure') {
        const hit = hits[0].properties?.id as string | undefined;
        const edge = hit && edgesRef.current.get(hit);
        if (!edge) return;
        const matching = Array.from(edgesRef.current.values()).filter(item => (item.u === edge.u && item.v === edge.v) || (item.u === edge.v && item.v === edge.u)).map(item => item.id);
        const next = Array.from(new Set([...closedRef.current, ...matching]));
        closedRef.current = next;
        setClosed(next);
        queueMicrotask(() => runRef.current?.(next));
      } else {
        const point: Coordinate = [event.lngLat.lng, event.lngLat.lat];
        const nodes = graphRef.current.nodes;
        const distance = (node: [string, number, number]) => Math.hypot((point[0] - node[1]) * 108000, (point[1] - node[2]) * 111000);
        let nearest: [string, number, number] | undefined;
        for (const node of nodes) if ((!nearest || distance(node) < distance(nearest)) && (action !== 'origin' || Array.from(edgesRef.current.values()).some(edge => edge.u === node[0]))) nearest = node;
        if (!nearest || distance(nearest) > 350) { setError('No accessible driving node within 350 m. Choose a supported road.'); return; }
        const snapped: Coordinate = [nearest[1], nearest[2]];
        if (action === 'origin') setOrigin(snapped); else setDestination(snapped);
        setPick(null); setError('');
      }
    });
    return () => { abortRef.current?.abort(); markers.current.forEach(marker => marker.remove()); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: view === 'india' ? [79.5, 21] : [77.5946, 12.9716], zoom: view === 'india' ? 4.1 : 14.2, duration: 1100 });
    const toggle = () => {
      for (const id of ['ri-corridor-lines', 'ri-corridor-points']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', view === 'india' ? 'visible' : 'none');
      for (const id of ['ri-road-base', 'ri-road-hit', 'ri-best-glow', 'ri-best-core', 'ri-old-line', 'ri-closed-line'])
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', view === 'city' ? 'visible' : 'none');
    };
    toggle(); map.on('load', toggle);
    return () => { map.off('load', toggle); };
  }, [view, graph]);

  useEffect(() => {
    if (view !== 'city' || graphRef.current) return;
    const controller = new AbortController();
    fetch(`${apiBase}/v1/maps/regions/bengaluru_centre/graph`, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error((await response.json()).detail || 'Cached Bengaluru road graph unavailable');
      return response.json() as Promise<RoadGraph>;
    }).then(data => {
      if (controller.signal.aborted) return;
      graphRef.current = data; edgesRef.current = new Map(data.edges.map(edge => [edge.id, edge]));
      setGraph(data);
      const map = mapRef.current;
      if (map?.isStyleLoaded()) addCityLayers(map, data);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Graph unavailable'); });
    return () => controller.abort();
  }, [view]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !graph) return;
    markers.current.forEach(marker => marker.remove()); markers.current = [];
    if (view !== 'city') return;
    for (const [coordinate, role] of [[origin, 'origin'], [destination, 'destination']] as [Coordinate, string][]) {
      if (role === 'origin' && !originChosen || role === 'destination' && !destinationChosen) continue;
      const element = document.createElement('div'); element.className = `ri-marker ri-${role}`;
      element.title = role === 'origin' ? 'Green origin' : 'Red destination';
      markers.current.push(new Marker({ element }).setLngLat(coordinate).addTo(map));
    }
  }, [view, graph, origin, destination, originChosen, destinationChosen]);

  const currentCondition = useCallback((): RouteConditionPayload | null => selectedShipmentId !== 'demo' ? storedCondition : ({
    source: 'simulation',
    observed_at: new Date(observedAt ?? Date.now()).toISOString(),
    temperature_c: temperature,
    humidity_pct: humidity,
    vibration_rms_g: null,
    vibration_peak_g: null,
    evidence_state: evidence,
    temperature_min_c: 2,
    temperature_max_c: 8,
    remaining_exposure_seconds: Math.max(0, 45 * 60 - exposure),
  }), [selectedShipmentId, storedCondition, observedAt, temperature, humidity, evidence, exposure]);

  const runSearch = useCallback(async (closedOverride?: string[]) => {
    const currentGraph = graphRef.current;
    if (!originChosen || !destinationChosen) { setError('Select both addresses from the search suggestions first.'); return; }
    if (!currentGraph) { setError('Load the Bengaluru road graph first.'); return; }
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) { setError('Map is not ready. Check the MapTiler key and reload.'); return; }
    abortRef.current?.abort();
    const controller = new AbortController(); abortRef.current = controller;
    const previous = result?.route_available ? result.path_edge_ids : previousPath;
    setPreviousPath(previous);
    setSource(map, 'ri-old', lineFeatures(previous, edgesRef.current));
    setSource(map, 'ri-best', EMPTY);
    setComplete(false); setBusy(true); setError(''); setResult(null); setAssessment(null);
    const restrictions = closedOverride ?? closed;
    setSource(map, 'ri-closed', lineFeatures(restrictions, edgesRef.current));
    try {
      let condition = currentCondition();
      if (selectedShipmentId !== 'demo' && organizationId) {
        const context = await api<{ condition: RouteConditionPayload | null }>(
          `/shipments/${encodeURIComponent(selectedShipmentId)}/route-condition?organization_id=${encodeURIComponent(organizationId)}`,
          { signal: controller.signal },
        );
        condition = context.condition;
        setStoredCondition(condition);
      }
      const delayed = scenario === 'traffic_delay' && weight !== 'distance' && previous.length ? previous.slice(Math.max(0, Math.floor(previous.length / 3) - 2), Math.floor(previous.length / 3) + 3) : [];
      const response = await fetch(`${apiBase}/v1/maps/${previous.length ? 'recalculate' : 'dijkstra'}`, { method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region_id: 'bengaluru_centre', graph_version: currentGraph.version,
          origin: { longitude: origin[0], latitude: origin[1] }, destination: { longitude: destination[0], latitude: destination[1] },
          weight, closed_edge_ids: restrictions, delayed_edge_ids: delayed, condition }),
      });
      if (!response.ok) { const body = await response.json(); throw new Error(body.detail || 'Route search failed'); }
      const answer = await response.json() as SearchResult;
      if (answer.graph_version !== currentGraph.version) throw new Error('Road graph version changed. Reload this page.');
      if (controller.signal.aborted) return;
      setResult(answer); setAssessment(answer.condition_assessment); setComplete(true);
      setSource(map, 'ri-best', answer.route_available ? lineFeatures(answer.path_edge_ids, edgesRef.current) : EMPTY);
      setOrigin(answer.origin); setDestination(answer.destination);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Search failed'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }, [closed, destination, origin, originChosen, destinationChosen, previousPath, result, scenario, weight, currentCondition, selectedShipmentId]);
  runRef.current = (next) => { void runSearch(next); };

  useEffect(() => {
    if (view !== 'city' || !result || !complete) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void api<ConditionAssessment>('/maps/assess-conditions', {
        method: 'POST', signal: controller.signal,
        body: JSON.stringify({ estimated_duration_s: result.estimated_duration_s, condition: currentCondition() }),
      }).then(setAssessment).catch(() => { /* Keep the last clearly labeled assessment if temporarily offline. */ });
    }, 600);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [view, result, complete, currentCondition]);

  useEffect(() => {
    if (view !== 'city' || selectedShipmentId !== 'demo' || !complete || !result?.route_available) return;
    const coordinate = interpolateRoute(result.path_edge_ids, edgesRef.current, Math.min(0.98, elapsed / 900));
    if (!coordinate) return;
    const map = mapRef.current;
    if (!map) return;
    const element = document.createElement('div'); element.className = `ri-vehicle ${temperature > 8 ? 'is-critical' : ''}`; element.textContent = '✦';
    const marker = new Marker({ element }).setLngLat(coordinate).addTo(map);
    return () => { marker.remove(); };
  }, [view, selectedShipmentId, complete, result, elapsed, temperature]);

  const clearClosures = () => { closedRef.current = []; setClosed([]); if (mapRef.current) setSource(mapRef.current, 'ri-closed', EMPTY); if (result) void runSearch([]); };
  const invalidateRoute = () => { abortRef.current?.abort(); setBusy(false); setResult(null); setAssessment(null); setComplete(false); setPreviousPath([]); const map = mapRef.current; if (map) { setSource(map, 'ri-best', EMPTY); setSource(map, 'ri-old', EMPTY); } };
  const risk = assessment?.risk ?? 'unknown';
  const selectedStored = storedShipments.find(shipment => shipment.id === selectedShipmentId);
  const recovery = selectedShipmentId !== 'demo' ? 'Selected road points are operator chosen. Stored shipments do not yet include verified route coordinates; confirm the points before using this route.'
    : scenario === 'destination_closure' ? 'No verified alternate receiving facility is configured. Route substitution is unavailable.'
    : scenario === 'refrigeration_failure' ? 'Review refrigeration and protect remaining exposure budget. No verified cold-storage site is configured.'
    : scenario === 'traffic_delay' ? 'Recalculate to apply a simulated traffic penalty to five prior route edges, then compare the old and new routes.'
    : closed.length ? 'Closed road edges are removed from graph search. Compare the previous amber route with the new cyan route.'
    : 'Shipment conditions are within the demo policy. Continue monitored delivery.';

  return <div className="ri-page">
    <div className="ri-heading"><div><span className="ri-eyebrow">CHILLPATH / ROUTE INTELLIGENCE</span><h1>Know every road ahead.</h1><p>Indian road routes · shipment conditions · recovery decisions</p></div><span className="ri-live"><i/> {graph ? 'BENGALURU ROADS READY' : 'INDIA FLEET VIEW'}</span></div>
    <div className="ri-stage">
      <div ref={mapContainer} className="ri-map" role="application" aria-label="Interactive India and Bengaluru road map" />
      {!MAP_KEY && <div className="ri-map-message">Set VITE_MAPTILER_API_KEY in frontend/.env.local to load the MapTiler basemap.</div>}
      {mapError && <div className="ri-map-message" role="alert">{mapError}</div>}
      <div className="ri-topstrip"><span><i/> {view === 'india' ? 'INDIA FLEET · DEMONSTRATION CORRIDORS' : graph ? 'BENGALURU CENTRE · ROAD ROUTING' : 'LOADING BENGALURU ROADS'}</span><span>{view === 'city' && graph ? 'SELECT POINTS · RUN ROUTE · REVIEW CONDITIONS' : 'PAN AND ZOOM TO EXPLORE'}</span></div>
      <aside className={`ri-panel ri-left ${leftOpen ? '' : 'is-collapsed'}`}>
        <button className="ri-panel-toggle" onClick={() => setLeftOpen(!leftOpen)} aria-label="Toggle route controls">{leftOpen ? <X size={16}/> : <Route size={17}/>}</button>
        {leftOpen && <><div className="ri-panel-kicker">MAP CONTROL</div><h2>Route explorer</h2>
          <div className="ri-segmented"><button className={view === 'india' ? 'active' : ''} onClick={() => setView('india')}>India fleet</button><button className={view === 'city' ? 'active' : ''} onClick={() => setView('city')}>City search</button></div>
          {view === 'india' ? <><p className="ri-helper">These seeded corridors illustrate shipment coverage. Road routes are available in the supported Bengaluru area.</p><div className="ri-list">{CORRIDORS.map(item => <button key={item.id} className={selected.id === item.id ? 'active' : ''} onClick={() => { setSelected(item); mapRef.current?.flyTo({ center: item.points[Math.floor(item.points.length / 2)], zoom: item.id === 'IN-1002' ? 7 : 5.4 }); }}><span className="ri-list-dot" style={{ background: item.color }}/><span><b>{item.from} → {item.to}</b><small>{item.id} · {item.product}</small></span><ArrowRight size={14}/></button>)}</div></> : <>
            <p className="ri-helper">City coverage: {graph?.coverage ?? 'Loading cached roads…'} Search for two addresses within this area.</p>
            <label className="ri-field"><span>SHIPMENT CONDITIONS</span><select value={selectedShipmentId} onChange={event => { setSelectedShipmentId(event.target.value); setAssessment(null); }}><option value="demo">Demo simulation</option>{storedShipments.map(shipment => <option value={shipment.id} key={shipment.id}>{shipment.external_ref} · stored</option>)}</select></label>
            {selectedShipmentId !== 'demo' && <p className="ri-note">Stored sensor readings and product policy are read from the API. Search addresses manually; verified shipment GPS and route assignments are not stored yet.</p>}
            <AddressSearch label="ORIGIN · GREEN" value={originLabel} graph={graph} role="origin" onTextChange={text => { setOriginLabel(text); setOriginChosen(false); invalidateRoute(); }} onSelect={(text, point) => { setOriginLabel(text); setOrigin(point); setOriginChosen(true); invalidateRoute(); setError(''); mapRef.current?.flyTo({ center: point, zoom: 15 }); }}/>
            <AddressSearch label="DESTINATION · RED" value={destinationLabel} graph={graph} role="destination" onTextChange={text => { setDestinationLabel(text); setDestinationChosen(false); invalidateRoute(); }} onSelect={(text, point) => { setDestinationLabel(text); setDestination(point); setDestinationChosen(true); invalidateRoute(); setError(''); mapRef.current?.flyTo({ center: point, zoom: 15 }); }}/>
            <label className="ri-field"><span>OPTIMIZE FOR</span><select value={weight} onChange={event => setWeight(event.target.value as 'condition_aware' | 'distance' | 'time')}><option value="condition_aware">Cold-chain priority</option><option value="distance">Shortest distance</option><option value="time">Estimated fastest</option></select></label>
            <div className="ri-field"><span>ROAD RESTRICTIONS</span><button className={pick === 'closure' ? 'is-picking' : ''} onClick={() => setPick(pick === 'closure' ? null : 'closure')}><AlertTriangle size={15}/>{pick === 'closure' ? 'Click a road to block it…' : `Close road segment · ${closed.length} edges`}</button>{closed.length > 0 && <button className="ri-clear" onClick={clearClosures}>Clear road closures</button>}</div>
            <button className="ri-primary" disabled={!graph || busy || !originChosen || !destinationChosen} onClick={() => void runSearch()}>{busy ? 'Calculating route…' : result ? 'Run again' : 'Run'} <ArrowRight size={16}/></button>
            <p className="ri-note">Estimated time uses road speed tags or 30 km/h. Traffic penalties are simulated; this is not live traffic.</p>
          </>}
        </>}
      </aside>
      <aside className={`ri-panel ri-right ${rightOpen ? '' : 'is-collapsed'}`}>
        <button className="ri-panel-toggle" onClick={() => setRightOpen(!rightOpen)} aria-label="Toggle route details">{rightOpen ? <X size={16}/> : <ChevronDown size={17}/>}</button>
        {rightOpen && <><div className="ri-panel-kicker">INTELLIGENCE PANEL</div><h2>{view === 'india' ? selected.id : selectedStored?.external_ref ?? 'Bengaluru demo route'}</h2>
          <p className="ri-helper">{view === 'india' ? `${selected.product} · ${selected.from} → ${selected.to}` : selectedStored ? `${selectedStored.origin_label} → ${selectedStored.destination_label} · stored ${storedCondition?.source ?? 'unavailable'} data` : 'Synthetic shipment telemetry over a real road route'}</p>
          <div className="ri-risk"><i style={{ background: view === 'india' ? selected.color : risk === 'critical' ? '#ff6868' : risk === 'at_risk' ? '#f0ad6e' : risk === 'review' ? '#b69afb' : risk === 'unknown' ? '#8daab5' : '#57dcb0' }}/>{view === 'india' ? selected.status : risk === 'at_risk' ? 'AT RISK' : risk === 'review' ? 'SENSOR REVIEW' : risk.toUpperCase()}</div>
          <div className="ri-stat-grid"><div><span>DISTANCE</span><b>{view === 'city' && complete && result?.distance_m != null ? `${(result.distance_m / 1000).toFixed(2)} km` : ':'}</b></div><div><span>MODELED DURATION</span><b>{view === 'city' && complete && result?.estimated_duration_s != null ? `${Math.ceil(result.estimated_duration_s / 60)} min` : ':'}</b></div><div><span>TEMPERATURE</span><b>{view === 'india' ? `${selected.temp.toFixed(1)}°C` : selectedStored ? storedCondition?.temperature_c == null ? 'No reading' : `${storedCondition.temperature_c.toFixed(1)}°C` : `${temperature.toFixed(1)}°C demo`}</b></div><div><span>HUMIDITY</span><b>{view === 'india' ? `${selected.humidity}% demo` : selectedStored ? storedCondition?.humidity_pct == null ? 'No reading' : `${storedCondition.humidity_pct}%` : humidity == null ? 'No reading' : `${humidity}% demo`}</b></div><div><span>EXPOSURE LEFT</span><b>{view === 'india' ? `${selected.budget} min demo` : selectedStored ? storedCondition?.remaining_exposure_seconds == null ? 'Unknown' : `${Math.floor(storedCondition.remaining_exposure_seconds / 60)} min` : `${Math.max(0, 45 - Math.floor(exposure / 60))} min demo`}</b></div><div><span>ETA</span><b>{view === 'india' ? selected.eta : result?.estimated_duration_s ? `${Math.ceil(result.estimated_duration_s / 60) + (selectedStored ? 0 : Math.floor(delaySeconds / 60))} min model` : 'Pending'}</b></div></div>
          {view === 'city' && <><p className="ri-sensor-note">Vibration RMS / peak: {selectedStored ? `${storedCondition?.vibration_rms_g ?? ':'} / ${storedCondition?.vibration_peak_g ?? ':'} g` : 'No demo readings'} · Evidence: {selectedStored ? storedCondition?.evidence_state ?? 'unavailable' : evidence.replaceAll('_', ' ')}</p><div className="ri-divider"/><div className="ri-route-status"><span>ROUTE STATUS</span><strong>{busy ? 'Calculating route…' : complete ? result?.route_available ? 'Road route ready' : 'No reachable road route' : 'Choose points and press Run'}</strong><small>{result?.routing_reason ?? 'Cold-chain priority uses stored policy and credible sensor evidence when available.'} {closed.length ? `${closed.length} restricted road edges. ` : ''}Travel time is estimated, not live traffic.</small></div><div className="ri-divider"/><div className="ri-panel-kicker">SENSOR & POLICY REVIEW</div>{assessment?.signals.map(signal => <p className="ri-signal" key={signal}>{signal}</p>)}<p className="ri-recovery">{assessment?.recommendation ?? 'Run a route to assess its travel time against the available shipment readings and policy.'}</p><small className="ri-disclaimer">{assessment?.unassessed.length ? `Not assessed: ${assessment.unassessed.join(', ')}. ` : ''}{!selectedStored && uncertain > 0 ? 'Exposure includes uncertain evidence. ' : ''}{selectedStored ? `Stored telemetry source: ${storedCondition?.source ?? 'unavailable'}. ` : 'Readings shown here are simulated. '}Operator review is required for interventions.</small><div className="ri-divider"/><div className="ri-panel-kicker">ROUTE RESPONSE</div><p className="ri-recovery">{recovery}</p></>}
          {view === 'india' && <p className="ri-note">Locations and positions are illustrative demo data. Corridors are geographic guides, not computed nationwide road routes or GPS readings.</p>}
        </>}
      </aside>
      {error && <div className="ri-error" role="alert"><AlertTriangle size={16}/>{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={14}/></button></div>}
      <div className="ri-attribution">© OpenStreetMap contributors · MapTiler · City roads cached from OSM</div>
    </div>
    <div className="ri-footer"><span><Check size={15}/> Road routing is computed on the server for supported Bengaluru streets</span><span>India corridor and cold-chain state are labeled demonstrations</span></div>
  </div>;
}
