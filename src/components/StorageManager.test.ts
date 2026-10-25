import { beforeEach, describe, expect, it } from 'vitest';
import { StorageManager, getDefaultSettings, validateHomeLocation } from './StorageManager';
import type { UserSettings } from '../types';

describe('StorageManager', () => {
  let manager: StorageManager;

  beforeEach(() => {
    localStorage.clear();
    // Reset the singleton so each test starts with a clean cache
    (StorageManager as unknown as { instance: undefined }).instance = undefined;
    manager = StorageManager.getInstance();
  });

  it('round-trips settings through localStorage', async () => {
    const settings: UserSettings = {
      name: 'Tester',
      units: 'imperial',
      language: 'es',
      activityType: 'running',
      customSpeed: 11.5,
      customPace: 5.5,
      homeLocation: { lat: 40.7128, lng: -74.006, zoom: 14 },
      darkMode: true,
    };

    await manager.saveSettings(settings);

    const loaded = await manager.loadSettings();
    expect(loaded).toEqual(settings);
  });

  it('migrates legacy settings by dropping fitnessLevel and defaulting activityType', async () => {
    localStorage.setItem(
      'walk_planner_settings',
      JSON.stringify({
        name: '',
        units: 'metric',
        fitnessLevel: 'active', // legacy field
        homeLocation: { lat: -33.86, lng: 151.2, zoom: 15 },
        darkMode: false,
      })
    );

    const loaded = await manager.loadSettings();

    expect(loaded).not.toHaveProperty('fitnessLevel');
    expect(loaded.activityType).toBe('walking');
    expect(loaded.customSpeed).toBeUndefined();
    expect(loaded.customPace).toBeUndefined();
    expect(loaded.homeLocation.lat).toBe(-33.86);
  });

  it('drops invalid custom speed/pace values during normalization', async () => {
    localStorage.setItem(
      'walk_planner_settings',
      JSON.stringify({
        activityType: 'bicycling',
        customSpeed: -3,
        customPace: 'fast',
      })
    );

    const loaded = await manager.loadSettings();

    expect(loaded.activityType).toBe('bicycling');
    expect(loaded.customSpeed).toBeUndefined();
    expect(loaded.customPace).toBeUndefined();
  });

  it('keeps a valid stored language and falls back for invalid ones', async () => {
    localStorage.setItem(
      'walk_planner_settings',
      JSON.stringify({ language: 'es' })
    );
    expect((await manager.loadSettings()).language).toBe('es');

    localStorage.setItem(
      'walk_planner_settings',
      JSON.stringify({ language: 'klingon' })
    );
    // Invalid language falls back to browser detection ('en' in jsdom)
    expect((await manager.loadSettings()).language).toBe('en');
  });

  it('returns defaults when storage is empty and persists them', async () => {
    const loaded = await manager.loadSettings();

    expect(loaded).toEqual(getDefaultSettings());
    expect(JSON.parse(localStorage.getItem('walk_planner_settings') ?? '')).toEqual(getDefaultSettings());
  });

  it('keeps a valid stored home location (migration respected)', async () => {
    localStorage.setItem(
      'walk_planner_settings',
      JSON.stringify({
        name: '',
        units: 'metric',
        activityType: 'jogging',
        homeLocation: { lat: -33.86, lng: 151.2, zoom: 15 },
        darkMode: true,
      })
    );

    const loaded = await manager.loadSettings();

    expect(loaded.homeLocation).toEqual({ lat: -33.86, lng: 151.2, zoom: 15 });
    expect(loaded.activityType).toBe('jogging');
    expect(loaded.darkMode).toBe(true);
  });

  it('falls back per-field when homeLocation is partial', async () => {
    localStorage.setItem(
      'walk_planner_settings',
      JSON.stringify({ units: 'imperial', homeLocation: { lat: 10 } })
    );

    const loaded = await manager.loadSettings();
    const defaults = getDefaultSettings();

    expect(loaded.units).toBe('imperial');
    expect(loaded.homeLocation.lat).toBe(10);
    expect(loaded.homeLocation.lng).toBe(defaults.homeLocation.lng);
    expect(loaded.homeLocation.zoom).toBe(defaults.homeLocation.zoom);
  });

  it('rejects out-of-range values per field', async () => {
    localStorage.setItem(
      'walk_planner_settings',
      JSON.stringify({
        homeLocation: { lat: 999, lng: -5000, zoom: 42 },
      })
    );

    const loaded = await manager.loadSettings();

    expect(loaded.homeLocation).toEqual(getDefaultSettings().homeLocation);
  });

  it('rejects non-finite values', async () => {
    localStorage.setItem(
      'walk_planner_settings',
      JSON.stringify({ homeLocation: { lat: Number('NaN'), lng: null, zoom: '13' } })
    );

    const loaded = await manager.loadSettings();

    expect(loaded.homeLocation).toEqual(getDefaultSettings().homeLocation);
  });

  it('returns defaults on corrupt JSON without throwing', async () => {
    localStorage.setItem('walk_planner_settings', '{not valid json');

    const loaded = await manager.loadSettings();

    expect(loaded).toEqual(getDefaultSettings());
  });

  it('ignores non-object stored settings', async () => {
    localStorage.setItem('walk_planner_settings', '"just a string"');

    const loaded = await manager.loadSettings();

    expect(loaded).toEqual(getDefaultSettings());
  });

  describe('routes corruption guard', () => {
    it('treats non-array routes JSON as empty', async () => {
      localStorage.setItem('walk_planner_routes', '{"id": "r1"}');

      const routes = await manager.loadRoutes();

      expect(routes).toEqual([]);
    });
  });

  it('deleteRoute removes only the target route', async () => {
    const base = {
      name: 'Route',
      waypoints: [],
      distance: 1000,
      duration: 600,
      geometry: { type: 'LineString' as const, coordinates: [] },
      createdAt: new Date().toISOString(),
    };
    const keep1 = { ...base, id: 'r1' };
    const remove = { ...base, id: 'r2' };
    const keep2 = { ...base, id: 'r3' };
    localStorage.setItem('walk_planner_routes', JSON.stringify([keep1, remove, keep2]));

    await manager.deleteRoute('r2');

    const routes = await manager.loadRoutes();
    expect(routes.map((r) => r.id)).toEqual(['r1', 'r3']);
  });
  describe('updateSettings', () => {
    it('merges changes and keeps the other fields', async () => {
      await manager.saveSettings({ ...getDefaultSettings(), units: 'imperial', customSpeed: 9 });

      const updated = await manager.updateSettings({ activityType: 'running' });

      expect(updated.activityType).toBe('running');
      expect(updated.units).toBe('imperial');
      expect(updated.customSpeed).toBe(9);
    });

    it('clears an optional value given as undefined', async () => {
      await manager.saveSettings({ ...getDefaultSettings(), customSpeed: 9, customPace: 6 });

      const updated = await manager.updateSettings({ customSpeed: undefined });

      expect(updated.customSpeed).toBeUndefined();
      expect(updated.customPace).toBe(6);
    });

    it('normalizes invalid values', async () => {
      const updated = await manager.updateSettings({
        customPace: -1,
        homeLocation: { lat: 200, lng: 10, zoom: 3.5 },
      });

      expect(updated.customPace).toBeUndefined();
      expect(updated.homeLocation).toEqual({ lat: 45, lng: 10, zoom: 3 });
    });

    it('persists the result', async () => {
      await manager.updateSettings({ language: 'zh-TW', darkMode: true });

      const stored = JSON.parse(localStorage.getItem('walk_planner_settings') ?? '{}') as Record<string, unknown>;
      expect(stored.language).toBe('zh-TW');
      expect(stored.darkMode).toBe(true);
      expect(manager.getSettings().language).toBe('zh-TW');
    });
  });
});

describe('validateHomeLocation', () => {
  it('accepts valid values, including the limits', () => {
    expect(validateHomeLocation({ lat: 45, lng: -100, zoom: 3 })).toBeNull();
    expect(validateHomeLocation({ lat: -90, lng: 180, zoom: 19 })).toBeNull();
    expect(validateHomeLocation({ lat: 90, lng: -180, zoom: 1 })).toBeNull();
  });

  it('reports the first invalid field', () => {
    expect(validateHomeLocation({ lat: 91, lng: 0, zoom: 3 })).toBe('errorLatitudeRange');
    expect(validateHomeLocation({ lat: NaN, lng: 0, zoom: 3 })).toBe('errorLatitudeRange');
    expect(validateHomeLocation({ lat: 0, lng: -181, zoom: 3 })).toBe('errorLongitudeRange');
    expect(validateHomeLocation({ lat: 0, lng: 0, zoom: 0 })).toBe('errorZoomRange');
    expect(validateHomeLocation({ lat: 0, lng: 0, zoom: 20 })).toBe('errorZoomRange');
  });

  it('rejects a zoom that is not a whole number', () => {
    expect(validateHomeLocation({ lat: 0, lng: 0, zoom: 3.5 })).toBe('errorZoomRange');
  });
});
