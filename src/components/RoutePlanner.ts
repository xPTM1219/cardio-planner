import { Route, Waypoint } from '../types';
import { FALLBACK_SPEED_KMH, ResolvedSpeed, Units, formatSpeedBasis } from '../utils/speeds';
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
   * Add a waypoint to the end of the route.
   * @param location `[lat, lon]` coordinate.
   * @param name Optional display name.
   */
  addWaypoint(location: [number, number], name?: string): void {
    if (this.waypoints.length >= 500) {
      console.warn('Maximum of 100 waypoints allowed');
      return;
    }
    this.waypoints.push({ location, name });
  }

  /** Remove the last waypoint, if any. */
  removeLastWaypoint(): void {
    this.waypoints.pop();
  }

  /** Remove all waypoints. The current route is left untouched (use {@link clear}). */
  clearWaypoints(): void {
    this.waypoints = [];
  }

  /**
   * Replace all waypoints with the provided locations (names cleared).
   * @param locations Ordered `[lat, lon]` coordinates.
   */
  setWaypoints(locations: [number, number][]): void {
    this.waypoints = locations.map((loc) => ({ location: loc }));
  }

  /**
   * Remove the waypoint at a specific index.
   * @param index Zero-based position; out-of-range values are ignored.
   */
  removeWaypointAt(index: number): void {
    if (index >= 0 && index < this.waypoints.length) {
      this.waypoints.splice(index, 1);
    }
  }

  /**
   * Update the location of the waypoint at a specific index.
   * @param index Zero-based position; out-of-range values are ignored.
   * @param location New `[lat, lon]` coordinate.
   */
  updateWaypointLocation(index: number, location: [number, number]): void {
    if (index >= 0 && index < this.waypoints.length) {
      this.waypoints[index].location = location;
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
      // Calculate total distance as sum of straight-line segments
      let totalDistance = 0;
      for (let i = 1; i < this.waypoints.length; i++) {
        totalDistance += distanceMeters(this.waypoints[i - 1].location, this.waypoints[i].location);
      }

      const effectiveSpeedMps =
        Number.isFinite(speedMps) && speedMps > 0 ? speedMps : FALLBACK_SPEED_KMH / 3.6;
      const estimatedDuration = totalDistance / effectiveSpeedMps;

      // Create geometry as LineString with waypoint coordinates
      const coordinates: [number, number][] = this.waypoints.map(wp => [wp.location[1], wp.location[0]]);

      // Create route object
      const route: Route = {
        id: Date.now().toString(),
        name: `Planned Route (${this.waypoints.length} waypoints)`,
        waypoints: this.waypoints,
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
    if (units === 'metric') {
      return Math.round(distanceMeters / 1000 * 100) / 100; // kilometers
    } else {
      return Math.round(distanceMeters * 0.000621371 * 100) / 100; // miles
    }
  }

  /**
   * Format a duration as a compact human string (`Xm`, or `Xh Ym` past an hour).
   * @param seconds Duration in seconds.
   */
  convertDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
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
    const unitLabel = units === 'metric' ? 'km' : 'mi';

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
