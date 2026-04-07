import { Route, Waypoint, GeoJSONGeometry } from '../types';

const OSRM_API_URL = 'https://router.project-osrm.org/route/v2/driving';

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
   * Calculate route using OSRM API
   */
  async calculateRoute(): Promise<Route | null> {
    if (this.waypoints.length < 2) {
      console.warn('Need at least 2 waypoints to calculate a route');
      return null;
    }

    try {
      // Format waypoints for OSRM API
      const coords = this.waypoints.map(wp => `${wp.location[1]},${wp.location[0]}`).join(';');
      
      // Build API request URL
      const url = `${OSRM_API_URL}/${coords}?overview=full&geometries=geojson`;

      // Fetch route from OSRM
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`OSRM API error: ${response.status}`);
      }

      const data: { code: string; routes: Array<{ distance: number; duration: number; geometry: GeoJSONGeometry }> } = 
        await response.json();

      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        throw new Error('No route found');
      }

      const routeData = data.routes[0];

      // Create route object
      const route: Route = {
        id: Date.now().toString(),
        name: `Route ${this.waypoints.length}`,
        waypoints: this.waypoints,
        distance: routeData.distance,
        duration: routeData.duration,
        geometry: routeData.geometry,
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
