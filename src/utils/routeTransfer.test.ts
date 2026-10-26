import { describe, expect, it } from 'vitest';
import type { Route } from '../types';
import { pathDistanceMeters } from './geo';
import {
  ROUTES_EXPORT_FORMAT,
  ROUTES_EXPORT_VERSION,
  buildRoutesExport,
  mergeRoutes,
  normalizeTransferRoute,
  parseRoutesImport,
  routesExportFileName,
} from './routeTransfer';
import { FALLBACK_SPEED_KMH } from './speeds';
import { MAX_WAYPOINTS } from './waypoints';

const NOW = new Date('2026-10-25T12:00:00.000Z');

function makeRoute(overrides: Partial<Route> = {}): Route {
  const locations: [number, number][] = [
    [45, -100],
    [45.01, -100],
    [45.02, -100.01],
  ];
  return {
    id: 'r1',
    name: 'Hill Loop',
    waypoints: locations.map((location) => ({ location })),
    distance: pathDistanceMeters(locations),
    duration: 1800,
    geometry: { type: 'LineString', coordinates: locations.map(([lat, lng]) => [lng, lat]) },
    createdAt: '2026-10-20T10:00:00.000Z',
    ...overrides,
  };
}

describe('normalizeTransferRoute', () => {
  it('keeps a valid route as it is', () => {
    const route = makeRoute();
    expect(normalizeTransferRoute(route, NOW.toISOString())).toEqual(route);
  });

  it('calculates the geometry and the distance again', () => {
    const route = makeRoute({ distance: 1, geometry: { type: 'LineString', coordinates: [[0, 0]] } });
    const result = normalizeTransferRoute(route, NOW.toISOString());
    expect(result?.distance).toBe(makeRoute().distance);
    expect(result?.geometry).toEqual(makeRoute().geometry);
  });

  it('removes fields that a route does not have', () => {
    const raw = { ...makeRoute(), extra: '<script>', waypoints: [{ location: [1, 2], junk: 1 }, { location: [3, 4] }] };
    const result = normalizeTransferRoute(raw, NOW.toISOString());
    expect(result).not.toHaveProperty('extra');
    expect(result?.waypoints).toEqual([{ location: [1, 2] }, { location: [3, 4] }]);
  });

  it('keeps waypoint names that are strings', () => {
    const raw = makeRoute({ waypoints: [{ location: [1, 2], name: 'Park' }, { location: [3, 4] }] });
    expect(normalizeTransferRoute(raw, NOW.toISOString())?.waypoints[0]).toEqual({ location: [1, 2], name: 'Park' });
  });

  it('uses defaults for a missing name, duration, or date', () => {
    const raw = { ...makeRoute(), name: 42, duration: -5, createdAt: 'yesterday' };
    const result = normalizeTransferRoute(raw, NOW.toISOString());
    expect(result?.name).toBe('');
    expect(result?.duration).toBeCloseTo(makeRoute().distance / (FALLBACK_SPEED_KMH / 3.6));
    expect(result?.createdAt).toBe(NOW.toISOString());
  });

  it('refuses a route without an id or with bad waypoints', () => {
    const fallback = NOW.toISOString();
    expect(normalizeTransferRoute(null, fallback)).toBeNull();
    expect(normalizeTransferRoute('route', fallback)).toBeNull();
    expect(normalizeTransferRoute({ ...makeRoute(), id: 7 }, fallback)).toBeNull();
    expect(normalizeTransferRoute(makeRoute({ id: '  ' }), fallback)).toBeNull();
    expect(normalizeTransferRoute(makeRoute({ waypoints: [{ location: [1, 2] }] }), fallback)).toBeNull();
    expect(
      normalizeTransferRoute(makeRoute({ waypoints: [{ location: [1, 2] }, { location: [91, 0] }] }), fallback)
    ).toBeNull();
  });

  it('refuses a route with more than the waypoint limit', () => {
    const waypoints = Array.from({ length: MAX_WAYPOINTS + 1 }, (_, i) => ({
      location: [0, i / 1000] as [number, number],
    }));
    expect(normalizeTransferRoute(makeRoute({ waypoints }), NOW.toISOString())).toBeNull();
    expect(normalizeTransferRoute(makeRoute({ waypoints: waypoints.slice(1) }), NOW.toISOString())).not.toBeNull();
  });
});

describe('buildRoutesExport', () => {
  it('builds the file with only the valid routes', () => {
    const data = buildRoutesExport([makeRoute(), { id: 'bad' }, null], '1.1.0', NOW);
    expect(data).toEqual({
      format: ROUTES_EXPORT_FORMAT,
      formatVersion: ROUTES_EXPORT_VERSION,
      appVersion: '1.1.0',
      exportedAt: NOW.toISOString(),
      routes: [makeRoute()],
    });
  });
});

