export const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://127.0.0.1:8000';
export const organizationId = import.meta.env.VITE_ORGANIZATION_ID as string | undefined;
export const connectedMode = Boolean(apiBase && organizationId);
export const liveTelemetryApiKey = (import.meta.env.VITE_LIVE_TELEMETRY_API_KEY ?? import.meta.env.VITE_CHILLPATH_API_KEY) as string | undefined;

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.text();
    let message = body;
    try {
      const parsed = JSON.parse(body) as { message?: string; detail?: string };
      message = parsed.message ?? parsed.detail ?? body;
    } catch {
      // Keep plain-text API errors readable.
    }
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
  provider: 'geoapify' | 'tomtom' | 'openstreetmap' | 'estimate';
  traffic_delay_s?: number;
};

export function getRoute(waypoints: MapCoordinate[], mode: TravelMode = 'drive', alternatives = 1) {
  return api<{ routes: MapRoute[] }>('/maps/route', {
    method: 'POST',
    body: JSON.stringify({ waypoints, mode, alternatives }),
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
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

export type LiveTelemetry = {
  temperature_c: number;
  temperature_f?: number;
  humidity_pct?: number;
  observed_at?: string;
  received_at?: string;
  sensor_id?: string;
};

export async function getLiveTelemetry() {
  if (!liveTelemetryApiKey) return null;
  const response = await fetch(`${apiBase}/v1/telemetry/live`, { headers: { 'X-API-Key': liveTelemetryApiKey } });
  if (!response.ok) throw new Error(`Live telemetry request failed (${response.status})`);
  return response.json() as Promise<{ online: boolean; data: LiveTelemetry | null }>;
}

export async function getLiveTelemetryHistory(limit = 36) {
  if (!liveTelemetryApiKey) return [];
  const response = await fetch(`${apiBase}/v1/telemetry/live/history?limit=${limit}`, { headers: { 'X-API-Key': liveTelemetryApiKey } });
  if (!response.ok) throw new Error(`Telemetry history request failed (${response.status})`);
  const payload = await response.json() as { points?: LiveTelemetry[] };
  return payload.points ?? [];
}

export type HistoricalSensorSummary = {
  sensor_id: string;
  total: number;
  temperature_valid: number;
  humidity_valid: number;
  temperature_missing: number;
  humidity_missing: number;
  completeness_pct: number;
  temperature_min_c: number | null;
  temperature_max_c: number | null;
  temperature_avg_c: number | null;
  humidity_min_pct: number | null;
  humidity_max_pct: number | null;
  humidity_avg_pct: number | null;
  first_timestamp: string | null;
  last_timestamp: string | null;
};
export type HistoricalDataset = { id: string; name: string; status: string; provenance: string; source_timezone: string | null; sensors: Array<{ sensor_id: string; rows: number; missing_temperature: number; missing_humidity: number }>; quality_report: Record<string, unknown> };
export type HistoricalPoint = { sensor_id: string; observed_at: string; temperature_c: number | null; humidity_pct: number | null; temperature_missing: boolean; humidity_missing: boolean };
export function getLocalHistoricalWorkspace() { return api<{ organization_id: string; organization_name: string }>('/historical/local-workspace'); }
export function getHistoricalDatasets(organization: string) { return api<{ source: string; items: HistoricalDataset[] }>(`/historical/datasets?organization_id=${encodeURIComponent(organization)}`); }
export function getHistoricalSummary(dataset: string, organization: string) { return api<{ source: string; sensors: HistoricalSensorSummary[] }>(`/historical/datasets/${dataset}/summary?organization_id=${encodeURIComponent(organization)}`); }
export function getHistoricalSeries(dataset: string, organization: string, sensorIds: string[]) { const query = new URLSearchParams({ organization_id: organization, limit: '1200' }); sensorIds.forEach(id => query.append('sensor_ids', id)); return api<{ source: string; sampled: boolean; stride: number; points: HistoricalPoint[] }>(`/historical/datasets/${dataset}/series?${query}`); }
export function getHistoricalActions(dataset: string, organization: string) { return api<{ source: string; items: Array<{ action: string; start: string; end: string }> }>(`/historical/datasets/${dataset}/actions?organization_id=${encodeURIComponent(organization)}`); }
export type HistoricalReplay = { id: string; status: string; speed: string; progress_pct: number; cursor_timestamp: string; start_timestamp: string; end_timestamp: string; };
export function createHistoricalReplay(dataset: string, organization: string, sensorIds: string[]) { return api<HistoricalReplay>('/replays', { method: 'POST', body: JSON.stringify({ organization_id: organization, dataset_id: dataset, sensor_ids: sensorIds, speed: '60x' }) }); }
export function controlHistoricalReplay(replay: string, organization: string, action: 'start' | 'pause' | 'resume' | 'stop' | 'restart') { return api<HistoricalReplay>(`/replays/${replay}/${action}?organization_id=${encodeURIComponent(organization)}`, { method: 'POST' }); }
