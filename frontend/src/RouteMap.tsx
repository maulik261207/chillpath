import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Navigation, Truck } from './uiMarks';
import { autocompleteAddress, getRoute, mapTileUrl, type MapRoute, type TravelMode } from './api';

type Coordinate = { latitude: number; longitude: number };
const DEFAULT_ORIGIN: Coordinate = { latitude: 12.9716, longitude: 77.5946 };
const DEFAULT_DESTINATION: Coordinate = { latitude: 12.2958, longitude: 76.6394 };
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
  const sin = Math.sin((bounded * Math.PI) / 180);
  return [
    ((longitude + 180) / 360) * size,
    (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  ];
}

function routeCoordinates(route?: MapRoute): Point[] {
  const geometry = route?.geometry as { type?: string; coordinates?: unknown } | undefined;
  if (!geometry?.coordinates) return [];
  const points =
    geometry.type === 'LineString'
      ? (geometry.coordinates as Point[])
      : geometry.type === 'MultiLineString'
      ? (geometry.coordinates as Point[][]).flat()
      : [];
  return points;
}

function modeIcon(category?: string) {
  if (category === 'freight' || category === 'road') return <Truck size={15} />;
  return <Navigation size={15} />;
}

function basicRoute(mode: TravelMode, origin: Coordinate, destination: Coordinate): MapRoute {
  const earthKm = 6371;
  const lat1 = (origin.latitude * Math.PI) / 180;
  const lat2 = (destination.latitude * Math.PI) / 180;
  const deltaLat = ((destination.latitude - origin.latitude) * Math.PI) / 180;
  const deltaLon = ((destination.longitude - origin.longitude) * Math.PI) / 180;
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  const roadDistanceKm = earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.18;
  const averageKph = mode === 'truck' ? 46 : 58;
  return {
    mode,
    distance_m: Math.round(roadDistanceKm * 1000),
    duration_s: Math.round((roadDistanceKm / averageKph) * 3600),
    geometry: {
      type: 'LineString',
      coordinates: [
        [origin.longitude, origin.latitude],
        [(origin.longitude * 2 + destination.longitude) / 3, (origin.latitude * 2 + destination.latitude) / 3 + 0.08],
        [(origin.longitude + destination.longitude * 2) / 3, (origin.latitude + destination.latitude * 2) / 3 - 0.05],
        [destination.longitude, destination.latitude],
      ],
    },
    instructions: [],
    provider: 'estimate',
  };
}