describe('routesExportFileName', () => {
  it('uses the local date', () => {
    expect(routesExportFileName(new Date(2026, 0, 5, 23, 30))).toBe('cardio-planner-routes-2026-01-05.json');
  });
});

describe('parseRoutesImport', () => {
  it('reads a file made by buildRoutesExport', () => {
    const routes = [makeRoute(), makeRoute({ id: 'r2', name: 'River' })];
    const text = JSON.stringify(buildRoutesExport(routes, '1.1.0', NOW));
    expect(parseRoutesImport(text)).toEqual({ ok: true, routes, invalid: 0 });
  });

  it('accepts a plain array of routes', () => {
    expect(parseRoutesImport(JSON.stringify([makeRoute()]))).toEqual({ ok: true, routes: [makeRoute()], invalid: 0 });
  });

  it('counts the entries that are not valid', () => {
    const text = JSON.stringify({ ...buildRoutesExport([], '1.1.0', NOW), routes: [makeRoute(), { id: 'x' }, 3] });
    expect(parseRoutesImport(text)).toEqual({ ok: true, routes: [makeRoute()], invalid: 2 });
  });

  it('uses the export time for routes without a valid date', () => {
    const exportedAt = '2026-09-01T08:00:00.000Z';
    const text = JSON.stringify({
      ...buildRoutesExport([], '1.1.0', NOW),
      exportedAt,
      routes: [{ ...makeRoute(), createdAt: undefined }],
    });
    const result = parseRoutesImport(text);
    expect(result.ok && result.routes[0].createdAt).toBe(exportedAt);
  });

  it('refuses text that is not JSON', () => {
    expect(parseRoutesImport('not json {')).toEqual({ ok: false, error: 'notJson' });
    expect(parseRoutesImport('')).toEqual({ ok: false, error: 'notJson' });
  });

  it('refuses JSON of another kind', () => {
    expect(parseRoutesImport('{"name":"x"}')).toEqual({ ok: false, error: 'wrongFormat' });
    expect(parseRoutesImport('"text"')).toEqual({ ok: false, error: 'wrongFormat' });
    expect(parseRoutesImport('null')).toEqual({ ok: false, error: 'wrongFormat' });
  });

  it('refuses an export with a bad version or no route list', () => {
    const base = buildRoutesExport([], '1.1.0', NOW);
    expect(parseRoutesImport(JSON.stringify({ ...base, formatVersion: '1' }))).toEqual({ ok: false, error: 'wrongFormat' });
    expect(parseRoutesImport(JSON.stringify({ ...base, formatVersion: 0 }))).toEqual({ ok: false, error: 'wrongFormat' });
    expect(parseRoutesImport(JSON.stringify({ ...base, routes: {} }))).toEqual({ ok: false, error: 'wrongFormat' });
  });

  it('refuses a file from a newer format version', () => {
    const text = JSON.stringify({ ...buildRoutesExport([], '9.0.0', NOW), formatVersion: ROUTES_EXPORT_VERSION + 1 });
    expect(parseRoutesImport(text)).toEqual({ ok: false, error: 'newerVersion' });
  });
});

describe('mergeRoutes', () => {
  it('adds the routes with new ids after the saved routes', () => {
    const saved = [makeRoute({ id: 'a' })];
    const result = mergeRoutes(saved, [makeRoute({ id: 'b' }), makeRoute({ id: 'c' })]);
    expect(result.routes.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(result).toMatchObject({ added: 2, duplicates: 0 });
  });

  it('skips the routes whose id is already saved', () => {
    const saved = [makeRoute({ id: 'a', name: 'Mine' })];
    const result = mergeRoutes(saved, [makeRoute({ id: 'a', name: 'Theirs' }), makeRoute({ id: 'b' })]);
    expect(result.routes.map((r) => r.name)).toEqual(['Mine', 'Hill Loop']);
    expect(result).toMatchObject({ added: 1, duplicates: 1 });
  });

  it('skips a second route with the same id in one file', () => {
    const result = mergeRoutes([], [makeRoute({ id: 'a' }), makeRoute({ id: 'a' })]);
    expect(result).toMatchObject({ added: 1, duplicates: 1 });
  });

  it('keeps corrupt saved entries and does not change the input', () => {
    const saved = [null, { id: 3 }] as unknown as Route[];
    const result = mergeRoutes(saved, [makeRoute()]);
    expect(result.routes).toEqual([null, { id: 3 }, makeRoute()]);
    expect(saved).toHaveLength(2);
  });
});
