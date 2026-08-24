import { ActivityType, HomeLocation, UserSettings, Route } from '../types';
import { detectBrowserLanguage, Language } from '../i18n';

const STORAGE_KEY_SETTINGS = 'walk_planner_settings';
const STORAGE_KEY_ROUTES = 'walk_planner_routes';

/** Default home view: North America zoomed out. Single source of truth. */
export const DEFAULT_HOME_LOCATION: HomeLocation = {
  lat: 45,
  lng: -100,
  zoom: 3,
};

export function getDefaultSettings(): UserSettings {
  return {
    name: '',
    units: 'metric',
    language: 'en',
    activityType: 'walking',
    homeLocation: DEFAULT_HOME_LOCATION,
    darkMode: false,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isActivityType(value: unknown): value is ActivityType {
  return value === 'walking' || value === 'jogging' || value === 'running' || value === 'bicycling';
}

function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'es' || value === 'zh-CN' || value === 'zh-TW';
}

function normalizeOptionalPositiveNumber(value: unknown): number | undefined {
  return isFiniteNumber(value) && value > 0 ? value : undefined;
}

function normalizeHomeLocation(value: unknown): HomeLocation {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Partial<HomeLocation>;
  return {
    lat: isFiniteNumber(raw.lat) && raw.lat >= -90 && raw.lat <= 90 ? raw.lat : DEFAULT_HOME_LOCATION.lat,
    lng: isFiniteNumber(raw.lng) && raw.lng >= -180 && raw.lng <= 180 ? raw.lng : DEFAULT_HOME_LOCATION.lng,
    zoom: isFiniteNumber(raw.zoom) && Number.isInteger(raw.zoom) && raw.zoom >= 1 && raw.zoom <= 19 ? raw.zoom : DEFAULT_HOME_LOCATION.zoom,
  };
}

function normalizeSettings(parsed: Partial<UserSettings> | null): UserSettings {
  if (!parsed || typeof parsed !== 'object') {
    // First visit: seed the language from the browser locale.
    return { ...getDefaultSettings(), language: detectBrowserLanguage() };
  }
  const defaults = getDefaultSettings();
  return {
    name: typeof parsed.name === 'string' ? parsed.name : defaults.name,
    units: parsed.units === 'imperial' || parsed.units === 'metric' ? parsed.units : defaults.units,
    // Unknown/missing languages fall back to the browser locale (then English).
    language: isLanguage(parsed.language) ? parsed.language : detectBrowserLanguage(),
    // Legacy `fitnessLevel` values are silently dropped by this normalization.
    activityType: isActivityType(parsed.activityType) ? parsed.activityType : defaults.activityType,
    customSpeed: normalizeOptionalPositiveNumber(parsed.customSpeed),
    customPace: normalizeOptionalPositiveNumber(parsed.customPace),
    homeLocation: normalizeHomeLocation(parsed.homeLocation),
    darkMode: typeof parsed.darkMode === 'boolean' ? parsed.darkMode : defaults.darkMode,
  };
}

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
   * Load user settings from localStorage.
   * Corrupt or partial data never throws: each field is validated and
   * falls back to its default independently.
   */
  async loadSettings(): Promise<UserSettings> {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY_SETTINGS);
    } catch (error) {
      console.warn('Could not read settings from storage:', error);
    }

    let parsed: Partial<UserSettings> | null = null;
    if (stored) {
      try {
        parsed = JSON.parse(stored) as Partial<UserSettings>;
      } catch (error) {
        console.warn('Stored settings are corrupt; using defaults:', error);
        parsed = null;
      }
    }

    this.settings = normalizeSettings(parsed);

    // Persist normalized settings to support migration from older schemas.
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(this.settings));
    } catch (error) {
      console.warn('Could not persist normalized settings:', error);
    }

    return this.settings;
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
    return this.settings ?? getDefaultSettings();
  }

  /**
   * Load saved routes from localStorage.
   * Corrupt data is treated as an empty list instead of throwing.
   */
  async loadRoutes(): Promise<Route[]> {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY_ROUTES);
    } catch (error) {
      console.warn('Could not read routes from storage:', error);
      return [];
    }

    if (!stored) {
      return [];
    }

    try {
      const parsed = JSON.parse(stored) as unknown;
      if (!Array.isArray(parsed)) {
        console.warn('Stored routes are corrupt (not an array); treating as empty.');
        return [];
      }
      return parsed as Route[];
    } catch (error) {
      console.warn('Stored routes are corrupt; treating as empty:', error);
      return [];
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
