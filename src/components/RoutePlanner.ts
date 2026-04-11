import { Route, Waypoint } from '../types';

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
   * Calculate route using straight-line distance estimation
   */
  async calculateRoute(): Promise<Route | null> {
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

      // Estimate duration assuming walking speed of 1.4 m/s (5 km/h)
      const estimatedDuration = totalDistance / 1.4;

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
