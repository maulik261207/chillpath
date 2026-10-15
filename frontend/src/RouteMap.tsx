import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bus, MapPin, Navigation, RefreshCw, Route, Truck } from 'lucide-react';
import { getRoute, getTransportModes, mapTileUrl, type MapRoute, type TravelMode } from './api';

const ORIGIN = { latitude: 47.5596, longitude: 7.5886 };
const DESTINATION = { latitude: 55.6761, longitude: 12.5683 };
const ZOOM = 5;
const WIDTH = 1000;
const HEIGHT = 440;
const TILE = 256;

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
  if (points.length <= 800) return points;
  const step = Math.ceil(points.length / 800);
  const reduced = points.filter((_, index) => index % step === 0);
  if (reduced.at(-1) !== points.at(-1)) reduced.push(points.at(-1)!);
  return reduced;
}

function modeIcon(category?: string) {
  if (category === 'transit') return <Bus size={15}/>;
  if (category === 'freight' || category === 'road') return <Truck size={15}/>;
  return <Navigation size={15}/>;
}

export default function RouteMap() {
  const [modes, setModes] = useState<ModeItem[]>([]);
  const [mode, setMode] = useState<TravelMode>('light_truck');
  const [route, setRoute] = useState<MapRoute>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getTransportModes().then(result => setModes(result.items)).catch(() => setModes([
      { id: 'light_truck', label: 'Light truck', category: 'freight' },
      { id: 'drive', label: 'Car', category: 'road' },
      { id: 'transit', label: 'Public transit', category: 'transit' },
    ]));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getRoute([ORIGIN, DESTINATION], mode).then(result => {
      if (active) setRoute(result.routes[0]);
    }).catch(cause => {
      if (active) {
        setRoute(undefined);
        setError(cause instanceof Error ? cause.message : 'Route service unavailable');
      }
    }).finally(() => { if (active) setLoading(false); });
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
      for (let y = centerTileY - 1; y <= centerTileY + 1; y += 1) {
        tiles.push({ x, y, left: x * TILE - center[0] + WIDTH / 2, top: y * TILE - center[1] + HEIGHT / 2 });
      }
    }
    const coordinates = routeCoordinates(route);
    const line = (coordinates.length ? coordinates : [[ORIGIN.longitude, ORIGIN.latitude], [DESTINATION.longitude, DESTINATION.latitude]] as Point[]).map(project);
    return { tiles, line, origin: project([ORIGIN.longitude, ORIGIN.latitude]), destination: project([DESTINATION.longitude, DESTINATION.latitude]) };
  }, [route]);

  const selected = modes.find(item => item.id === mode);
  const distance = route?.distance_m ? `${(route.distance_m / 1000).toFixed(0)} km` : 'Route pending';
  const duration = route?.duration_s ? `${Math.floor(route.duration_s / 3600)}h ${Math.round((route.duration_s % 3600) / 60)}m` : 'Checking live route';
  return <section className="landing-map" id="route-map">
    <div className="map-copy">
      <div className="eyebrow">CONNECTED MULTIMODAL ROUTING</div>
      <h2>See the route.<br/><span>Change the response.</span></h2>
      <p>Compare transport modes through the backend without exposing provider credentials. Route geometry, distance and travel time come from Geoapify.</p>
      <label className="map-mode-select"><span>TRANSPORT MODE</span><div>{modeIcon(selected?.category)}<select value={mode} onChange={event => setMode(event.target.value as TravelMode)}>{modes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div></label>
      <div className="map-route-summary"><div><span>DISTANCE</span><b>{distance}</b></div><div><span>ESTIMATED TIME</span><b>{duration}</b></div></div>
      <a className="button button-primary" href="/dashboard">Open operations dashboard <ArrowRight size={15}/></a>
    </div>
    <div className="map-frame">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Map showing the Basel to Copenhagen shipment route">
        <defs><filter id="route-glow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
        <rect width={WIDTH} height={HEIGHT} fill="#102731"/>
        {map.tiles.map(tile => <image key={`${tile.x}-${tile.y}`} href={mapTileUrl(ZOOM, tile.x, tile.y)} x={tile.left} y={tile.top} width={TILE} height={TILE}/>) }
        <rect width={WIDTH} height={HEIGHT} fill="#06131d" opacity=".38"/>
        <polyline points={map.line.map(point => point.join(',')).join(' ')} fill="none" stroke="#55d9e8" strokeWidth="10" opacity=".18" filter="url(#route-glow)"/>
        <polyline points={map.line.map(point => point.join(',')).join(' ')} fill="none" stroke="#8fe8f0" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
        {[map.origin, map.destination].map((point, index) => <g key={index} transform={`translate(${point[0]} ${point[1]})`}><circle r="18" fill="#0a1c26" stroke={index ? '#f0a36b' : '#5bdbb3'} strokeWidth="4"/><circle r="5" fill={index ? '#f0a36b' : '#5bdbb3'}/></g>)}
      </svg>
      <div className="map-topline"><span><i/>GEOAPIFY CONNECTED</span><b>{selected?.label ?? 'Light truck'}</b></div>
      <div className="map-location origin"><MapPin size={14}/><span>BASEL, CH<small>ORIGIN</small></span></div>
      <div className="map-location destination"><MapPin size={14}/><span>COPENHAGEN, DK<small>DESTINATION</small></span></div>
      {loading && <div className="map-loading"><RefreshCw size={16}/>Calculating route…</div>}
      {error && <div className="map-error"><Route size={15}/>Backend route unavailable · showing direct corridor</div>}
    </div>
  </section>;
}
