export const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://127.0.0.1:8000';
export const organizationId = import.meta.env.VITE_ORGANIZATION_ID as string | undefined;
export const connectedMode = Boolean(apiBase && organizationId);

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export type MapCoordinate = { latitude: number; longitude: number };
export type TravelMode = 'walk' | 'hike' | 'bicycle' | 'road_bike' | 'mountain_bike' |
  'scooter' | 'motorcycle' | 'drive' | 'bus' | 'light_truck' | 'medium_truck' |
  'truck' | 'heavy_truck' | 'long_truck' | 'truck_dangerous_goods' |
  'transit' | 'approximated_transit';
export type MapRoute = {
  mode: string;
  distance_m: number | null;
  duration_s: number | null;
  geometry: { type: string; coordinates: unknown };
  instructions: unknown[];
  provider: 'geoapify';
};

export function getRoute(waypoints: MapCoordinate[], mode: TravelMode = 'drive') {
  return api<{ routes: MapRoute[] }>('/maps/route', {
    method: 'POST',
    body: JSON.stringify({ waypoints, mode }),
  });
}

export function getRerouteOptions(waypoints: MapCoordinate[], modes: TravelMode[] = ['drive', 'light_truck']) {
  return api<{ routes: MapRoute[]; recommended_index: number | null; ranking: string }>('/maps/reroute-options', {
    method: 'POST',
    body: JSON.stringify({ waypoints, modes }),
  });
}

export function getTransportModes() {
  return api<{ items: Array<{ id: TravelMode; label: string; category: string }> }>('/maps/modes');
}

export function autocompleteAddress(text: string) {
  return api<{ results: unknown[] }>(`/maps/autocomplete?text=${encodeURIComponent(text)}`);
}

export function mapTileUrl(z: number, x: number, y: number) {
  return `${apiBase}/v1/maps/tiles/${z}/${x}/${y}.png`;
}
