import { UserSettings, Route } from '../types';

const STORAGE_KEY_SETTINGS = 'walk_planner_settings';
const STORAGE_KEY_ROUTES = 'walk_planner_routes';

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
      if (stored) {
        this.settings = JSON.parse(stored);
        return this.settings;
      }
      
      // Default settings if none exist
      const defaultSettings: UserSettings = {
        name: '',
        units: 'metric',
        fitnessLevel: 'moderate',
      };
      
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
    };
  }

  /**
   * Load saved routes from localStorage
   */
  async loadRoutes(): Promise<Route[]> {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_ROUTES);
      if (stored) {
        return JSON.parse(stored);
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
