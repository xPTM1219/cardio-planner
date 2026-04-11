export interface HomeLocation {
  lat: number;
  lng: number;
  zoom: number;
}

export interface UserSettings {
  name: string;
  units: 'metric' | 'imperial';
  fitnessLevel: 'casual' | 'moderate' | 'active';
  homeLocation: HomeLocation;
  darkMode: boolean;
}

export interface Waypoint {
  location: [number, number]; // [lat, lon]
  name?: string;
}

export type RouteSource = 'planned' | 'recorded';

export interface Route {
  id: string;
  name: string;
  waypoints: Waypoint[];
  distance: number; // in meters
  duration: number; // in seconds
  geometry: GeoJSONGeometry;
  source: RouteSource;
  createdAt: string;
}

export interface RouteComparison {
  plannedDistance: number;
  actualDistance: number;
  distanceDelta: number;
  distanceDeltaPercent: number;
  averageDeviation: number;
  maxDeviation: number;
}

export interface GeoJSONGeometry {
  type: 'LineString';
  coordinates: [number, number][]; // [lon, lat] arrays
}

export interface RouteResponse {
  code: string;
  routes: RouteData[];
  waypoints: WaypointResponse[];
}

export interface RouteData {
  distance: number;
  duration: number;
  geometry: GeoJSONGeometry;
}

export interface WaypointResponse {
  name?: string;
  location: [number, number];
}
