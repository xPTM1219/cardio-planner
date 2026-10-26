import type { GeoJSONGeometry } from '../types';

/** Highest number of waypoints that one route can have. */
export const MAX_WAYPOINTS = 500;

/**
 * Time in milliseconds after a marker drag or a selection box ends during
 * which a map click is ignored. Leaflet can send a map click when a drag
 * ends with the pointer off the marker, and the browser sends one when a
 * box ends.
 */
export const DRAG_CLICK_GUARD_MS = 300;

/** Result of {@link decideMapClick}. */
export type MapClickDecision = 'add' | 'ignore' | 'limit' | 'deselect';

/** Input for {@link decideMapClick}. */
export interface MapClickState {
  /** `true` while a marker drag is in progress. */
  dragging: boolean;
  /** Milliseconds since the last marker drag or box ended (`Infinity` if none). */
  msSinceDragEnd: number;
  /** Number of waypoints on the map now. */
  count: number;
  /** Waypoint limit. Defaults to {@link MAX_WAYPOINTS}. */
  max?: number;
  /** `true` when Ctrl or Cmd is down (see {@link isSelectModifier}). */
  modifier?: boolean;
  /** Number of selected waypoints. Defaults to 0. */
  selectedCount?: number;
}

/**
 * Decide what a click on the map or on the waypoint line does.
 *
 * [1] A click during a drag, or immediately after it, comes from the drag.
 *     The click does not add a waypoint.
 * [2] Ctrl or Cmd is for selection. Such a click does not add a waypoint.
 * [3] When waypoints are selected, a click clears the selection and adds no
 *     waypoint. This also applies at the limit.
 * [4] At the limit, the click does not add a waypoint. The caller shows a
 *     message.
 *
 * @param state Drag, key, and waypoint state at the time of the click.
 * @returns `'add'` to add a waypoint, `'ignore'` to do nothing,
 *   `'deselect'` to clear the selection, or `'limit'` when the waypoint
 *   limit stops the click.
 */
export function decideMapClick(state: MapClickState): MapClickDecision {
  // See note [1] in the docstring
  if (state.dragging || state.msSinceDragEnd < DRAG_CLICK_GUARD_MS) {
    return 'ignore';
  }
  // See note [2] in the docstring
  if (state.modifier) {
    return 'ignore';
  }
  // See note [3] in the docstring
  if ((state.selectedCount ?? 0) > 0) {
    return 'deselect';
  }
  // See note [4] in the docstring
  if (state.count >= (state.max ?? MAX_WAYPOINTS)) {
    return 'limit';
  }
  return 'add';
}

/** A rectangle in pixels. `left` ≤ `right` and `top` ≤ `bottom`. */
export interface PixelRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Make the rectangle between two corners.
 * @param a One corner, in pixels.
 * @param b The opposite corner, in pixels, in any direction from `a`.
 * @returns The rectangle with its sides in order.
 */
export function rectFromCorners(a: PixelPoint, b: PixelPoint): PixelRect {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  };
}

/**
 * Find the points in a rectangle. Points on an edge are in it.
 * @param points Points in pixels.
 * @param rect Rectangle in the same pixels.
 * @returns The indexes of the points in the rectangle, in order.
 */
export function pointsInRect(points: readonly PixelPoint[], rect: PixelRect): number[] {
  const inside: number[] = [];
  points.forEach((p, i) => {
    if (p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom) {
      inside.push(i);
    }
  });
  return inside;
}

/**
 * Check if the key for selection (Ctrl, or Cmd on macOS) is down.
 *
 * On macOS, Ctrl+click opens the context menu and sends no click, so Cmd is
 * accepted too.
 *
 * @param e Mouse or keyboard event.
 * @returns `true` when Ctrl or Cmd is down.
 */
export function isSelectModifier(e: Pick<MouseEvent, 'ctrlKey' | 'metaKey'>): boolean {
  return e.ctrlKey || e.metaKey;
}

/** A point in pixels. Leaflet's `L.Point` has this shape. */
export interface PixelPoint {
  x: number;
  y: number;
}

/** Result of {@link nearestSegment}. */
export interface NearestSegment {
  /** Index of the first point of the segment. */
  index: number;
  /** Point on the segment nearest to the given point. */
  point: PixelPoint;
  /** Place of `point` on the segment, from 0 (first point) to 1 (second point). */
  t: number;
}

/**
 * Find the segment of a path that is nearest to a point.
 *
 * [1] The given point is projected onto the segment. The result stays
 *     between the two ends of the segment.
 * [2] When two segments are at the same distance, the first one wins.
 *
 * @param points Ordered points of the path, in pixels.
 * @param p Point in pixels, for example a click.
 * @returns The nearest segment and the nearest point on it, or `null` when
 *   the path has fewer than two points.
 */
export function nearestSegment(points: readonly PixelPoint[], p: PixelPoint): NearestSegment | null {
  let best: NearestSegment | null = null;
  let bestDistance = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const dx = points[i + 1].x - a.x;
    const dy = points[i + 1].y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    // See note [1] in the docstring
    const t =
      lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
    const point = { x: a.x + t * dx, y: a.y + t * dy };
    const distance = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
    // See note [2] in the docstring
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { index: i, point, t };
    }
  }
  return best;
}

/** Position of a waypoint in its route. It sets the marker color and label. */
export type WaypointRole = 'start' | 'middle' | 'end';

/**
 * Get the role of the waypoint at a position.
 * @param index Zero-based position of the waypoint.
 * @param count Number of waypoints in the route.
 * @returns `'start'` for the first waypoint (also when it is the only one),
 *   `'end'` for the last, and `'middle'` for the others.
 */
export function waypointRole(index: number, count: number): WaypointRole {
  if (index === 0) {
    return 'start';
  }
  return index === count - 1 ? 'end' : 'middle';
}

/**
 * Move a longitude into the range -180 to 180.
 *
 * Leaflet shows copies of the world side by side. A click on a copy gives a
 * longitude outside this range, and stored routes must use the range.
 *
 * @param location `[lat, lng]` with any longitude.
 * @returns The same place with a longitude from -180 to 180.
 */
export function wrapLatLng(location: [number, number]): [number, number] {
  const [lat, lng] = location;
  if (lng >= -180 && lng <= 180) {
    return [lat, lng];
  }
  return [lat, lng - 360 * Math.round(lng / 360)];
}

/**
 * Shift longitudes by whole turns (360°) so that a path does not jump across
 * the map. Paths that do not cross the 180° meridian do not change.
 *
 * [1] When `referenceLng` is given, the first point moves to the copy of the
 *     world nearest to it.
 * [2] Each next point moves to within 180° of the point before it.
 *
 * @param locations Ordered `[lat, lng]` points.
 * @param referenceLng Optional longitude to put the first point near.
 * @returns New points in the same order.
 */
export function unwrapPath(locations: readonly [number, number][], referenceLng?: number): [number, number][] {
  const result: [number, number][] = [];
  // See note [1] in the docstring
  let previous = referenceLng;
  for (const [lat, lng] of locations) {
    // See note [2] in the docstring
    const shifted = previous === undefined ? lng : lng + 360 * Math.round((previous - lng) / 360);
    result.push([lat, shifted]);
    previous = shifted;
  }
  return result;
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
