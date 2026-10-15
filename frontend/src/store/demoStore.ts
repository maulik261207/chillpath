import { create } from 'zustand';
import { calculateExposure, classifyReadings, makeReading, scenarioTemperature, type EvidenceState, type Reading, type Scenario } from '../simulation/domain';
import { clearBufferedReadings, enqueueReadings, getBufferedReadings } from '../simulation/offlineQueue';

export type Shipment = { id: string; product: string; category: string; from: string; to: string; temp: number; status: string; health: string; eta: string; budget: number; exposure: number; color: string };
export type FeedEvent = { id: string; time: string; title: string; detail: string; kind: string };

export const seedShipments: Shipment[] = [
  { id: 'CH-2048', product: 'mRNA vaccine · lot 04A', category: 'Biologics', from: 'Basel, CH', to: 'Copenhagen, DK', temp: 4.2, status: 'In transit', health: 'Nominal', eta: '14:32', budget: 45, exposure: 0, color: 'cyan' },
  { id: 'CH-2039', product: 'Cell therapy · CT-882', category: 'Cell therapy', from: 'Boston, US', to: 'New York, US', temp: 7.8, status: 'Excursion', health: 'Review required', eta: '16:05', budget: 30, exposure: 18, color: 'orange' },
  { id: 'CH-2031', product: 'Insulin · batch 7K2', category: 'Pharmaceutical', from: 'Dublin, IE', to: 'Amsterdam, NL', temp: 5.1, status: 'In transit', health: 'Nominal', eta: '17:20', budget: 60, exposure: 0, color: 'cyan' },
  { id: 'CH-2014', product: 'Clinical samples · CS-14', category: 'Research', from: 'Oxford, UK', to: 'London, UK', temp: 3.9, status: 'Evidence gap', health: 'Signal stale', eta: '15:10', budget: 20, exposure: 0, color: 'purple' },
  { id: 'CH-1987', product: 'Vaccine adjuvant · VA-09', category: 'Biologics', from: 'Lyon, FR', to: 'Zurich, CH', temp: 4.6, status: 'In transit', health: 'Nominal', eta: '18:40', budget: 45, exposure: 0, color: 'cyan' },
];

const startAt = Date.UTC(2026, 9, 15, 14, 0, 0);
const baseReadings: Reading[] = [0, 1, 2].map(minute => ({ eventId: `seed-${minute}`, observedAt: startAt + minute * 60_000, temperatureC: 4.2 + minute * 0.05, humidityPct: 61, credible: true }));
const nowLabel = (elapsedSeconds = 0) => new Date(startAt + elapsedSeconds * 1000).toISOString().slice(11, 19);
let sequence = 0;
const event = (title: string, detail: string, kind: string, elapsedSeconds = 0): FeedEvent => ({
  id: `demo-event-${++sequence}`,
  time: nowLabel(elapsedSeconds),
  title,
  detail,
  kind,
});
const initialEvents: FeedEvent[] = [
  { id: 'demo-seed-1', time: '14:08:42', title: 'Telemetry received', detail: 'CH-2048 · Sensor T-04 · 4.2°C', kind: 'ok' },
  { id: 'demo-seed-2', time: '14:06:18', title: 'Operator handoff confirmed', detail: 'Basel distribution hub', kind: 'ok' },
  { id: 'demo-seed-3', time: '13:52:03', title: 'Route checkpoint passed', detail: 'A2 · Pratteln, Switzerland', kind: 'ok' },
  { id: 'demo-seed-4', time: '13:40:12', title: 'Shipment departed', detail: 'Basel cold-storage facility', kind: 'ok' },
];

export type DemoState = {
  scenario: Scenario;
  running: boolean;
  offline: boolean;
  events: FeedEvent[];
  shipments: Shipment[];
  selected: string;
  elapsedSeconds: number;
  temperatureC: number;
  confirmedExposureSeconds: number;
  uncertainExposureSeconds: number;
  delaySeconds: number;
  bufferedCount: number;
  readings: Reading[];
  evidenceState: EvidenceState;
  guidedDemo: boolean;
  guidedStep: number;
  guidedStageStartedSeconds: number;
  setScenario: (scenario: Scenario) => void;
  startGuidedDemo: () => void;
  toggleRun: () => void;
  tick: () => void;
  reset: () => void;
  approve: (action?: string) => void;
  disconnect: () => void;
  reconnect: () => Promise<void>;
  setSelected: (id: string) => void;
};

