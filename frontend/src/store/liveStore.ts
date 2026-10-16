import { create } from 'zustand';
import { apiBase, liveTelemetryApiKey } from '../api';

const API_KEY = liveTelemetryApiKey ?? 'chillpath_live_secret_key';

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
  /** Recent readings returned by the telemetry API */
  history: LiveTelemetryData[];
  historyLoaded: boolean;
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
  const res = await fetch(`${apiBase}/v1/telemetry/live`, {
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

async function fetchLiveTelemetryHistory(): Promise<LiveTelemetryData[]> {
  const res = await fetch(`${apiBase}/v1/telemetry/live/history?limit=60`, {
    headers: {
      'Accept': 'application/json',
      'X-API-Key': API_KEY,
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const result = await res.json() as { points: LiveTelemetryData[] };
  return result.points;
}

export const useLiveStore = create<LiveStore>((set, get) => ({
  polling: false,
  response: null,
  history: [],
  historyLoaded: false,
  error: null,
  lastFetchedAt: null,

  startPolling: () => {
    if (intervalId) return; // already polling
    set({ polling: true, error: null });

    const poll = async () => {
      try {
        const response = await fetchLiveTelemetry();
        const state = get();
        let history = state.history;
        let historyLoaded = state.historyLoaded;
        let error: string | null = null;
        if (!historyLoaded) {
          try {
            history = [...history, ...await fetchLiveTelemetryHistory()];
            historyLoaded = true;
          } catch (cause) {
            error = cause instanceof Error ? cause.message : 'History unavailable';
          }
        }
        if (response.data) history = [...history, response.data];
        const uniqueReadings = new Map<string, LiveTelemetryData>();
        for (const reading of history) {
          const key = reading.received_at || `${reading.device_id}:${reading.observed_at}`;
          uniqueReadings.set(key, reading);
        }
        set({
          response,
          history: [...uniqueReadings.values()].slice(-200),
          historyLoaded,
          error,
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
