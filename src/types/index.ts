import type { Language } from '../i18n';

/** A home map view: center coordinates plus zoom level. */
export interface HomeLocation {
  /** Latitude in decimal degrees, range -90 to 90. */
  lat: number;
  /** Longitude in decimal degrees, range -180 to 180. */
  lng: number;
  /** Map zoom level, integer 1 (world) to 19 (street). */
  zoom: number;
}

/** Supported activity kinds used for default speed estimates. */
export type ActivityType = 'walking' | 'jogging' | 'running' | 'bicycling';

/** User preferences persisted in localStorage under `walk_planner_settings`. */
export interface UserSettings {
  /** Display name of the user (currently informational only). */
  name: string;
  /** Unit system for distances and speeds shown in the UI. */
  units: 'metric' | 'imperial';
  /** UI language. */
  language: Language;
  /**
   * Preferred activity; determines the default speed used for time estimates
   * when no custom speed/pace is set.
   */
  activityType: ActivityType;
  /** Optional speed override, canonical unit km/h. `undefined` means unset. */
  customSpeed?: number;
  /**
   * Optional pace override, canonical unit minutes per km.
   * Takes precedence over `customSpeed` and `activityType` when set.
   * `undefined` means unset.
   */
  customPace?: number;
  /** View the map centers on after loading. */
  homeLocation: HomeLocation;
  /** Whether the dark color theme is active. */
  darkMode: boolean;
}

/** A stop along a planned route. */
export interface Waypoint {
  /** `[lat, lon]` coordinate of the waypoint. */
  location: [number, number];
  /** Optional display name for the waypoint. */
  name?: string;
}

/** A planned route, as calculated locally and persisted to localStorage. */
export interface Route {
  /** Unique id (creation timestamp in ms as a string). */
  id: string;
  /** Display name chosen by the user at save time. */
  name: string;
  /** Ordered stops making up the route. */
  waypoints: Waypoint[];
  /** Total straight-line distance across segments, in meters. */
  distance: number;
  /** Estimated travel time based on the effective speed, in seconds. */
  duration: number;
  /** Straight-line geometry joining all waypoints. */
  geometry: GeoJSONGeometry;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}

/** GeoJSON LineString geometry with `[lon, lat]` coordinates. */
export interface GeoJSONGeometry {
  type: 'LineString';
  coordinates: [number, number][];
}
