import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Navigation, Truck } from './uiMarks';
import { autocompleteAddress, getRoute, mapTileUrl, type MapRoute, type TravelMode } from './api';

type Coordinate = { latitude: number; longitude: number };
const DEFAULT_ORIGIN: Coordinate = { latitude: 12.9716, longitude: 77.5946 };
const DEFAULT_DESTINATION: Coordinate = { latitude: 12.2958, longitude: 76.6394 };
// Keep enough geographic context for India-wide routes while retaining city detail.
const ZOOM = 7;
const WIDTH = 1000;
const HEIGHT = 580;
const TILE = 256;
const MIN_SCALE = 0.3;
const MODES: ModeItem[] = [
  { id: 'truck', label: 'Truck', category: 'freight' },
  { id: 'drive', label: 'Car', category: 'road' },
];

type ModeItem = { id: TravelMode; label: string; category: string };
type Point = [number, number];
const DEFAULT_ROUTE_CACHE_KEY = 'chillpath:homepage-route:bengaluru-mysuru:v1';
const DEFAULT_ROUTE_CACHE_MAX_AGE_MS = 60 * 60 * 1000;
const DEFAULT_ROUTE: MapRoute = {
  mode: 'truck',
  distance_m: 145_000,
  duration_s: 3 * 60 * 60 + 20 * 60,
  geometry: {
    type: 'LineString',
    coordinates: [
      [77.5946, 12.9716],
      [77.4601, 12.9237],
      [77.2812, 12.7203],
      [77.2050, 12.5456],
      [76.8951, 12.5218],
      [76.6394, 12.2958],
    ],
  },
  instructions: [],
  provider: 'estimate',
};
type ActivePointer = { clientX: number; clientY: number };
type Gesture =
  | { type: 'pan'; pointerId: number; clientX: number; clientY: number; viewX: number; viewY: number }
  | { type: 'pinch'; startDistance: number; startScale: number };

