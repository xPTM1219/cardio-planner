import { HomeLocation, UserSettings, Route } from '../types';

const STORAGE_KEY_SETTINGS = 'walk_planner_settings';
const STORAGE_KEY_ROUTES = 'walk_planner_routes';
const DEFAULT_HOME_LOCATION: HomeLocation = {
  // Ceiba, Puerto Rico
  lat: 18.2644,
  lng: -65.648,
  zoom: 13,
};

export class StorageManager {
  private static instance: StorageManager;
  private settings: UserSettings | null = null;

  private constructor() {}

  public static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  /**
   * Load user settings from localStorage
   */
  async loadSettings(): Promise<UserSettings> {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_SETTINGS);
      const defaultSettings: UserSettings = {
        name: '',
        units: 'metric',
        fitnessLevel: 'moderate',
        homeLocation: DEFAULT_HOME_LOCATION,
        darkMode: false,
      };

      if (stored) {
        const parsed = JSON.parse(stored) as Partial<UserSettings>;
        this.settings = {
          ...defaultSettings,
          ...parsed,
          homeLocation: parsed.homeLocation ?? defaultSettings.homeLocation,
          darkMode: typeof parsed.darkMode === 'boolean' ? parsed.darkMode : defaultSettings.darkMode,
        };

        // Persist normalized settings to support migration from older schema
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(this.settings));
        return this.getSettings();
      }

      this.settings = defaultSettings;
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(defaultSettings));
      return defaultSettings;
    } catch (error) {
      console.error('Error loading settings:', error);
      throw new Error('Failed to load settings from storage');
    }
  }

  /**
   * Save user settings to localStorage
   */
  async saveSettings(settings: UserSettings): Promise<void> {
    try {
      this.settings = settings;
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving settings:', error);
      throw new Error('Failed to save settings to storage');
    }
  }

  /**
   * Get current settings with fallback to defaults
   */
  getSettings(): UserSettings {
    return this.settings ?? {
      name: '',
      units: 'metric',
      fitnessLevel: 'moderate',
      homeLocation: DEFAULT_HOME_LOCATION,
      darkMode: false,
    };
  }

  /**
   * Load saved routes from localStorage
   */
  async loadRoutes(): Promise<Route[]> {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_ROUTES);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<Route>[];
        const normalized: Route[] = parsed
          .filter((route): route is Partial<Route> & { id: string; name: string; geometry: Route['geometry'] } => {
            return Boolean(route?.id && route?.name && route?.geometry?.coordinates);
          })
          .map(route => {
            const waypoints = Array.isArray(route.waypoints)
              ? route.waypoints
              : (route.geometry.coordinates || []).map((coord, index) => ({
                  location: [coord[1], coord[0]] as [number, number],
                  name: `Point ${index + 1}`,
                }));

            return {
              id: route.id,
              name: route.name,
              waypoints,
              distance: route.distance ?? 0,
              duration: route.duration ?? 0,
              geometry: route.geometry,
              source: route.source ?? 'planned',
              createdAt: route.createdAt ?? new Date().toISOString(),
            };
          });

        localStorage.setItem(STORAGE_KEY_ROUTES, JSON.stringify(normalized));
        return normalized;
      }
      return [];
    } catch (error) {
      console.error('Error loading routes:', error);
      throw new Error('Failed to load routes from storage');
    }
  }

  /**
   * Save a route to localStorage
   */
  async saveRoute(route: Route): Promise<void> {
    try {
      const routes = await this.loadRoutes();
      routes.push(route);
      localStorage.setItem(STORAGE_KEY_ROUTES, JSON.stringify(routes));
    } catch (error) {
      console.error('Error saving route:', error);
      throw new Error('Failed to save route to storage');
    }
  }

  /**
   * Delete a route from localStorage
   */
  async deleteRoute(routeId: string): Promise<void> {
    try {
      const routes = await this.loadRoutes();
      const filteredRoutes = routes.filter(r => r.id !== routeId);
      localStorage.setItem(STORAGE_KEY_ROUTES, JSON.stringify(filteredRoutes));
    } catch (error) {
      console.error('Error deleting route:', error);
      throw new Error('Failed to delete route from storage');
    }
  }

  /**
   * Clear all saved routes
   */
  async clearRoutes(): Promise<void> {
    try {
      localStorage.removeItem(STORAGE_KEY_ROUTES);
    } catch (error) {
      console.error('Error clearing routes:', error);
      throw new Error('Failed to clear routes from storage');
    }
  }

  /**
   * Check if storage is available
   */
  async checkStorage(): Promise<boolean> {
    try {
      const testKey = '__storage_test__';
      localStorage.setItem(testKey, testKey);
      localStorage.removeItem(testKey);
      return true;
    } catch (error) {
      console.error('Storage not available:', error);
      return false;
    }
  }
}

export type { UserSettings };