export const useApp = create<DemoState>((set, get) => ({
  scenario: 'normal',
  running: false,
  offline: false,
  events: initialEvents,
  shipments: seedShipments,
  selected: 'CH-2048',
  elapsedSeconds: 120,
  temperatureC: 4.3,
  confirmedExposureSeconds: 0,
  uncertainExposureSeconds: 0,
  delaySeconds: 0,
  bufferedCount: 0,
  readings: baseReadings,
  evidenceState: 'normal',
  guidedDemo: false,
  guidedStep: 0,
  guidedStageStartedSeconds: 0,
  setScenario: scenario => {
    const firstReading: Reading = { eventId: `${scenario}-seed-0`, observedAt: startAt, temperatureC: 4.2, humidityPct: 61, credible: true };
    set(state => ({
      scenario,
      running: false,
      offline: scenario === 'network_disconnection',
      elapsedSeconds: 0,
      temperatureC: 4.2,
      confirmedExposureSeconds: 0,
      uncertainExposureSeconds: 0,
      delaySeconds: scenario === 'traffic_delay' ? 1800 : 0,
      bufferedCount: 0,
      readings: [firstReading],
      evidenceState: 'insufficient_evidence',
      guidedDemo: false,
      guidedStep: 0,
      events: [event('Scenario activated', scenario.replaceAll('_', ' '), scenario === 'normal' ? 'ok' : 'warn'), ...state.events].slice(0, 100),
    }));
    void clearBufferedReadings();
  },
  startGuidedDemo: () => {
    void clearBufferedReadings();
    set({ scenario: 'normal', running: true, offline: false, elapsedSeconds: 0, temperatureC: 4.2, confirmedExposureSeconds: 0, uncertainExposureSeconds: 0, delaySeconds: 0, bufferedCount: 0, readings: [{ ...baseReadings[0], eventId: 'guided-seed-0', observedAt: startAt }], evidenceState: 'insufficient_evidence', guidedDemo: true, guidedStep: 0, guidedStageStartedSeconds: 0, events: [event('Guided demo started', 'Healthy shipment baseline · synthetic telemetry', 'ok'), ...initialEvents] });
  },
  toggleRun: () => set(state => ({ running: !state.running })),
  tick: () => {
    const state = get();
    if (!state.running) return;
    if (state.guidedDemo && state.guidedStep === 2 && state.elapsedSeconds >= 300) {
      set({ running: false, guidedStep: 3, guidedStageStartedSeconds: state.elapsedSeconds, events: [event('Recovery approval requested', 'Review the evidence-linked recommendation and approve or reject it to continue the guided demo.', 'warn', state.elapsedSeconds), ...state.events].slice(0, 100) });
      return;
    }
    const tick = Math.floor(state.elapsedSeconds / 30) + 1;
    const elapsedSeconds = tick * 30;
    let scenario = state.scenario;
    let guidedStep = state.guidedStep;
    let transition: FeedEvent | undefined;
    if (state.guidedDemo && guidedStep === 0 && state.elapsedSeconds >= 60) {
      scenario = 'refrigeration_failure'; guidedStep = 1;
      transition = event('Cooling failure simulated', 'Temperature begins rising · monitor the same shipment sensor.', 'warn', state.elapsedSeconds);
    } else if (state.guidedDemo && guidedStep === 1 && state.elapsedSeconds >= 240) {
      scenario = 'traffic_delay'; guidedStep = 2;
      transition = event('Traffic delay introduced', 'Arrival estimate now includes a 30 minute simulated delay.', 'warn', state.elapsedSeconds);
    }
    const temperatureC = scenarioTemperature(scenario, tick);
    const reading = makeReading(scenario, tick, startAt);
    const readings = [...state.readings, reading].slice(-120);
    const exposure = calculateExposure(readings, 2, 8);
    const evidenceState = classifyReadings(readings, 2, 8);
    const newEvent = transition ?? (evidenceState === 'valid_excursion' && state.evidenceState !== 'valid_excursion'
      ? event('Temperature excursion confirmed', `T-04 · ${temperatureC.toFixed(1)}°C · accumulated exposure is being tracked`, 'warn', elapsedSeconds)
      : evidenceState === 'suspected_sensor_fault' && state.evidenceState !== 'suspected_sensor_fault'
        ? event('Sensor fault suspected', `T-04 · ${temperatureC.toFixed(1)}°C spike conflicts with surrounding evidence`, 'warn', elapsedSeconds)
        : undefined);
    if (state.offline) void enqueueReadings([reading]);
    set({
      elapsedSeconds,
      scenario,
      guidedStep,
      temperatureC,
      readings,
      confirmedExposureSeconds: exposure.confirmedSeconds,
      uncertainExposureSeconds: exposure.uncertainSeconds,
      evidenceState,
      bufferedCount: state.offline ? state.bufferedCount + 1 : state.bufferedCount,
      events: newEvent ? [newEvent, ...state.events].slice(0, 100) : state.events,
    });
  },
  reset: () => {
    void clearBufferedReadings();
    set({ scenario: 'normal', running: false, offline: false, shipments: seedShipments, events: initialEvents, elapsedSeconds: 120, temperatureC: 4.3, confirmedExposureSeconds: 0, uncertainExposureSeconds: 0, delaySeconds: 0, bufferedCount: 0, readings: baseReadings, evidenceState: 'normal', guidedDemo: false, guidedStep: 0, guidedStageStartedSeconds: 0 });
  },
  approve: (action = 'Priority delivery') => set(state => state.guidedDemo && state.guidedStep === 3
    ? ({ scenario: 'network_disconnection', offline: true, running: true, guidedStep: 4, guidedStageStartedSeconds: state.elapsedSeconds, events: [event('Recovery action approved', `${action} · operator authorization recorded`, 'ok', state.elapsedSeconds), event('Connectivity lost', 'Guided demo buffers new readings with their original measurement times.', 'warn', state.elapsedSeconds), ...state.events].slice(0, 100) })
    : ({ events: [event('Recovery action approved', `${action} · operator authorization recorded`, 'ok', state.elapsedSeconds), ...state.events].slice(0, 100) })),
  disconnect: () => set(state => state.offline ? state : ({ offline: true, events: [event('Connectivity lost', 'New telemetry is being buffered locally with its measurement time.', 'warn', state.elapsedSeconds), ...state.events].slice(0, 100) })),
  reconnect: async () => {
    const buffered = await getBufferedReadings();
    await clearBufferedReadings();
    set(state => ({
      offline: false,
      running: false,
      guidedDemo: false,
      guidedStep: state.guidedDemo ? 5 : state.guidedStep,
      bufferedCount: 0,
      events: [event('Buffered telemetry synchronized', `${buffered.length} readings replayed with original measurement timestamps`, 'ok', state.elapsedSeconds), ...state.events].slice(0, 100),
    }));
  },
  setSelected: selected => set({ selected }),
}));

export function statusLabel(scenario: Scenario, evidence: EvidenceState, offline = false) {
  if (evidence === 'valid_excursion') return 'Confirmed excursion';
  if (evidence === 'suspected_sensor_fault') return 'Suspected sensor fault';
  if (offline || scenario === 'network_disconnection') return 'Offline · buffering';
  if (evidence === 'insufficient_evidence' && scenario !== 'normal') return 'Insufficient evidence';
  if (scenario === 'destination_closure') return 'Destination unavailable';
  if (scenario === 'traffic_delay') return 'Route delay detected';
  return 'All systems nominal';
}

export function scenarioTimeLabel(elapsedSeconds = 0) {
  return nowLabel(elapsedSeconds);
}
