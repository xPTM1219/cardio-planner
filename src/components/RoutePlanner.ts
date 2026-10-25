import { Route, Waypoint } from '../types';
import {
  FALLBACK_SPEED_KMH,
  ResolvedSpeed,
  Units,
  convertDistance,
  formatSpeedBasis,
  unitLabels,
} from '../utils/speeds';
import { formatDuration } from '../utils/format';
import { MAX_WAYPOINTS } from '../utils/waypoints';
import { t } from '../i18n';

// Haversine distance calculation
function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

/**
 * Great-circle distance between two `[lat, lon]` points using the Haversine
 * formula on a spherical earth of radius 6371 km.
 */
function distanceMeters(a: [number, number], b: [number, number]): number {
  const earthRadiusM = 6371e3;
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return earthRadiusM * c;
}

/**
 * Plans straight-line routes between waypoints and formats the results.
 *
 * Distances are sums of Haversine segment lengths; duration is derived from a
 * caller-provided speed (see {@link resolveSpeed} for how one is chosen from
 * user settings).
 *
 * All methods that change the waypoints also clear the current route,
 * because a calculated route is not correct after its waypoints change.
 */
export class RoutePlanner {
  private static instance: RoutePlanner;
  private waypoints: Waypoint[] = [];
  private currentRoute: Route | null = null;

  private constructor() {}

  /** Returns the shared singleton instance. */
  public static getInstance(): RoutePlanner {
    if (!RoutePlanner.instance) {
      RoutePlanner.instance = new RoutePlanner();
    }
    return RoutePlanner.instance;
  }

  /**
   * Add a waypoint to the end of the route and clear the current route.
   * @param location `[lat, lon]` coordinate.
   * @param name Optional display name.
   * @returns `false` when {@link MAX_WAYPOINTS} stops the add, else `true`.
   */
  addWaypoint(location: [number, number], name?: string): boolean {
    if (this.waypoints.length >= MAX_WAYPOINTS) {
      console.warn(`Maximum of ${MAX_WAYPOINTS} waypoints allowed`);
      return false;
    }
    this.waypoints.push({ location, name });
    this.currentRoute = null;
    return true;
  }

  /** Remove the last waypoint, if any, and clear the current route. */
  removeLastWaypoint(): void {
    this.waypoints.pop();
    this.currentRoute = null;
  }

  /** Remove all waypoints and clear the current route. */
  clearWaypoints(): void {
    this.waypoints = [];
    this.currentRoute = null;
  }

  /**
   * Replace all waypoints with the provided locations (names cleared) and
   * clear the current route. Locations past {@link MAX_WAYPOINTS} are dropped.
   * @param locations Ordered `[lat, lon]` coordinates.
   */
  setWaypoints(locations: [number, number][]): void {
    this.waypoints = locations.slice(0, MAX_WAYPOINTS).map((loc) => ({ location: loc }));
    this.currentRoute = null;
  }

  /**
   * Remove the waypoint at a specific index and clear the current route.
   * @param index Zero-based position; out-of-range values are ignored.
   */
  removeWaypointAt(index: number): void {
    if (index >= 0 && index < this.waypoints.length) {
      this.waypoints.splice(index, 1);
      this.currentRoute = null;
    }
  }

  /**
   * Update the location of the waypoint at a specific index and clear the
   * current route.
   * @param index Zero-based position; out-of-range values are ignored.
   * @param location New `[lat, lon]` coordinate.
   */
  updateWaypointLocation(index: number, location: [number, number]): void {
    if (index >= 0 && index < this.waypoints.length) {
      this.waypoints[index].location = location;
      this.currentRoute = null;
    }
  }

  /**
   * Get the current waypoints in route order.
   * @returns The live waypoint list (not a copy).
   */
  getWaypoints(): Waypoint[] {
    return this.waypoints;
  }

  /**
   * Calculate a route from the current waypoints using straight-line
   * (Haversine) distances.
   *
   * [1] The total distance is the sum of the straight-line segments.
   * [2] The geometry is a GeoJSON LineString, so coordinates are `[lon, lat]`.
   * [3] The route gets a copy of the waypoints, so later edits do not change it.
   *
   * @param speedMps Effective speed in meters per second; defaults to the
   *   legacy walking fallback of 5 km/h when omitted or not positive.
   * @returns The calculated route and stores it as the current route, or
   *   `null` when fewer than two waypoints are set.
   */
  async calculateRoute(speedMps: number = FALLBACK_SPEED_KMH / 3.6): Promise<Route | null> {
    if (this.waypoints.length < 2) {
      console.warn('Need at least 2 waypoints to calculate a route');
      return null;
    }

    try {
      // See note [1] in the docstring
      let totalDistance = 0;
      for (let i = 1; i < this.waypoints.length; i++) {
        totalDistance += distanceMeters(this.waypoints[i - 1].location, this.waypoints[i].location);
      }

      const effectiveSpeedMps =
        Number.isFinite(speedMps) && speedMps > 0 ? speedMps : FALLBACK_SPEED_KMH / 3.6;
      const estimatedDuration = totalDistance / effectiveSpeedMps;

      // See note [2] in the docstring
      const coordinates: [number, number][] = this.waypoints.map(wp => [wp.location[1], wp.location[0]]);

      // See note [3] in the docstring
      const route: Route = {
        id: Date.now().toString(),
        name: t('plannedRouteName', { n: this.waypoints.length }),
        waypoints: this.waypoints.map((wp) => ({ ...wp, location: [wp.location[0], wp.location[1]] })),
        distance: totalDistance,
        duration: estimatedDuration,
        geometry: {
          type: 'LineString',
          coordinates,
        },
        createdAt: new Date().toISOString(),
      };

      this.currentRoute = route;
      return route;

    } catch (error) {
      console.error('Error calculating route:', error);
      throw error;
    }
  }

  /**
   * Get the most recently calculated route.
   * @returns The current route, or `null` if none has been calculated.
   */
  getCurrentRoute(): Route | null {
    return this.currentRoute;
  }

  /**
   * Convert a distance to the user's preferred unit system.
   * @param distanceMeters Distance in meters.
   * @param units Target unit system.
   * @returns Distance rounded to two decimals, in km or mi.
   */
  convertDistance(distanceMeters: number, units: Units): number {
    return convertDistance(distanceMeters, units);
  }

  /**
   * Format a duration in the active language (see {@link formatDuration}).
   * @param seconds Duration in seconds.
   * @returns Text such as `"25 min"` or `"1 h 5 min"`.
   */
  convertDuration(seconds: number): string {
    return formatDuration(seconds);
  }

  /**
   * Build the formatted multi-line route summary shown in the status panel.
   *
   * @param units Unit system used for the distance value.
   * @param resolved Optional resolved speed basis; when given, an extra line
   *   explains which speed was used (e.g. "at your pace 6:30 min/km").
   * @returns The summary text, or `null` when no route has been calculated.
   */
  getRouteInfo(units: Units, resolved?: ResolvedSpeed): string | null {
    if (!this.currentRoute) {
      return null;
    }

    const distance = this.convertDistance(this.currentRoute.distance, units);
    const duration = this.convertDuration(this.currentRoute.duration);
    const unitLabel = unitLabels(units).distance;

    const lines = [`${t('distanceLabel')} ${distance} ${unitLabel}`, `${t('durationLabel')} ${duration}`];
    if (resolved) {
      lines.push(formatSpeedBasis(resolved, units));
    }
    return lines.join('\n');
  }

  /** Clear the current route and all waypoints. */
  clear(): void {
    this.currentRoute = null;
    this.waypoints = [];
  }
}
