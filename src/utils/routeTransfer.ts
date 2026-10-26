import type { Route, Waypoint } from '../types';
import { pathDistanceMeters } from './geo';
import { getRouteLocations } from './savedRoutes';
import { FALLBACK_SPEED_KMH } from './speeds';
import { MAX_WAYPOINTS } from './waypoints';

/** Value of the `format` field in a routes export file. */
export const ROUTES_EXPORT_FORMAT = 'cardio-planner-routes';

/** Highest export format version that this app can read. */
export const ROUTES_EXPORT_VERSION = 1;

/** Largest file that an import accepts, in bytes (about the size of localStorage). */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Contents of a routes export file. */
export interface RoutesExport {
  /** Always {@link ROUTES_EXPORT_FORMAT}. */
  format: typeof ROUTES_EXPORT_FORMAT;
  /** Version of this file layout, see {@link ROUTES_EXPORT_VERSION}. */
  formatVersion: number;
  /** Version of the app that made the file. */
  appVersion: string;
  /** ISO-8601 time of the export. */
  exportedAt: string;
  /** The exported routes. */
  routes: Route[];
}

/** Why a file cannot be imported. */
export type RoutesImportError = 'notJson' | 'wrongFormat' | 'newerVersion';

/** Result of {@link parseRoutesImport}. */
export type RoutesImportResult =
  | {
      ok: true;
      /** Valid routes, in file order. */
      routes: Route[];
      /** Number of entries that are not valid routes. */
      invalid: number;
    }
  | { ok: false; error: RoutesImportError };

/** Result of {@link mergeRoutes}. */
export interface RoutesMergeResult {
  /** The saved routes followed by the added routes. */
  routes: Route[];
  /** Number of routes added. */
  added: number;
  /** Number of routes skipped because their id is already in the list. */
  duplicates: number;
}

function isValidDateString(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

/**
 * Build a clean route from a route in a file or in storage.
 *
 * [1] The waypoints must be valid. The geometry and the distance are
 *     calculated again from them, so the file cannot give wrong values.
 * [2] Fields that a route does not have are not copied.
 * [3] A duration that is not valid is calculated at the fallback speed.
 *
 * @param raw A route, possibly corrupt.
 * @param fallbackDate ISO-8601 time to use when `createdAt` is not valid.
 * @returns The route, or `null` when it has no id or its waypoints are not
 *   valid (fewer than two, or more than {@link MAX_WAYPOINTS}).
 */
export function normalizeTransferRoute(raw: unknown, fallbackDate: string): Route | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const source = raw as Partial<Record<keyof Route, unknown>>;
  if (typeof source.id !== 'string' || source.id.trim() === '') {
    return null;
  }
  // See note [1] in the docstring
  const locations = getRouteLocations(raw);
  if (!locations || locations.length > MAX_WAYPOINTS) {
    return null;
  }

  // See note [2] in the docstring
  const sourceWaypoints = source.waypoints as { name?: unknown }[];
  const waypoints: Waypoint[] = locations.map(([lat, lng], i) => {
    const name = sourceWaypoints[i]?.name;
    return typeof name === 'string' ? { location: [lat, lng], name } : { location: [lat, lng] };
  });
  const distance = pathDistanceMeters(locations);
  // See note [3] in the docstring
  const duration =
    typeof source.duration === 'number' && Number.isFinite(source.duration) && source.duration >= 0
      ? source.duration
      : distance / (FALLBACK_SPEED_KMH / 3.6);

  return {
    id: source.id,
    name: typeof source.name === 'string' ? source.name : '',
    waypoints,
    distance,
    duration,
    geometry: { type: 'LineString', coordinates: locations.map(([lat, lng]) => [lng, lat]) },
    createdAt: isValidDateString(source.createdAt) ? source.createdAt : fallbackDate,
  };
}

