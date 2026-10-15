import { describe, expect, it } from 'vitest';
import { calculateExposure, classifyReadings, makeReading, scenarioTemperature } from './domain';

const base = 1_800_000_000_000;
const reading = (eventId: string, minute: number, temperatureC: number, credible = true) => ({ eventId, observedAt: base + minute * 60_000, temperatureC, humidityPct: 60, credible });

describe('cold-chain simulation domain', () => {
  it('produces repeatable, progressive refrigeration failure', () => {
    expect(scenarioTemperature('refrigeration_failure', 5)).toBe(scenarioTemperature('refrigeration_failure', 5));
    expect(scenarioTemperature('refrigeration_failure', 5)).toBeGreaterThan(scenarioTemperature('refrigeration_failure', 1));
  });

  it('classifies confirmed excursion, isolated fault, and insufficient coverage separately', () => {
    expect(classifyReadings([reading('a', 0, 9), reading('b', 2, 10)], 2, 8)).toBe('valid_excursion');
    expect(classifyReadings([reading('a', 0, 5), reading('b', 1, 12.4, false), reading('c', 2, 5)], 2, 8)).toBe('suspected_sensor_fault');
    expect(classifyReadings([reading('a', 0, 5), reading('b', 20, 5)], 2, 8)).toBe('insufficient_evidence');
  });

  it('sorts out-of-order samples, ignores duplicate timestamps, and separates uncertain exposure', () => {
    const result = calculateExposure([reading('b', 2, 5), reading('a', 0, 10, false), reading('duplicate', 0, 10, false)], 2, 8);
    expect(result.confirmedSeconds).toBe(0);
    expect(result.uncertainSeconds).toBe(120);
  });

  it('retains stable event ids and measurement timestamps for replay', () => {
    expect(makeReading('normal', 2, base)).toEqual(makeReading('normal', 2, base));
  });
});
