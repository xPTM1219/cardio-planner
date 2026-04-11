import { Route, RouteComparison, RouteSource, Waypoint } from '../types';

// Haversine distance calculation
function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

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

export class RoutePlanner {
  private static instance: RoutePlanner;
  private waypoints: Waypoint[] = [];
  private currentRoute: Route | null = null;

  private constructor() {}

  public static getInstance(): RoutePlanner {
    if (!RoutePlanner.instance) {
      RoutePlanner.instance = new RoutePlanner();
    }
    return RoutePlanner.instance;
  }

  /**
   * Add a waypoint to the route
   */
  addWaypoint(location: [number, number], name?: string): void {
    if (this.waypoints.length >= 100) {
      console.warn('Maximum of 100 waypoints allowed');
      return;
    }
    this.waypoints.push({ location, name });
  }

  /**
   * Remove the last waypoint
   */
  removeLastWaypoint(): void {
    this.waypoints.pop();
  }

  /**
   * Clear all waypoints
   */
  clearWaypoints(): void {
    this.waypoints = [];
  }

  /**
   * Get current waypoints
   */
  getWaypoints(): Waypoint[] {
    return this.waypoints;
  }

  /**
   * Replace waypoint list
   */
  setWaypoints(locations: [number, number][]): void {
    this.waypoints = locations.map((location, index) => ({
      location,
      name: `Waypoint ${index + 1}`,
    }));
  }

  /**
   * Update a waypoint in-place (used by draggable markers)
   */
  updateWaypoint(index: number, location: [number, number]): void {
    if (!this.waypoints[index]) {
      return;
    }
    this.waypoints[index].location = location;
  }

  private buildRoute(
    points: [number, number][],
    source: RouteSource,
    name?: string,
    durationOverrideSeconds?: number,
  ): Route {
    let totalDistance = 0;
    for (let i = 1; i < points.length; i++) {
      totalDistance += distanceMeters(points[i - 1], points[i]);
    }

    const estimatedDuration = durationOverrideSeconds ?? totalDistance / 1.4;
    const coordinates: [number, number][] = points.map(([lat, lng]) => [lng, lat]);

    return {
      id: Date.now().toString(),
      name: name ?? `${source === 'planned' ? 'Planned' : 'Recorded'} Route (${points.length} points)`,
      waypoints: points.map((location, index) => ({
        location,
        name: `Point ${index + 1}`,
      })),
      distance: totalDistance,
      duration: estimatedDuration,
      geometry: {
        type: 'LineString',
        coordinates,
      },
      source,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Calculate route using straight-line distance estimation
   */
  async calculateRoute(): Promise<Route | null> {
    if (this.waypoints.length < 2) {
      console.warn('Need at least 2 waypoints to calculate a route');
      return null;
    }

    try {
      const route = this.buildRoute(
        this.waypoints.map(wp => wp.location),
        'planned',
        `Planned Route (${this.waypoints.length} waypoints)`,
      );

      this.currentRoute = route;
      return route;

    } catch (error) {
      console.error('Error calculating route:', error);
      throw error;
    }
  }

  /**
   * Create a route from a recorded GPS track
   */
  createRouteFromTrack(track: [number, number][], name?: string, durationSeconds?: number): Route | null {
    if (track.length < 2) {
      return null;
    }

    const route = this.buildRoute(track, 'recorded', name, durationSeconds);
    this.currentRoute = route;
    return route;
  }

  /**
   * Compare planned and actual routes
   */
  compareRoutes(planned: Route, actual: Route): RouteComparison {
    const plannedPoints = planned.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
    const actualPoints = actual.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);

    let totalDeviation = 0;
    let maxDeviation = 0;

    for (const actualPoint of actualPoints) {
      let nearest = Number.POSITIVE_INFINITY;

      for (const plannedPoint of plannedPoints) {
        const d = distanceMeters(actualPoint, plannedPoint);
        if (d < nearest) {
          nearest = d;
        }
      }

      if (Number.isFinite(nearest)) {
        totalDeviation += nearest;
        if (nearest > maxDeviation) {
          maxDeviation = nearest;
        }
      }
    }

    const averageDeviation = actualPoints.length > 0 ? totalDeviation / actualPoints.length : 0;
    const distanceDelta = actual.distance - planned.distance;
    const distanceDeltaPercent = planned.distance > 0 ? (distanceDelta / planned.distance) * 100 : 0;

    return {
      plannedDistance: planned.distance,
      actualDistance: actual.distance,
      distanceDelta,
      distanceDeltaPercent,
      averageDeviation,
      maxDeviation,
    };
  }

  /**
   * Get current route
   */
  getCurrentRoute(): Route | null {
    return this.currentRoute;
  }

  /**
   * Convert distance to user's preferred units
   */
  convertDistance(distanceMeters: number, units: 'metric' | 'imperial'): number {
    if (units === 'metric') {
      return Math.round(distanceMeters / 1000 * 100) / 100; // kilometers
    } else {
      return Math.round(distanceMeters * 0.000621371 * 100) / 100; // miles
    }
  }

  /**
   * Convert duration to user's preferred units
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
   * Get formatted route info
   */
  getRouteInfo(units: 'metric' | 'imperial'): string | null {
    if (!this.currentRoute) {
      return null;
    }

    const distance = this.convertDistance(this.currentRoute.distance, units);
    const duration = this.convertDuration(this.currentRoute.duration);

    return `Distance: ${distance} ${units === 'metric' ? 'km' : 'mi'}\nDuration: ${duration}`;
  }

  /**
   * Clear current route and waypoints
   */
  clear(): void {
    this.currentRoute = null;
    this.waypoints = [];
  }
}
