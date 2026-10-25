import { describe, expect, it } from 'vitest';
import type { Route } from '../types';
import { formatDate } from './format';
import { getRouteLocations, toSavedRouteRows } from './savedRoutes';

function makeRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 'r1',
    name: 'Hill Loop',
    waypoints: [{ location: [45, -100] }, { location: [45.01, -100] }, { location: [45.02, -100] }],
    distance: 5000,
    duration: 3600,
    geometry: { type: 'LineString', coordinates: [] },
    createdAt: '2026-10-20T10:00:00.000Z',
    ...overrides,
  };
}

const metricOptions = { units: 'metric' as const, language: 'en' as const, speedMps: 5 / 3.6 };

describe('toSavedRouteRows', () => {
  it('builds a row with converted distance, points, and date', () => {
    const [row] = toSavedRouteRows([makeRoute()], metricOptions);
    expect(row).toEqual({
      id: 'r1',
      name: 'Hill Loop',
      distance: 5,
      durationSeconds: 5000 / (5 / 3.6),
      points: 3,
      createdAtMs: Date.parse('2026-10-20T10:00:00.000Z'),
      createdAtLabel: formatDate(new Date('2026-10-20T10:00:00.000Z'), 'en'),
    });
  });

  it('converts the distance to miles for imperial units', () => {
    const [row] = toSavedRouteRows([makeRoute({ distance: 1609.344 })], { ...metricOptions, units: 'imperial' });
    expect(row.distance).toBe(1);
  });

  it('uses the current speed for the time, not the stored duration', () => {
    const [row] = toSavedRouteRows([makeRoute({ distance: 12000, duration: 1 })], { ...metricOptions, speedMps: 12 / 3.6 });
    expect(row.durationSeconds).toBeCloseTo(3600, 6);
  });

  it('falls back to the stored duration when the speed is not valid', () => {
    const [row] = toSavedRouteRows([makeRoute({ duration: 1234 })], { ...metricOptions, speedMps: 0 });
    expect(row.durationSeconds).toBe(1234);
  });

  it('formats the date in the UI language', () => {
    const route = makeRoute();
    const [es] = toSavedRouteRows([route], { ...metricOptions, language: 'es' });
    expect(es.createdAtLabel).toBe(formatDate(new Date(route.createdAt), 'es'));
  });

  it('skips corrupt entries and keeps the valid ones in order', () => {
    const rows = toSavedRouteRows(
      [
        null,
        'text',
        { id: 5, waypoints: [] },
        makeRoute({ id: 'a' }),
        { ...makeRoute({ id: 'b' }), waypoints: [{ location: [45, -100] }] },
        { ...makeRoute({ id: 'c' }), waypoints: [{ location: [999, 0] }, { location: [0, 0] }] },
        makeRoute({ id: 'd' }),
      ],
      metricOptions
    );
    expect(rows.map((r) => r.id)).toEqual(['a', 'd']);
  });

  it('repairs bad names, distances, and dates', () => {
    const [row] = toSavedRouteRows(
      [makeRoute({ name: '  ', distance: NaN, createdAt: 'not a date' })],
      metricOptions
    );
    expect(row.name).toBe('r1');
    expect(row.distance).toBe(0);
    expect(row.createdAtMs).toBe(0);
    expect(row.createdAtLabel).toBe('');
  });
});

describe('getRouteLocations', () => {
  it('returns the locations of a valid route', () => {
    expect(getRouteLocations(makeRoute())).toEqual([
      [45, -100],
      [45.01, -100],
      [45.02, -100],
    ]);
  });

  it('returns null for fewer than two points or bad data', () => {
    expect(getRouteLocations(undefined)).toBeNull();
    expect(getRouteLocations({ waypoints: 'x' })).toBeNull();
    expect(getRouteLocations({ waypoints: [{ location: [1, 2] }] })).toBeNull();
    expect(getRouteLocations({ waypoints: [{ location: [1, 2] }, null] })).toBeNull();
  });
});
