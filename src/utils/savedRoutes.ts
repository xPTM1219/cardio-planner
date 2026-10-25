import type { Language } from '../i18n';
import type { Route } from '../types';
import { formatDate } from './format';
import { Units, convertDistance } from './speeds';
import { isLatLng } from './waypoints';

/** One row of the saved-routes table. */
export interface SavedRouteRow {
  /** Route id, also the Tabulator row index. */
  id: string;
  /** Route name (the id when the stored name is empty). */
  name: string;
  /** Distance in km or miles, rounded to two decimals. */
  distance: number;
  /** Estimated time at the current speed settings, in seconds. */
  durationSeconds: number;
  /** Number of waypoints. */
  points: number;
  /** Save time in ms since the epoch, used for sorting (`0` if unknown). */
  createdAtMs: number;
  /** Save date formatted in the UI language (empty if unknown). */
  createdAtLabel: string;
}

/** Settings that change how the rows are calculated and shown. */
export interface SavedRouteRowOptions {
  /** Unit system for the distance column. */
  units: Units;
  /** UI language for the date column. */
  language: Language;
  /** Current effective speed in m/s, used for the estimated time. */
  speedMps: number;
}

/**
 * Get the waypoint locations of a stored route, if they are valid.
 * @param route A stored route, possibly corrupt.
 * @returns At least two valid `[lat, lng]` locations, or `null`.
 */
export function getRouteLocations(route: unknown): [number, number][] | null {
  if (!route || typeof route !== 'object') {
    return null;
  }
  const waypoints = (route as { waypoints?: unknown }).waypoints;
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return null;
  }
  const locations: unknown[] = waypoints.map((wp: unknown) =>
    wp && typeof wp === 'object' ? (wp as { location?: unknown }).location : undefined
  );
  return locations.every(isLatLng) ? locations : null;
}

/**
 * Convert stored routes to rows for the saved-routes table.
 *
 * [1] Entries without a string id or valid waypoints are skipped.
 * [2] The estimated time uses the current speed settings, so it agrees with
 *     the time shown after the route is loaded. If the speed is not valid,
 *     the stored duration is used.
 *
 * @param routes Stored routes, possibly with corrupt entries.
 * @param options Units, language, and current speed.
 * @returns One row for each valid route, in the input order.
 */
export function toSavedRouteRows(routes: readonly unknown[], options: SavedRouteRowOptions): SavedRouteRow[] {
  const rows: SavedRouteRow[] = [];
  for (const entry of routes) {
    const route = entry as Partial<Route> | null;
    const locations = getRouteLocations(route);
    // See note [1] in the docstring
    if (!route || typeof route.id !== 'string' || !locations) {
      continue;
    }

    const distanceMeters =
      typeof route.distance === 'number' && Number.isFinite(route.distance) && route.distance >= 0
        ? route.distance
        : 0;
    // See note [2] in the docstring
    const durationSeconds =
      Number.isFinite(options.speedMps) && options.speedMps > 0
        ? distanceMeters / options.speedMps
        : typeof route.duration === 'number' && Number.isFinite(route.duration)
          ? route.duration
          : 0;
    const createdAtMs = typeof route.createdAt === 'string' ? Date.parse(route.createdAt) : NaN;
    const validDate = Number.isFinite(createdAtMs);

    rows.push({
      id: route.id,
      name: typeof route.name === 'string' && route.name.trim() !== '' ? route.name : route.id,
      distance: convertDistance(distanceMeters, options.units),
      durationSeconds,
      points: locations.length,
      createdAtMs: validDate ? createdAtMs : 0,
      createdAtLabel: validDate ? formatDate(new Date(createdAtMs), options.language) : '',
    });
  }
  return rows;
}
