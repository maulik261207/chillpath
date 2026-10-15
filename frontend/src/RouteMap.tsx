import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ArrowRight, LocateFixed, Minus, Navigation, Plus, RefreshCw, Route, Truck } from './uiMarks';
import { getRoute, mapTileUrl, type MapRoute, type TravelMode } from './api';

const ORIGIN = { latitude: 12.9716, longitude: 77.5946 };
const DESTINATION = { latitude: 12.2958, longitude: 76.6394 };
const ZOOM = 9;
const WIDTH = 1000;
const HEIGHT = 580;
const TILE = 256;
const MODES: ModeItem[] = [
  { id: 'truck', label: 'Truck', category: 'freight' },
  { id: 'drive', label: 'Car', category: 'road' },
];

type ModeItem = { id: TravelMode; label: string; category: string };
type Point = [number, number];

function worldPoint(longitude: number, latitude: number): Point {
  const size = TILE * 2 ** ZOOM;
  const bounded = Math.max(-85.0511, Math.min(85.0511, latitude));
  const sin = Math.sin(bounded * Math.PI / 180);
  return [
    (longitude + 180) / 360 * size,
    (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  ];
}

function routeCoordinates(route?: MapRoute): Point[] {
  const geometry = route?.geometry as { type?: string; coordinates?: unknown } | undefined;
  if (!geometry?.coordinates) return [];
  const points = geometry.type === 'LineString'
    ? geometry.coordinates as Point[]
    : geometry.type === 'MultiLineString' ? (geometry.coordinates as Point[][]).flat() : [];
  // Preserve road bends and junctions even when the map is zoomed in.
  return points;
}

function modeIcon(category?: string) {
  if (category === 'freight' || category === 'road') return <Truck size={15}/>;
  return <Navigation size={15}/>;
}

function basicRoute(mode: TravelMode): MapRoute {
  const earthKm = 6371;
  const lat1 = ORIGIN.latitude * Math.PI / 180;
  const lat2 = DESTINATION.latitude * Math.PI / 180;
  const deltaLat = (DESTINATION.latitude - ORIGIN.latitude) * Math.PI / 180;
  const deltaLon = (DESTINATION.longitude - ORIGIN.longitude) * Math.PI / 180;
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  const roadDistanceKm = earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.18;
  const averageKph = mode === 'truck' ? 46 : 58;
  return {
    mode,
    distance_m: Math.round(roadDistanceKm * 1000),
    duration_s: Math.round(roadDistanceKm / averageKph * 3600),
    geometry: {
      type: 'LineString',
      coordinates: [
        [ORIGIN.longitude, ORIGIN.latitude],
        [77.42, 12.82],
        [77.18, 12.63],
        [76.92, 12.47],
        [DESTINATION.longitude, DESTINATION.latitude],
      ],
    },
    instructions: [],
    provider: 'estimate',
  };
}

export default function RouteMap({ hero = false }: { hero?: boolean }) {
  const modes = MODES;
  const [mode, setMode] = useState<TravelMode>('truck');
  const [routes, setRoutes] = useState<MapRoute[]>(() => [basicRoute('truck')]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setRoutes([basicRoute(mode)]);
    getRoute([ORIGIN, DESTINATION], mode, 3).then(result => {
      if (!active) return;
      const ranked = result.routes
        .filter(item => item.geometry && typeof item.distance_m === 'number')
        .sort((a, b) => (a.duration_s ?? Infinity) - (b.duration_s ?? Infinity));
      if (ranked.length) setRoutes(ranked);
      setLoading(false);
    }).catch(cause => {
      if (active) {
        setError(cause instanceof Error ? cause.message : 'Live traffic unavailable');
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [mode]);

  const map = useMemo(() => {
    const origin = worldPoint(ORIGIN.longitude, ORIGIN.latitude);
    const destination = worldPoint(DESTINATION.longitude, DESTINATION.latitude);
    const center: Point = [(origin[0] + destination[0]) / 2, (origin[1] + destination[1]) / 2];
    const project = ([longitude, latitude]: Point): Point => {
      const point = worldPoint(longitude, latitude);
      return [point[0] - center[0] + WIDTH / 2, point[1] - center[1] + HEIGHT / 2];
    };
    const centerTileX = Math.floor(center[0] / TILE);
    const centerTileY = Math.floor(center[1] / TILE);
    const tiles = [];
    for (let x = centerTileX - 2; x <= centerTileX + 2; x += 1) {
      for (let y = centerTileY - 2; y <= centerTileY + 1; y += 1) {
        tiles.push({ x, y, left: x * TILE - center[0] + WIDTH / 2, top: y * TILE - center[1] + HEIGHT / 2 });
      }
    }
    const paths = routes.map(candidate => routeCoordinates(candidate).map(project)).filter(points => points.length > 1);
    return {
      tiles,
      paths,
      origin: project([ORIGIN.longitude, ORIGIN.latitude]),
      destination: project([DESTINATION.longitude, DESTINATION.latitude]),
    };
  }, [routes]);

  const selected = modes.find(item => item.id === mode);
  const bestRoute = routes[0];
  const distance = bestRoute?.distance_m ? `${(bestRoute.distance_m / 1000).toFixed(0)} km` : 'Route pending';
  const duration = bestRoute?.duration_s ? `${Math.floor(bestRoute.duration_s / 3600)}h ${Math.round((bestRoute.duration_s % 3600) / 60)}m` : 'Calculating';
  const zoomBy = (factor: number) => setViewport(current => {
    const scale = Math.min(3, Math.max(1, current.scale * factor));
    const ratio = scale / current.scale;
    return { scale, x: WIDTH / 2 - (WIDTH / 2 - current.x) * ratio, y: HEIGHT / 2 - (HEIGHT / 2 - current.y) * ratio };
  });
  const resetView = () => setViewport({ x: 0, y: 0, scale: 1 });
  return <section className={`landing-map ${hero ? 'landing-map-hero' : ''}`} id="route-map">
    <div className="map-copy">

      <h2>Plan the clearest route.<br/><span>Keep cool shipments moving.</span></h2>
      <p>Choose how the shipment travels and see its route, distance and travel time. The map stays connected to the backend so provider details remain private.</p>
      <label className="map-mode-select"><span>HOW IT TRAVELS</span><div>{modeIcon(selected?.category)}<select value={mode} onChange={event => setMode(event.target.value as TravelMode)}>{modes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div></label>
      <div className="map-route-summary"><div><span>DISTANCE</span><b>{distance}</b></div><div><span>TRAVEL TIME</span><b>{duration}</b></div></div>
      <a className="button button-primary" href="/dashboard">Open shipment dashboard <ArrowRight size={15}/></a>
    </div>
    <div className="map-frame">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Interactive map showing the Bengaluru to Mysuru shipment route in India. Drag to pan and use the scroll wheel to zoom." tabIndex={0}
        className={dragging ? 'is-dragging' : ''}
        onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); event.currentTarget.dataset.dragX = String(event.clientX); event.currentTarget.dataset.dragY = String(event.clientY); }}
        onPointerMove={event => { if (!dragging) return; const rect = event.currentTarget.getBoundingClientRect(); const prevX = Number(event.currentTarget.dataset.dragX); const prevY = Number(event.currentTarget.dataset.dragY); setViewport(current => ({ ...current, x: current.x + (event.clientX - prevX) * WIDTH / rect.width, y: current.y + (event.clientY - prevY) * HEIGHT / rect.height })); event.currentTarget.dataset.dragX = String(event.clientX); event.currentTarget.dataset.dragY = String(event.clientY); }}
        onPointerUp={event => { setDragging(false); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onPointerCancel={() => setDragging(false)}
        onWheel={event => { event.preventDefault(); zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15); }}>
        <g transform={`translate(${viewport.x} ${viewport.y}) translate(${WIDTH / 2} ${HEIGHT / 2}) scale(${viewport.scale}) translate(${-WIDTH / 2} ${-HEIGHT / 2})`}>
          <rect width={WIDTH} height={HEIGHT} fill="#d5d0c4"/>
          <path d="M0 90 C180 130 300 70 470 125 S770 215 1000 150 M-30 420 C210 330 380 440 590 360 S810 300 1030 380 M120 -30 C180 130 130 280 230 610 M730 -30 C650 150 810 330 700 610" fill="none" stroke="#b8b1a3" strokeWidth="8" opacity=".55"/>
          <path d="M0 210 C260 250 390 180 620 245 S830 290 1000 250 M390 0 C430 180 350 370 430 580" fill="none" stroke="#c8c1b4" strokeWidth="3" opacity=".8"/>
          {!tilesUnavailable && map.tiles.map(tile => <image key={`${tile.x}-${tile.y}`} href={mapTileUrl(ZOOM, tile.x, tile.y)} x={tile.left} y={tile.top} width={TILE} height={TILE} onError={() => setTilesUnavailable(true)}/>) }
          <rect width={WIDTH} height={HEIGHT} fill="#f1eee5" opacity=".08" pointerEvents="none"/>
          <g className={`route-network ${loading ? 'is-exploring' : 'is-settled'}`} pointerEvents="none">
            {map.paths.map((points, index) => {
              const line = points.map(point => point.join(',')).join(' ');
              const motionPath = `M ${points.map(point => point.join(',')).join(' L ')}`;
              return <g key={`${mode}-${index}`} style={{ '--route-delay': `${index * 320}ms` } as CSSProperties}>
                <polyline className="route-candidate-path" points={line} pathLength="1" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                {loading && <circle className="route-search-head" r="3.5" fill="#f1eee5" stroke="#a65436" strokeWidth="2" opacity="0">
                  <set attributeName="opacity" to="1" begin={`${index * .32}s`}/>
                  <animateMotion path={motionPath} dur="3.6s" begin={`${index * .32}s`} fill="freeze" calcMode="paced"/>
                </circle>}
              </g>;
            })}
          </g>
          {!loading && map.paths[0] && <g key={`winner-${mode}`} pointerEvents="none">
            <polyline className="route-best-path" points={map.paths[0].map(point => point.join(',')).join(' ')} pathLength="1" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
          </g>}
          {[map.origin, map.destination].map((point, index) => <g key={index} transform={`translate(${point[0]} ${point[1]})`} pointerEvents="none">
            <circle className={loading && index === 0 ? 'route-origin-searching' : undefined} r="18" fill="#f1eee5" stroke={index ? '#a65436' : '#68704d'} strokeWidth="4"/><circle r="5" fill={index ? '#a65436' : '#68704d'}/>
            <rect x="23" y="-23" width={index ? 113 : 138} height="46" fill="#f5f1e9" stroke="#817c70"/>
            <text x="34" y="-3" fill="#282820" fontSize="11" fontFamily="Courier New, monospace">{index ? 'MYSURU, IN' : 'BENGALURU, IN'}</text>
            <text x="34" y="12" fill="#68685f" fontSize="9" fontFamily="Courier New, monospace" letterSpacing="1">{index ? 'DESTINATION' : 'ORIGIN'}</text>
          </g>)}
        </g>
      </svg>
      <div className="map-topline"><span className={tilesUnavailable ? 'map-status-error' : ''}><i/>{loading ? 'BASIC ESTIMATE READY · CHECKING LIVE TRAFFIC' : bestRoute?.provider === 'estimate' ? 'BASIC ROUTE ESTIMATE' : `${routes.length} LIVE ROUTE${routes.length === 1 ? '' : 'S'} · FASTEST SELECTED`}</span><b>{selected?.label ?? 'Truck'}</b></div>
      <div className="map-controls" aria-label="Map controls">
        <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in"><Plus size={16}/></button>
        <button type="button" onClick={() => zoomBy(0.8)} aria-label="Zoom out" disabled={viewport.scale <= 1}><Minus size={16}/></button>
        <button type="button" onClick={resetView} aria-label="Reset map view" disabled={viewport.scale === 1 && viewport.x === 0 && viewport.y === 0}><LocateFixed size={16}/></button>
      </div>
      {loading && <div className="map-loading"><RefreshCw size={16}/>Checking current traffic…</div>}
      {(error || tilesUnavailable) && <div className="map-error"><Route size={15}/>{tilesUnavailable ? 'Background map unavailable · route estimate remains visible' : 'Live traffic unavailable · showing a basic estimate'}</div>}
      <a className="map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
    </div>
  </section>;
}
