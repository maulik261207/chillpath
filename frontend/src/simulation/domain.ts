export type Scenario = 'normal' | 'refrigeration_failure' | 'traffic_delay' | 'destination_closure' | 'sensor_fault' | 'network_disconnection';
export type EvidenceState = 'normal' | 'valid_excursion' | 'suspected_sensor_fault' | 'insufficient_evidence';

export type Reading = {
  eventId: string;
  observedAt: number;
  temperatureC: number;
  humidityPct: number | null;
  credible: boolean;
};

export function scenarioTemperature(scenario: Scenario, tick: number): number {
  if (scenario === 'refrigeration_failure') return Math.min(10.4, 4.2 + Math.max(0, tick) * 0.55);
  if (scenario === 'sensor_fault' && tick === 1) return 12.4;
  return 4.2 + Math.sin(tick * 0.72) * 0.16;
}

export function classifyReadings(
  readings: Reading[],
  minimumC: number,
  maximumC: number,
  minimumCoverageMs = 60_000,
  maximumGapMs = 15 * 60_000,
): EvidenceState {
  const ordered = [...readings].sort((a, b) => a.observedAt - b.observedAt);
  const unique = ordered.filter((reading, index) => index === 0 || reading.observedAt !== ordered[index - 1].observedAt);
  if (unique.length < 2 || unique.at(-1)!.observedAt - unique[0].observedAt < minimumCoverageMs) return 'insufficient_evidence';
  if (unique.some((reading, index) => index > 0 && reading.observedAt - unique[index - 1].observedAt > maximumGapMs)) return 'insufficient_evidence';
  const outside = unique.filter(reading => reading.temperatureC < minimumC || reading.temperatureC > maximumC);
  if (!outside.length) return 'normal';
  const isolatedSpike = outside.some(reading => !reading.credible || reading.temperatureC < minimumC - 3 || reading.temperatureC > maximumC + 3);
  if (isolatedSpike && unique.some(reading => reading.temperatureC >= minimumC && reading.temperatureC <= maximumC)) return 'suspected_sensor_fault';
  return outside.every(reading => reading.credible) ? 'valid_excursion' : 'suspected_sensor_fault';
}

export function calculateExposure(readings: Reading[], minimumC: number, maximumC: number, maxHoldMs = 15 * 60_000) {
  const ordered = [...readings].sort((a, b) => a.observedAt - b.observedAt);
  const unique = ordered.filter((reading, index) => index === 0 || reading.observedAt !== ordered[index - 1].observedAt);
  let confirmedMs = 0;
  let uncertainMs = 0;
  for (let index = 0; index < unique.length - 1; index++) {
    const current = unique[index];
    const next = unique[index + 1];
    const heldMs = Math.min(Math.max(0, next.observedAt - current.observedAt), maxHoldMs);
    const breached = current.temperatureC < minimumC || current.temperatureC > maximumC;
    if (!breached) continue;
    if (current.credible && next.credible) confirmedMs += heldMs;
    else uncertainMs += heldMs;
  }
  return { confirmedSeconds: Math.floor(confirmedMs / 1000), uncertainSeconds: Math.floor(uncertainMs / 1000) };
}

export function makeReading(scenario: Scenario, tick: number, startAt: number): Reading {
  const temperatureC = scenarioTemperature(scenario, tick);
  return {
    eventId: `demo-${scenario}-${tick}`,
    observedAt: startAt + tick * 30_000,
    temperatureC,
    humidityPct: Math.round(61 + Math.sin(tick * 0.45) * 2),
    credible: !(scenario === 'sensor_fault' && tick === 1),
  };
}