function worldPoint(longitude: number, latitude: number): Point {
  const size = TILE * 2 ** ZOOM;
  const bounded = Math.max(-85.0511, Math.min(85.0511, latitude));
  const sin = Math.sin((bounded * Math.PI) / 180);
  return [
    ((longitude + 180) / 360) * size,
    (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  ];
}

function fitRouteViewport(route: MapRoute, origin: Coordinate, destination: Coordinate) {
  const coordinates = routeCoordinates(route);
  if (coordinates.length < 2) return { x: 0, y: 0, scale: 1 };

  const originWorld = worldPoint(origin.longitude, origin.latitude);
  const destinationWorld = worldPoint(destination.longitude, destination.latitude);
  const center: Point = [
    (originWorld[0] + destinationWorld[0]) / 2,
    (originWorld[1] + destinationWorld[1]) / 2,
  ];
  const projected = coordinates.map(([longitude, latitude]) => {
    const point = worldPoint(longitude, latitude);
    return [point[0] - center[0] + WIDTH / 2, point[1] - center[1] + HEIGHT / 2] as Point;
  });

  // Leave room for the location pins and their labels around both route ends.
  const paddingX = 150;
  const paddingY = 54;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of projected) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  minX -= paddingX;
  maxX += paddingX;
  minY -= paddingY;
  maxY += paddingY;
  const scale = Math.max(
    MIN_SCALE,
    Math.min(2.2, WIDTH / Math.max(1, maxX - minX), HEIGHT / Math.max(1, maxY - minY)),
  );
  const boundsCenterX = (minX + maxX) / 2;
  const boundsCenterY = (minY + maxY) / 2;

  return {
    scale,
    x: -(boundsCenterX - WIDTH / 2) * scale,
    y: -(boundsCenterY - HEIGHT / 2) * scale,
  };
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

function readCachedDefaultRoute(): MapRoute[] {
  try {
    const raw = window.localStorage.getItem(DEFAULT_ROUTE_CACHE_KEY);
    if (!raw) return [DEFAULT_ROUTE];
    const cached = JSON.parse(raw) as { savedAt?: number; routes?: MapRoute[] };
    if (!cached.savedAt || Date.now() - cached.savedAt > DEFAULT_ROUTE_CACHE_MAX_AGE_MS || !Array.isArray(cached.routes)) {
      window.localStorage.removeItem(DEFAULT_ROUTE_CACHE_KEY);
      return [DEFAULT_ROUTE];
    }
    const routes = cached.routes.filter(route => routeCoordinates(route).length > 1);
    return routes.length ? routes : [DEFAULT_ROUTE];
  } catch {
    return [DEFAULT_ROUTE];
  }
}

export default function RouteMap({ hero = false }: { hero?: boolean }) {
  const modes = MODES;
  const [mode, setMode] = useState<TravelMode>('truck');
  const [origin, setOrigin] = useState<Coordinate>(DEFAULT_ORIGIN);
  const [destination, setDestination] = useState<Coordinate>(DEFAULT_DESTINATION);
  const [originText, setOriginText] = useState('Bengaluru');
  const [destinationText, setDestinationText] = useState('Mysuru');
  const [committedOriginText, setCommittedOriginText] = useState('Bengaluru');
  const [committedDestinationText, setCommittedDestinationText] = useState('Mysuru');
  const [locationError, setLocationError] = useState('');
  const [routes, setRoutes] = useState<MapRoute[]>(readCachedDefaultRoute);
  const [routeStatus, setRouteStatus] = useState<'loading' | 'ready' | 'error'>('ready');
  const [routeKey, setRouteKey] = useState(0);

  // Start closer, then ease outward to a complete route overview when routing resolves.
  // Match the default route's fitted zoom from the first frame; don't zoom after its trace.
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 2.2 });
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const activePointersRef = useRef(new Map<number, ActivePointer>());
  const gestureRef = useRef<Gesture | null>(null);
  const viewportAnimationRef = useRef<number | null>(null);
  const routeRequestIdRef = useRef(0);
  const committedModeRef = useRef<TravelMode>('truck');

  const cancelViewportAnimation = () => {
    if (viewportAnimationRef.current !== null) {
      cancelAnimationFrame(viewportAnimationRef.current);
      viewportAnimationRef.current = null;
    }
  };

  const animateViewport = (target: { x: number; y: number; scale: number }) => {
    cancelViewportAnimation();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setViewport(target);
      return;
    }

    const start = viewportRef.current;
    const duration = 1050;
    let startTime: number | null = null;
    const step = (time: number) => {
      if (startTime === null) startTime = time;
      const progress = Math.min(1, (time - startTime) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const current = {
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
        scale: start.scale + (target.scale - start.scale) * eased,
      };
      setViewport(current);
      if (progress < 1) {
        viewportAnimationRef.current = requestAnimationFrame(step);
      } else {
        viewportAnimationRef.current = null;
        viewportRef.current = target;
      }
    };
    viewportAnimationRef.current = requestAnimationFrame(step);
  };

  useEffect(() => () => cancelViewportAnimation(), []);

  const calculateRoute = async (
    nextOrigin: Coordinate,
    nextDestination: Coordinate,
    nextMode: TravelMode,
    nextOriginText: string,
    nextDestinationText: string,
    requestId: number,
    fitImmediately = false,
  ) => {
    // Hold the current route and view while the new request is in flight.
    cancelViewportAnimation();
    setRouteStatus('loading');
    setLocationError('');
    try {
      const result = await getRoute([nextOrigin, nextDestination], nextMode, 1);
      if (requestId !== routeRequestIdRef.current) return;
      const ranked = result.routes
        .filter(item => routeCoordinates(item).length > 1)
        .sort((a, b) => (a.duration_s ?? Infinity) - (b.duration_s ?? Infinity));
      if (!ranked.length) throw new Error('No route found');

      // Commit route, markers, labels, and mode together only after a valid response.
      setOrigin(nextOrigin);
      setDestination(nextDestination);
      setCommittedOriginText(nextOriginText);
      setCommittedDestinationText(nextDestinationText);
      setMode(nextMode);
      committedModeRef.current = nextMode;
      setRoutes(ranked);
      if (
        nextMode === 'truck' &&
        nextOrigin.latitude === DEFAULT_ORIGIN.latitude &&
        nextOrigin.longitude === DEFAULT_ORIGIN.longitude &&
        nextDestination.latitude === DEFAULT_DESTINATION.latitude &&
        nextDestination.longitude === DEFAULT_DESTINATION.longitude
      ) {
        try {
          window.localStorage.setItem(DEFAULT_ROUTE_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), routes: ranked }));
        } catch {
          // Storage can be unavailable; the live route still renders normally.
        }
      }
      setRouteKey(k => k + 1);
      setRouteStatus('ready');
      const fittedViewport = fitRouteViewport(ranked[0], nextOrigin, nextDestination);
      if (!fitImmediately) {
        animateViewport(fittedViewport);
      }
    } catch {
      if (requestId !== routeRequestIdRef.current) return;
      const isDefaultRoute =
        nextOrigin.latitude === DEFAULT_ORIGIN.latitude &&
        nextOrigin.longitude === DEFAULT_ORIGIN.longitude &&
        nextDestination.latitude === DEFAULT_DESTINATION.latitude &&
        nextDestination.longitude === DEFAULT_DESTINATION.longitude;
      if (isDefaultRoute) {
        setOrigin(DEFAULT_ORIGIN);
        setDestination(DEFAULT_DESTINATION);
        setCommittedOriginText(nextOriginText);
        setCommittedDestinationText(nextDestinationText);
        setRoutes([DEFAULT_ROUTE]);
        setRouteStatus('ready');
        setLocationError('');
        const fittedViewport = fitRouteViewport(DEFAULT_ROUTE, DEFAULT_ORIGIN, DEFAULT_DESTINATION);
        if (fitImmediately) setViewport(fittedViewport);
        else animateViewport(fittedViewport);
        return;
      }
      setRouteStatus('error');
      setMode(committedModeRef.current);
      setLocationError('Could not calculate that route. Your previous route is still shown.');
    }
  };

  useEffect(() => {
    const requestId = ++routeRequestIdRef.current;
    void calculateRoute(DEFAULT_ORIGIN, DEFAULT_DESTINATION, 'truck', 'Bengaluru', 'Mysuru', requestId, true);
    return () => {
      routeRequestIdRef.current += 1;
      cancelViewportAnimation();
    };
  }, []);

  async function applyLocations(event: FormEvent) {
    event.preventDefault();
    setLocationError('');
    const requestId = ++routeRequestIdRef.current;
    cancelViewportAnimation();
    setRouteStatus('loading');
    const resolve = async (text: string): Promise<Coordinate> => {
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
      if (item?.lat == null || item?.lon == null) throw new Error('Place not found');
      return { latitude: Number(item.lat), longitude: Number(item.lon) };
    };
    try {
      const [nextOrigin, nextDestination] = await Promise.all([
        resolve(originText.trim()),
        resolve(destinationText.trim()),
      ]);
      if (requestId !== routeRequestIdRef.current) return;
      const unchanged =
        nextOrigin.latitude === origin.latitude &&
        nextOrigin.longitude === origin.longitude &&
        nextDestination.latitude === destination.latitude &&
        nextDestination.longitude === destination.longitude;
      if (!unchanged) {
        await calculateRoute(nextOrigin, nextDestination, mode, originText.trim(), destinationText.trim(), requestId);
      } else {
        // The labels are draft-only until this explicit submit action.
        setCommittedOriginText(originText.trim());
        setCommittedDestinationText(destinationText.trim());
        if (!routes.length) setRoutes([DEFAULT_ROUTE]);
        setRouteStatus('ready');
        setLocationError('');
      }
    } catch {
      if (requestId === routeRequestIdRef.current) {
        setRouteStatus(routes.length ? 'ready' : 'error');
        setLocationError('Could not find one of those places. Try a city or address.');
      }
    }
  }

  const pointInMap = (clientX: number, clientY: number): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return [WIDTH / 2, HEIGHT / 2];
    return [((clientX - rect.left) / rect.width) * WIDTH, ((clientY - rect.top) / rect.height) * HEIGHT];
  };

  const zoomTo = (targetScale: number, anchor: Point) => {
    setViewport(current => {
      const maxScale = 4;
      const nextScale = Math.min(maxScale, Math.max(MIN_SCALE, targetScale));
      if (Math.abs(nextScale - current.scale) < 0.001) return current;

      const anchorX = anchor[0] - WIDTH / 2;
      const anchorY = anchor[1] - HEIGHT / 2;
      const mapX = (anchorX - current.x) / current.scale;
      const mapY = (anchorY - current.y) / current.scale;
      const nextX = anchorX - mapX * nextScale;
      const nextY = anchorY - mapY * nextScale;
      const maxPanX = 900;
      const maxPanY = 650;

      return {
        scale: nextScale,
        x: Math.max(-maxPanX, Math.min(maxPanX, nextX)),
        y: Math.max(-maxPanY, Math.min(maxPanY, nextY)),
      };
    });
  };

  const zoomBy = (factor: number, anchor: Point = [WIDTH / 2, HEIGHT / 2]) => {
    cancelViewportAnimation();
    zoomTo(viewportRef.current.scale * factor, anchor);
  };

  // Smooth wheel zoom without page scroll jitter
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.18 : 0.85;
      zoomBy(factor, pointInMap(event.clientX, event.clientY));
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cancelViewportAnimation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const active = activePointersRef.current;
    active.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    if (active.size >= 2) {
      const [first, second] = Array.from(active.values()).slice(0, 2);
      gestureRef.current = {
        type: 'pinch',
        startDistance: Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY),
        startScale: viewportRef.current.scale,
      };
      setDragging(false);
      return;
    }

    gestureRef.current = {
      type: 'pan',
      pointerId: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      viewX: viewportRef.current.x,
      viewY: viewportRef.current.y,
    };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const active = activePointersRef.current;
    if (!active.has(e.pointerId)) return;
    active.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    if (active.size >= 2) {
      const gesture = gestureRef.current;
      if (gesture?.type !== 'pinch') return;
      const [first, second] = Array.from(active.values()).slice(0, 2);
      const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
      const midpoint = pointInMap((first.clientX + second.clientX) / 2, (first.clientY + second.clientY) / 2);
      zoomTo(gesture.startScale * (distance / Math.max(1, gesture.startDistance)), midpoint);
      return;
    }

    const gesture = gestureRef.current;
    if (gesture?.type !== 'pan' || gesture.pointerId !== e.pointerId) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((e.clientX - gesture.clientX) / rect.width) * WIDTH;
    const dy = ((e.clientY - gesture.clientY) / rect.height) * HEIGHT;
    setViewport(current => ({
      ...current,
      x: Math.max(-900, Math.min(900, gesture.viewX + dx)),
      y: Math.max(-650, Math.min(650, gesture.viewY + dy)),
    }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const active = activePointersRef.current;
    active.delete(e.pointerId);
    if (active.size === 1) {
      const [pointerId, point] = Array.from(active.entries())[0];
      gestureRef.current = {
        type: 'pan',
        pointerId,
        clientX: point.clientX,
        clientY: point.clientY,
        viewX: viewportRef.current.x,
        viewY: viewportRef.current.y,
      };
      setDragging(true);
    } else {
      gestureRef.current = null;
      setDragging(false);
    }
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
    // Wide tile buffer keeps the map filled while zoomed out or panned.
    for (let x = centerTileX - 7; x <= centerTileX + 7; x += 1) {
      for (let y = centerTileY - 6; y <= centerTileY + 6; y += 1) {
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
  const distance = bestRoute?.distance_m != null
    ? `${(bestRoute.distance_m / 1000).toFixed(0)} km`
    : routeStatus === 'loading' ? 'Calculating…' : 'Unavailable';
  const duration = bestRoute?.duration_s != null
    ? `${Math.floor(bestRoute.duration_s / 3600)}h ${Math.round((bestRoute.duration_s % 3600) / 60)}m`
    : routeStatus === 'loading' ? 'Calculating…' : 'Unavailable';

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
            {routeStatus === 'loading' ? 'Calculating…' : 'Update route'}
          </button>
          {locationError && <small role="alert">{locationError}</small>}
        </form>
        <label className="map-mode-select">
          <span>HOW IT TRAVELS</span>
          <div>
            {modeIcon(selected?.category)}
            <select
              value={mode}
              onChange={event => {
                const nextMode = event.target.value as TravelMode;
                setMode(nextMode);
                const requestId = ++routeRequestIdRef.current;
                void calculateRoute(origin, destination, nextMode, committedOriginText, committedDestinationText, requestId);
              }}
            >
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
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <g
            transform={`translate(${viewport.x} ${viewport.y}) translate(${WIDTH / 2} ${HEIGHT / 2}) scale(${viewport.scale}) translate(${-WIDTH / 2} ${-HEIGHT / 2})`}
          >
            <rect width={WIDTH} height={HEIGHT} fill="#d5d0c4" pointerEvents="none" />
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
                  {index ? committedDestinationText.toUpperCase() : committedOriginText.toUpperCase()}
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
            disabled={viewport.scale <= MIN_SCALE + 0.01}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="5" y1="12" x2="19" y2="12" />
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
