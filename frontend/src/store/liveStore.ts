import { create } from 'zustand';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:8000';
const API_KEY = (import.meta.env.VITE_LIVE_API_KEY as string | undefined) ?? 'chillpath_live_secret_key';

export type LiveTelemetryData = {
  device_id: string;
  temperature_c: number;
  temperature_f: number;
  adc_mv: number;
  voltage: number;
  do_tripped: boolean;
  buzzer_active: boolean;
  alarm_active: boolean;
  battery_pct: number;
  humidity_pct: number | null;
  dht_temp_c: number | null;
  dht_valid: boolean;
  observed_at: string;
  source: string;
  received_at: string;
};

export type LiveTelemetryResponse = {
  online: boolean;
  seconds_since_last_packet?: number;
  message?: string;
  data: LiveTelemetryData | null;
};

export type LiveStore = {
  /** Whether we are currently polling */
  polling: boolean;
  /** Latest response from the API */
  response: LiveTelemetryResponse | null;
  /** Historical data points collected during this session */
  history: LiveTelemetryData[];
  /** Connection error message, if any */
  error: string | null;
  /** Last successful fetch time */
  lastFetchedAt: Date | null;
  /** Start polling */
  startPolling: () => void;
  /** Stop polling */
  stopPolling: () => void;
};

let intervalId: ReturnType<typeof setInterval> | null = null;

async function fetchLiveTelemetry(): Promise<LiveTelemetryResponse> {
  // First query http://localhost:8000/live directly with JSON format & API key
  try {
    const liveUrl = `${API_BASE}/live?format=json&api_key=${encodeURIComponent(API_KEY)}`;
    const res = await fetch(liveUrl, {
      headers: {
        'Accept': 'application/json',
        'X-API-Key': API_KEY,
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (typeof data === 'object' && data !== null && 'online' in data) {
        return data as LiveTelemetryResponse;
      }
    }
  } catch (e) {
    // fallback to /v1/telemetry/live
  }

  // Fallback to /v1/telemetry/live
  const url = `${API_BASE}/v1/telemetry/live?api_key=${encodeURIComponent(API_KEY)}`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'X-API-Key': API_KEY,
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

export const useLiveStore = create<LiveStore>((set, get) => ({
  polling: false,
  response: null,
  history: [],
  error: null,
  lastFetchedAt: null,

  startPolling: () => {
    if (intervalId) return; // already polling
    set({ polling: true, error: null });

    const poll = async () => {
      try {
        const response = await fetchLiveTelemetry();
        const state = get();
        const newHistory = response.data
          ? [...state.history, response.data].slice(-200)
          : state.history;
        set({
          response,
          history: newHistory,
          error: null,
          lastFetchedAt: new Date(),
        });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : 'Connection error' });
      }
    };

    // Fetch immediately, then every 1.5 seconds
    void poll();
    intervalId = setInterval(poll, 1500);
  },

  stopPolling: () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    set({ polling: false });
  },
}));
