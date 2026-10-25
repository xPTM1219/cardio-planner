import type { GeoJSONGeometry } from '../types';

/** Highest number of waypoints that one route can have. */
export const MAX_WAYPOINTS = 500;

/**
 * Time in milliseconds after a marker drag ends during which a map click is
 * ignored. Leaflet can send a map click when a drag ends with the pointer
 * off the marker.
 */
export const DRAG_CLICK_GUARD_MS = 300;

/** Result of {@link decideMapClick}. */
export type MapClickDecision = 'add' | 'ignore' | 'limit';

/** Input for {@link decideMapClick}. */
export interface MapClickState {
  /** `true` while a marker drag is in progress. */
  dragging: boolean;
  /** Milliseconds since the last marker drag ended (`Infinity` if none). */
  msSinceDragEnd: number;
  /** Number of waypoints on the map now. */
  count: number;
  /** Waypoint limit. Defaults to {@link MAX_WAYPOINTS}. */
  max?: number;
}

/**
 * Decide what a click on the map does.
 *
 * [1] A click during a drag, or immediately after it, comes from the drag.
 *     The click does not add a waypoint.
 * [2] At the limit, the click does not add a waypoint. The caller shows a
 *     message.
 *
 * @param state Drag state and waypoint count at the time of the click.
 * @returns `'add'` to add a waypoint, `'ignore'` to do nothing, or
 *   `'limit'` when the waypoint limit stops the click.
 */
export function decideMapClick(state: MapClickState): MapClickDecision {
  // See note [1] in the docstring
  if (state.dragging || state.msSinceDragEnd < DRAG_CLICK_GUARD_MS) {
    return 'ignore';
  }
  // See note [2] in the docstring
  if (state.count >= (state.max ?? MAX_WAYPOINTS)) {
    return 'limit';
  }
  return 'add';
}

/**
 * Format a `[lat, lng]` location for display, with four decimals.
 * @param location `[lat, lng]` coordinate.
 * @returns Text such as `"45.0000, -100.0000"`.
 */
export function formatLatLng(location: [number, number]): string {
  return `${location[0].toFixed(4)}, ${location[1].toFixed(4)}`;
}

/**
 * Convert GeoJSON `[lon, lat]` coordinates to the `[lat, lng]` order that
 * Leaflet uses.
 * @param geometry GeoJSON LineString geometry.
 * @returns The coordinates in `[lat, lng]` order.
 */
export function geometryToLatLngs(geometry: GeoJSONGeometry): [number, number][] {
  return geometry.coordinates.map(([lon, lat]) => [lat, lon]);
}

/**
 * Check that a value is a valid `[lat, lng]` pair.
 * @param value Any value, for example from stored JSON.
 * @returns `true` for a two-item array of finite numbers in the latitude
 *   (-90 to 90) and longitude (-180 to 180) ranges.
 */
export function isLatLng(value: unknown): value is [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    return false;
  }
  const [lat, lng] = value as unknown[];
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}