/**
 * Build the contents of a routes export file.
 * @param routes Stored routes, possibly with corrupt entries (they are not
 *   exported).
 * @param appVersion Version of this app.
 * @param now Time of the export.
 * @returns The export object, ready for `JSON.stringify`.
 */
export function buildRoutesExport(routes: readonly unknown[], appVersion: string, now: Date): RoutesExport {
  const exportedAt = now.toISOString();
  const valid: Route[] = [];
  for (const entry of routes) {
    const route = normalizeTransferRoute(entry, exportedAt);
    if (route) {
      valid.push(route);
    }
  }
  return {
    format: ROUTES_EXPORT_FORMAT,
    formatVersion: ROUTES_EXPORT_VERSION,
    appVersion,
    exportedAt,
    routes: valid,
  };
}

/**
 * Make the file name for a routes export.
 * @param now Time of the export. The name uses the local date.
 * @returns A name such as `cardio-planner-routes-2026-10-25.json`.
 */
export function routesExportFileName(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `cardio-planner-routes-${date}.json`;
}

/**
 * Read the text of an import file.
 *
 * [1] A plain array of routes is accepted too. This is the value that the
 *     app keeps in localStorage.
 * [2] A file from a newer format version is refused, because this app
 *     cannot know its fields.
 * [3] Entries that are not valid routes are counted, not imported.
 *
 * @param text Contents of the file.
 * @param now Time to use for routes without a valid `createdAt`, when the
 *   file has no valid `exportedAt`.
 * @returns The valid routes and the count of the others, or the error.
 */
export function parseRoutesImport(text: string, now: Date = new Date()): RoutesImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'notJson' };
  }

  let entries: unknown[];
  let fallbackDate = now.toISOString();
  // See note [1] in the docstring
  if (Array.isArray(parsed)) {
    entries = parsed;
  } else if (parsed && typeof parsed === 'object' && (parsed as RoutesExport).format === ROUTES_EXPORT_FORMAT) {
    const file = parsed as Partial<Record<keyof RoutesExport, unknown>>;
    const version = file.formatVersion;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1 || !Array.isArray(file.routes)) {
      return { ok: false, error: 'wrongFormat' };
    }
    // See note [2] in the docstring
    if (version > ROUTES_EXPORT_VERSION) {
      return { ok: false, error: 'newerVersion' };
    }
    entries = file.routes;
    if (isValidDateString(file.exportedAt)) {
      fallbackDate = file.exportedAt;
    }
  } else {
    return { ok: false, error: 'wrongFormat' };
  }

  // See note [3] in the docstring
  const routes: Route[] = [];
  let invalid = 0;
  for (const entry of entries) {
    const route = normalizeTransferRoute(entry, fallbackDate);
    if (route) {
      routes.push(route);
    } else {
      invalid++;
    }
  }
  return { ok: true, routes, invalid };
}

/**
 * Add imported routes to the saved routes.
 *
 * [1] A saved route does not change after it is saved, and each save gets a
 *     new id. Thus a route with an id that is already in the list is the
 *     same route, and it is skipped. This also applies to two routes with
 *     the same id in one file.
 *
 * @param existing Saved routes, possibly with corrupt entries (they stay).
 * @param incoming Routes from {@link parseRoutesImport}.
 * @returns The new list and the counts.
 */
export function mergeRoutes(existing: readonly Route[], incoming: readonly Route[]): RoutesMergeResult {
  const ids = new Set<string>();
  for (const entry of existing) {
    const id = (entry as { id?: unknown } | null)?.id;
    if (typeof id === 'string') {
      ids.add(id);
    }
  }

  const routes = [...existing];
  let added = 0;
  let duplicates = 0;
  for (const route of incoming) {
    // See note [1] in the docstring
    if (ids.has(route.id)) {
      duplicates++;
      continue;
    }
    ids.add(route.id);
    routes.push(route);
    added++;
  }
  return { routes, added, duplicates };
}