export default function RouteMap({ hero = false }: { hero?: boolean }) {
  const modes = MODES;
  const [mode, setMode] = useState<TravelMode>('truck');
  const [origin, setOrigin] = useState<Coordinate>(DEFAULT_ORIGIN);
  const [destination, setDestination] = useState<Coordinate>(DEFAULT_DESTINATION);
  const [originText, setOriginText] = useState('Bengaluru');
  const [destinationText, setDestinationText] = useState('Mysuru');
  const [locationError, setLocationError] = useState('');
  const [routes, setRoutes] = useState<MapRoute[]>(() => [basicRoute('truck', DEFAULT_ORIGIN, DEFAULT_DESTINATION)]);
  const [routeKey, setRouteKey] = useState(0);

  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    let active = true;
    setRoutes([basicRoute(mode, origin, destination)]);
    setRouteKey(k => k + 1);

    getRoute([origin, destination], mode, 3)
      .then(result => {
        if (!active) return;
        const ranked = result.routes
          .filter(item => item.geometry && typeof item.distance_m === 'number')
          .sort((a, b) => (a.duration_s ?? Infinity) - (b.duration_s ?? Infinity));
        if (ranked.length) {
          setRoutes(ranked);
          setRouteKey(k => k + 1);
        }
      })
      .catch(() => {
        // preserve basic route gracefully
      });
    return () => {
      active = false;
    };
  }, [mode, origin, destination]);

  async function applyLocations(event: FormEvent) {
    event.preventDefault();
    setLocationError('');
    const resolve = async (text: string, fallback: Coordinate) => {
      const value = text.trim().toLowerCase();
      const known: Record<string, Coordinate> = {
        bengaluru: DEFAULT_ORIGIN,
        bangalore: DEFAULT_ORIGIN,
        mysuru: DEFAULT_DESTINATION,
        mysore: DEFAULT_DESTINATION,
      };
      if (known[value]) return known[value];
      const response = await autocompleteAddress(text.trim());
      const item = response.results?.[0] as { lat?: number; lon?: number } | undefined;
      return item?.lat && item?.lon ? { latitude: Number(item.lat), longitude: Number(item.lon) } : fallback;
    };
    try {
      const [nextOrigin, nextDestination] = await Promise.all([
        resolve(originText, origin),
        resolve(destinationText, destination),
      ]);
      setOrigin(nextOrigin);
      setDestination(nextDestination);
    } catch {
      setLocationError('Could not find one of those places. Try a city or address.');
    }
  }

  const zoomBy = (factor: number) => {
    setViewport(current => {
      const minScale = 1;
      const maxScale = 4;
      const nextScale = Math.min(maxScale, Math.max(minScale, current.scale * factor));
      if (Math.abs(nextScale - current.scale) < 0.001) return current;

      if (nextScale <= 1.02) {
        return { scale: 1, x: 0, y: 0 };
      }

      const ratio = nextScale / current.scale;
      const nextX = WIDTH / 2 - (WIDTH / 2 - current.x) * ratio;
      const nextY = HEIGHT / 2 - (HEIGHT / 2 - current.y) * ratio;
      const maxPanX = 800 * nextScale;
      const maxPanY = 600 * nextScale;

      return {
        scale: nextScale,
        x: Math.max(-maxPanX, Math.min(maxPanX, nextX)),
        y: Math.max(-maxPanY, Math.min(maxPanY, nextY)),
      };
    });
  };

  const resetView = () => {
    setViewport({ x: 0, y: 0, scale: 1 });
  };

  // Smooth wheel zoom without page scroll jitter
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.18 : 0.85;
      zoomBy(factor);
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Window-level dragging for buttery-smooth panning across the whole viewport
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setDragging(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startViewX = viewportRef.current.x;
    const startViewY = viewportRef.current.y;
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const scaleFactorX = WIDTH / rect.width;
    const scaleFactorY = HEIGHT / rect.height;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startX) * scaleFactorX;
      const dy = (moveEvent.clientY - startY) * scaleFactorY;
      const currentScale = viewportRef.current.scale;
      const maxPanX = 900 * currentScale;
      const maxPanY = 650 * currentScale;
      setViewport(prev => ({
        ...prev,
        x: Math.max(-maxPanX, Math.min(maxPanX, startViewX + dx)),
        y: Math.max(-maxPanY, Math.min(maxPanY, startViewY + dy)),
      }));
    };

    const onPointerUp = () => {
      setDragging(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const map = useMemo(() => {
    const originPoint = worldPoint(origin.longitude, origin.latitude);
    const destinationPoint = worldPoint(destination.longitude, destination.latitude);
    const center: Point = [(originPoint[0] + destinationPoint[0]) / 2, (originPoint[1] + destinationPoint[1]) / 2];
    const project = ([longitude, latitude]: Point): Point => {
      const point = worldPoint(longitude, latitude);
      return [point[0] - center[0] + WIDTH / 2, point[1] - center[1] + HEIGHT / 2];
    };
    const centerTileX = Math.floor(center[0] / TILE);
    const centerTileY = Math.floor(center[1] / TILE);
    const tiles = [];
    // 11x9 tile buffer for uninterrupted panning
    for (let x = centerTileX - 5; x <= centerTileX + 5; x += 1) {
      for (let y = centerTileY - 4; y <= centerTileY + 4; y += 1) {
        tiles.push({ x, y, left: x * TILE - center[0] + WIDTH / 2, top: y * TILE - center[1] + HEIGHT / 2 });
      }
    }
    const paths = routes.map(candidate => routeCoordinates(candidate).map(project)).filter(points => points.length > 1);
    return {
      tiles,
      bestPath: paths[0] || [],
      origin: project([origin.longitude, origin.latitude]),
      destination: project([destination.longitude, destination.latitude]),
    };
  }, [routes, origin, destination]);

  const selected = modes.find(item => item.id === mode);
  const bestRoute = routes[0];
  const distance = bestRoute?.distance_m ? `${(bestRoute.distance_m / 1000).toFixed(0)} km` : '148 km';
  const duration = bestRoute?.duration_s
    ? `${Math.floor(bestRoute.duration_s / 3600)}h ${Math.round((bestRoute.duration_s % 3600) / 60)}m`
    : '3h 12m';

  return (
    <section className={`landing-map ${hero ? 'landing-map-hero' : ''}`} id="route-map">
      <div className="map-copy">
        <h2>
          Plan the clearest route.<br />
          <span>Keep cool shipments moving.</span>
        </h2>
        <p>
          Choose how the shipment travels and see its route, distance and travel time. The map stays connected to the backend so provider details remain private.
        </p>
        <form className="map-location-form" onSubmit={applyLocations}>
          <div className="map-location-fields">
            <label>
              FROM
              <input value={originText} onChange={event => setOriginText(event.target.value)} aria-label="Starting location" />
            </label>
            <span className="map-location-arrow">→</span>
            <label>
              TO
              <input value={destinationText} onChange={event => setDestinationText(event.target.value)} aria-label="Destination" />
            </label>
          </div>
          <button className="button button-outline" type="submit">
            Update route
          </button>
          {locationError && <small role="alert">{locationError}</small>}
        </form>
        <label className="map-mode-select">
          <span>HOW IT TRAVELS</span>
          <div>
            {modeIcon(selected?.category)}
            <select value={mode} onChange={event => setMode(event.target.value as TravelMode)}>
              {modes.map(item => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </label>
        <div className="map-route-summary">
          <div>
            <span>DISTANCE</span>
            <b>{distance}</b>
          </div>
          <div>
            <span>TRAVEL TIME</span>
            <b>{duration}</b>
          </div>
        </div>
        <a className="button button-primary" href="/dashboard">
          Open shipment dashboard <ArrowRight size={15} />
        </a>
      </div>
      <div className="map-frame">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="Interactive map showing the shipment route. Drag to pan and use zoom controls or scroll wheel to zoom."
          tabIndex={-1}
          className={dragging ? 'is-dragging' : ''}
          onPointerDown={onPointerDown}
        >
          <g
            transform={`translate(${viewport.x} ${viewport.y}) translate(${WIDTH / 2} ${HEIGHT / 2}) scale(${viewport.scale}) translate(${-WIDTH / 2} ${-HEIGHT / 2})`}
          >
            <rect width={WIDTH} height={HEIGHT} fill="#d5d0c4" pointerEvents="none" />
            <path
              d="M0 90 C180 130 300 70 470 125 S770 215 1000 150 M-30 420 C210 330 380 440 590 360 S810 300 1030 380 M120 -30 C180 130 130 280 230 610 M730 -30 C650 150 810 330 700 610"
              fill="none"
              stroke="#b8b1a3"
              strokeWidth="8"
              opacity=".55"
              pointerEvents="none"
            />
            <path
              d="M0 210 C260 250 390 180 620 245 S830 290 1000 250 M390 0 C430 180 350 370 430 580"
              fill="none"
              stroke="#c8c1b4"
              strokeWidth="3"
              opacity=".8"
              pointerEvents="none"
            />
            {map.tiles.map(tile => (
              <image
                key={`${tile.x}-${tile.y}`}
                href={mapTileUrl(ZOOM, tile.x, tile.y)}
                x={tile.left}
                y={tile.top}
                width={TILE}
                height={TILE}
                pointerEvents="none"
              />
            ))}
            <rect width={WIDTH} height={HEIGHT} fill="#f1eee5" opacity=".08" pointerEvents="none" />

            {/* ONLY the final line and its drawing animation */}
            {map.bestPath.length > 1 && (
              <g key={`best-${mode}-${routeKey}`} pointerEvents="none">
                <polyline
                  className="route-best-path"
                  points={map.bestPath.map(point => point.join(',')).join(' ')}
                  pathLength="1"
                  fill="none"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            )}

            {/* Origin & Destination Pins */}
            {[map.origin, map.destination].map((point, index) => (
              <g key={index} transform={`translate(${point[0]} ${point[1]})`} pointerEvents="none">
                <circle r="18" fill="#f1eee5" stroke={index ? '#a65436' : '#68704d'} strokeWidth="4" />
                <circle r="5" fill={index ? '#a65436' : '#68704d'} />
                <rect x="23" y="-23" width={index ? 113 : 138} height="46" fill="#f5f1e9" stroke="#817c70" />
                <text
                  x="34"
                  y="-3"
                  fill="#282820"
                  fontSize="12"
                  fontFamily="'Neuton', Georgia, serif"
                  fontWeight="600"
                >
                  {index ? destinationText.toUpperCase() : originText.toUpperCase()}
                </text>
                <text
                  x="34"
                  y="12"
                  fill="#68685f"
                  fontSize="10"
                  fontFamily="'Neuton', Georgia, serif"
                  letterSpacing="1"
                >
                  {index ? 'DESTINATION' : 'ORIGIN'}
                </text>
              </g>
            ))}
          </g>
        </svg>

        {/* Clean Zoom Controls with real SVG icons and proper clearance */}
        <div className="map-controls" aria-label="Map controls">
          <button
            type="button"
            onClick={() => zoomBy(1.25)}
            aria-label="Zoom in"
            title="Zoom in"
            disabled={viewport.scale >= 3.95}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => zoomBy(0.8)}
            aria-label="Zoom out"
            title="Zoom out"
            disabled={viewport.scale <= 1.05}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            type="button"
            onClick={resetView}
            aria-label="Reset map view"
            title="Reset map view"
            disabled={viewport.scale <= 1.05 && Math.abs(viewport.x) < 2 && Math.abs(viewport.y) < 2}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="4" />
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
            </svg>
          </button>
        </div>
        <a className="map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          © OpenStreetMap
        </a>
      </div>
    </section>
  );
}
