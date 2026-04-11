import { MapComponent } from './components/MapComponent';
import { RoutePlanner } from './components/RoutePlanner';
import { StorageManager, UserSettings } from './components/StorageManager';
import { Route } from './types';

// DOM elements
const app = document.getElementById('app');
if (!app) {
  throw new Error('App container not found');
}
const appRoot = app;

// Initialize components
const mapComponent = MapComponent.getInstance();
const routePlanner = RoutePlanner.getInstance();
const storageManager = StorageManager.getInstance();

let savedRoutes: Route[] = [];
let activePlannedRoute: Route | null = null;
let activeActualRoute: Route | null = null;
let geolocationWatchId: number | null = null;
let recordingStartedAt: number | null = null;
let recordedTrack: [number, number][] = [];

function showLoading(): void {
  const loading = document.createElement('div');
  loading.className = 'loading-overlay';
  loading.innerHTML = '<h2>Loading Walk Planner...</h2>';
  appRoot.appendChild(loading);
}

function hideLoading(): void {
  const loading = document.querySelector('.loading-overlay') as HTMLElement;
  if (loading) {
    loading.classList.add('hidden');
  }
}

function applyTheme(darkMode: boolean): void {
  document.body.classList.toggle('dark-mode', darkMode);
}

function formatDistanceMeters(distanceMeters: number, units: 'metric' | 'imperial'): string {
  const converted = routePlanner.convertDistance(distanceMeters, units);
  return `${converted} ${units === 'metric' ? 'km' : 'mi'}`;
}

const controlsHTML = `
  <div class="control-panel">
    <h2>Route Planner</h2>
    
    <div class="form-group">
      <label for="start-point">Start Point (Click on map)</label>
      <input type="text" id="start-point" placeholder="Will be auto-filled" readonly />
    </div>
    
    <div class="form-group">
      <label for="end-point">End Point (Click on map)</label>
      <input type="text" id="end-point" placeholder="Will be auto-filled" readonly />
    </div>
    
    <button class="btn" id="calculate-btn">Calculate Route</button>
    <button class="btn btn-secondary" id="clear-btn">Clear All</button>

    <div class="form-group" style="margin-top: 1rem;">
      <label for="saved-routes">Saved Routes</label>
      <select id="saved-routes">
        <option value="">Select a saved route...</option>
      </select>
    </div>

    <button class="btn btn-secondary" id="load-route-btn">Load as Planned Route</button>
    
    <div class="form-group" style="margin-top: 1rem;">
      <label for="route-name">Route Name</label>
      <input type="text" id="route-name" placeholder="Enter route name..." />
    </div>
    
    <button class="btn btn-secondary" id="save-route-btn">Save Route</button>

    <hr style="margin: 1rem 0;" />
    <button class="btn" id="start-route-btn">Start Route</button>
    <button class="btn btn-secondary" id="stop-route-btn" disabled>Stop Route</button>
  </div>
`;

const routeInfoHTML = `
  <div class="route-info">
    <h3>Route Information</h3>
    <p id="route-status" style="color: #666;">Click on the map to add waypoints...</p>
    <div id="route-comparison" class="route-comparison" style="display: none;"></div>
  </div>
`;

const settingsHTML = `
  <div class="settings-panel">
    <h3>Settings</h3>
    
    <div class="form-group">
      <label for="units">Units</label>
      <select id="units">
        <option value="metric">Metric (km)</option>
        <option value="imperial">Imperial (mi)</option>
      </select>
    </div>
    
    <div class="form-group">
      <label for="fitness-level">Fitness Level</label>
      <select id="fitness-level">
        <option value="casual">Casual</option>
        <option value="moderate" selected>Moderate</option>
        <option value="active">Active</option>
      </select>
    </div>

    <div class="form-group">
      <label for="dark-mode-toggle">Dark Mode</label>
      <input type="checkbox" id="dark-mode-toggle" />
    </div>

    <div class="form-group">
      <label for="home-lat">Home Location Latitude</label>
      <input type="number" id="home-lat" placeholder="18.2644" step="0.0001" />
    </div>

    <div class="form-group">
      <label for="home-lng">Home Location Longitude</label>
      <input type="number" id="home-lng" placeholder="-65.6480" step="0.0001" />
    </div>

    <div class="form-group">
      <label for="home-zoom">Home Zoom</label>
      <input type="number" id="home-zoom" placeholder="13" min="1" max="19" step="1" />
    </div>

    <button class="btn btn-secondary" id="use-current-view-btn">Use Current Map View</button>
    
    <button class="btn btn-secondary" id="save-settings-btn">Save Settings</button>
  </div>
`;

function updateSavedRoutesDropdown(): void {
  const savedRoutesSelect = document.getElementById('saved-routes') as HTMLSelectElement | null;
  if (!savedRoutesSelect) {
    return;
  }

  const selectedValue = savedRoutesSelect.value;
  savedRoutesSelect.innerHTML = '<option value="">Select a saved route...</option>';

  savedRoutes.forEach(route => {
    const option = document.createElement('option');
    option.value = route.id;
    option.textContent = `${route.name} (${route.source})`;
    savedRoutesSelect.appendChild(option);
  });

  if (selectedValue && savedRoutes.some(route => route.id === selectedValue)) {
    savedRoutesSelect.value = selectedValue;
  }
}

async function refreshSavedRoutes(): Promise<void> {
  savedRoutes = await storageManager.loadRoutes();
  updateSavedRoutesDropdown();
}

function renderComparison(units: 'metric' | 'imperial'): void {
  const comparisonEl = document.getElementById('route-comparison') as HTMLDivElement | null;
  if (!comparisonEl) {
    return;
  }

  if (!activePlannedRoute || !activeActualRoute) {
    comparisonEl.style.display = 'none';
    comparisonEl.innerHTML = '';
    return;
  }

  const comparison = routePlanner.compareRoutes(activePlannedRoute, activeActualRoute);
  comparisonEl.style.display = 'block';
  comparisonEl.innerHTML = `
    <h4>Planned vs Actual</h4>
    <p>Planned distance: ${formatDistanceMeters(comparison.plannedDistance, units)}</p>
    <p>Actual distance: ${formatDistanceMeters(comparison.actualDistance, units)}</p>
    <p>Distance delta: ${formatDistanceMeters(Math.abs(comparison.distanceDelta), units)} (${comparison.distanceDeltaPercent.toFixed(1)}%)</p>
    <p>Avg deviation: ${Math.round(comparison.averageDeviation)} m</p>
    <p>Max deviation: ${Math.round(comparison.maxDeviation)} m</p>
  `;
}

async function initUI(): Promise<void> {
  const mapContainer = document.getElementById('map');
  const controlsContainer = document.getElementById('controls');
  const routeInfoContainer = document.getElementById('route-info');
  const settingsContainer = document.getElementById('settings');
  if (!mapContainer) {
    throw new Error('Map container not found');
  }
  if (!controlsContainer || !routeInfoContainer || !settingsContainer) {
    throw new Error('UI containers not found');
  }

  showLoading();
  setTimeout(hideLoading, 500);

  controlsContainer.innerHTML = controlsHTML;
  routeInfoContainer.innerHTML = routeInfoHTML;
  settingsContainer.innerHTML = settingsHTML;

  await mapComponent.init('map');

  const savedSettings = await storageManager.loadSettings();
  await refreshSavedRoutes();

  mapComponent.updateSettings({
    units: savedSettings.units,
    fitnessLevel: savedSettings.fitnessLevel,
  });
  mapComponent.setHomeView(savedSettings.homeLocation);

  const unitsSelect = document.getElementById('units') as HTMLSelectElement | null;
  const fitnessLevelSelect = document.getElementById('fitness-level') as HTMLSelectElement | null;
  const darkModeToggle = document.getElementById('dark-mode-toggle') as HTMLInputElement | null;
  const homeLatInput = document.getElementById('home-lat') as HTMLInputElement | null;
  const homeLngInput = document.getElementById('home-lng') as HTMLInputElement | null;
  const homeZoomInput = document.getElementById('home-zoom') as HTMLInputElement | null;

  if (unitsSelect) unitsSelect.value = savedSettings.units;
  if (fitnessLevelSelect) fitnessLevelSelect.value = savedSettings.fitnessLevel;
  if (darkModeToggle) darkModeToggle.checked = savedSettings.darkMode;
  if (homeLatInput) homeLatInput.value = String(savedSettings.homeLocation.lat);
  if (homeLngInput) homeLngInput.value = String(savedSettings.homeLocation.lng);
  if (homeZoomInput) homeZoomInput.value = String(savedSettings.homeLocation.zoom);

  applyTheme(savedSettings.darkMode);
  setupEventListeners();
}

function setupEventListeners(): void {
  const calculateBtn = document.getElementById('calculate-btn') as HTMLButtonElement;
  const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
  const saveRouteBtn = document.getElementById('save-route-btn') as HTMLButtonElement;
  const loadRouteBtn = document.getElementById('load-route-btn') as HTMLButtonElement;
  const savedRoutesSelect = document.getElementById('saved-routes') as HTMLSelectElement;
  const startRouteBtn = document.getElementById('start-route-btn') as HTMLButtonElement;
  const stopRouteBtn = document.getElementById('stop-route-btn') as HTMLButtonElement;
  const unitsSelect = document.getElementById('units') as HTMLSelectElement;
  const fitnessLevelSelect = document.getElementById('fitness-level') as HTMLSelectElement;
  const darkModeToggle = document.getElementById('dark-mode-toggle') as HTMLInputElement;
  const homeLatInput = document.getElementById('home-lat') as HTMLInputElement;
  const homeLngInput = document.getElementById('home-lng') as HTMLInputElement;
  const homeZoomInput = document.getElementById('home-zoom') as HTMLInputElement;
  const useCurrentViewBtn = document.getElementById('use-current-view-btn') as HTMLButtonElement;
  const saveSettingsBtn = document.getElementById('save-settings-btn') as HTMLButtonElement;

  mapComponent.setWaypointMovedCallback(async (index, location) => {
    routePlanner.updateWaypoint(index, location);

    const route = await routePlanner.calculateRoute();
    if (route) {
      activePlannedRoute = route;
      mapComponent.renderRoute(route, 'planned');
      renderComparison((unitsSelect?.value as 'metric' | 'imperial') || 'metric');
    }
  });

  const map = mapComponent.getMap();
  if (map) {
    map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
      const latlng = e.latlng;

      const startPointEl = document.getElementById('start-point') as HTMLInputElement;
      const endPointEl = document.getElementById('end-point') as HTMLInputElement;

      startPointEl.value = `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
      endPointEl.value = `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;

      routePlanner.addWaypoint([latlng.lat, latlng.lng]);
      mapComponent.addWaypointMarker([latlng.lat, latlng.lng]);

      const waypoints = routePlanner.getWaypoints();
      const statusEl = document.getElementById('route-status');
      if (statusEl) {
        statusEl.textContent = `Added ${waypoints.length} waypoint(s). Click again to add more. Then click "Calculate Route".`;
      }
    });
  }

  calculateBtn?.addEventListener('click', async () => {
    try {
      const route = await routePlanner.calculateRoute();

      if (route) {
        activePlannedRoute = route;
        mapComponent.renderRoute(route, 'planned');

        const statusEl = document.getElementById('route-status');
        if (statusEl) {
          const units = unitsSelect?.value as 'metric' | 'imperial';
          const info = routePlanner.getRouteInfo(units);
          statusEl.textContent = info || 'No route information available.';
        }

        renderComparison((unitsSelect?.value as 'metric' | 'imperial') || 'metric');
      }
    } catch (error) {
      console.error('Error calculating route:', error);

      const statusEl = document.getElementById('route-status');
      if (statusEl) {
        statusEl.textContent = 'Error: Could not calculate route. Please try again.';
      }
    }
  });

  clearBtn?.addEventListener('click', () => {
    routePlanner.clear();
    activePlannedRoute = null;
    activeActualRoute = null;
    mapComponent.clearRoute();
    mapComponent.clearWaypointMarkers();

    if (geolocationWatchId !== null) {
      navigator.geolocation.clearWatch(geolocationWatchId);
      geolocationWatchId = null;
    }
    recordedTrack = [];
    recordingStartedAt = null;
    startRouteBtn.disabled = false;
    stopRouteBtn.disabled = true;

    const statusEl = document.getElementById('route-status');
    if (statusEl) {
      statusEl.textContent = 'Map cleared. Click on the map to add waypoints...';
    }

    const startPointEl = document.getElementById('start-point') as HTMLInputElement;
    const endPointEl = document.getElementById('end-point') as HTMLInputElement;
    startPointEl.value = '';
    endPointEl.value = '';

    renderComparison((unitsSelect?.value as 'metric' | 'imperial') || 'metric');
  });

  saveRouteBtn?.addEventListener('click', async () => {
    const routeNameInput = document.getElementById('route-name') as HTMLInputElement;
    const routeName = routeNameInput.value || `Route ${Date.now()}`;

    try {
      const currentRoute = routePlanner.getCurrentRoute();

      if (currentRoute) {
        currentRoute.name = routeName;
        await storageManager.saveRoute(currentRoute);
        await refreshSavedRoutes();

        routeNameInput.value = '';

        const statusEl = document.getElementById('route-status');
        if (statusEl) {
          statusEl.textContent = `Route "${routeName}" saved successfully!`;
        }
      }
    } catch (error) {
      console.error('Error saving route:', error);

      const statusEl = document.getElementById('route-status');
      if (statusEl) {
        statusEl.textContent = 'Error: Could not save route.';
      }
    }
  });

  loadRouteBtn?.addEventListener('click', () => {
    const selectedId = savedRoutesSelect?.value;
    if (!selectedId) {
      return;
    }

    const selectedRoute = savedRoutes.find(route => route.id === selectedId);
    if (!selectedRoute) {
      return;
    }

    const waypointLocations = selectedRoute.waypoints.map(wp => wp.location);
    routePlanner.setWaypoints(waypointLocations);
    mapComponent.updateWaypoints(waypointLocations);
    mapComponent.renderRoute(selectedRoute, 'planned');
    activePlannedRoute = selectedRoute;

    const statusEl = document.getElementById('route-status');
    if (statusEl) {
      statusEl.textContent = `Loaded "${selectedRoute.name}" with ${waypointLocations.length} points.`;
    }

    renderComparison((unitsSelect?.value as 'metric' | 'imperial') || 'metric');
  });

  startRouteBtn?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      const statusEl = document.getElementById('route-status');
      if (statusEl) {
        statusEl.textContent = 'Geolocation is not available in this browser.';
      }
      return;
    }

    recordedTrack = [];
    recordingStartedAt = Date.now();
    mapComponent.clearActualRoute();

    geolocationWatchId = navigator.geolocation.watchPosition(
      position => {
        const point: [number, number] = [position.coords.latitude, position.coords.longitude];
        recordedTrack.push(point);

        const liveRoute = routePlanner.createRouteFromTrack(recordedTrack, 'Recording in progress...');
        if (liveRoute) {
          activeActualRoute = liveRoute;
          mapComponent.renderRoute(liveRoute, 'actual');
        }

        const statusEl = document.getElementById('route-status');
        if (statusEl) {
          statusEl.textContent = `Recording route... ${recordedTrack.length} point(s) captured.`;
        }

        renderComparison((unitsSelect?.value as 'metric' | 'imperial') || 'metric');
      },
      error => {
        const statusEl = document.getElementById('route-status');
        if (statusEl) {
          statusEl.textContent = `Location error: ${error.message}`;
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000,
      },
    );

    startRouteBtn.disabled = true;
    stopRouteBtn.disabled = false;
  });

  stopRouteBtn?.addEventListener('click', async () => {
    if (geolocationWatchId !== null) {
      navigator.geolocation.clearWatch(geolocationWatchId);
      geolocationWatchId = null;
    }

    startRouteBtn.disabled = false;
    stopRouteBtn.disabled = true;

    const durationSeconds = recordingStartedAt ? (Date.now() - recordingStartedAt) / 1000 : undefined;
    recordingStartedAt = null;

    const statusEl = document.getElementById('route-status');
    const recordedRoute = routePlanner.createRouteFromTrack(
      recordedTrack,
      `Recorded Route ${new Date().toLocaleString()}`,
      durationSeconds,
    );

    if (!recordedRoute) {
      if (statusEl) {
        statusEl.textContent = 'Recording stopped. Not enough points were captured to form a route.';
      }
      return;
    }

    activeActualRoute = recordedRoute;
    mapComponent.renderRoute(recordedRoute, 'actual');

    try {
      await storageManager.saveRoute(recordedRoute);
      await refreshSavedRoutes();
      if (statusEl) {
        statusEl.textContent = `Recorded route saved: "${recordedRoute.name}".`;
      }
    } catch (error) {
      console.error('Error saving recorded route:', error);
      if (statusEl) {
        statusEl.textContent = 'Recorded route captured but failed to save.';
      }
    }

    renderComparison((unitsSelect?.value as 'metric' | 'imperial') || 'metric');
  });

  unitsSelect?.addEventListener('change', (e: Event) => {
    const units = (e.target as HTMLSelectElement).value as 'metric' | 'imperial';
    mapComponent.updateSettings({ units });

    const currentRoute = routePlanner.getCurrentRoute();
    if (currentRoute) {
      const statusEl = document.getElementById('route-status');
      if (statusEl) {
        const info = routePlanner.getRouteInfo(units);
        statusEl.textContent = info || 'No route information available.';
      }
    }

    renderComparison(units);
  });

  fitnessLevelSelect?.addEventListener('change', (e: Event) => {
    const fitnessLevel = (e.target as HTMLSelectElement).value as 'casual' | 'moderate' | 'active';
    mapComponent.updateSettings({ fitnessLevel });
    saveSettingsBtn?.click();
  });

  darkModeToggle?.addEventListener('change', (e: Event) => {
    const darkMode = (e.target as HTMLInputElement).checked;
    applyTheme(darkMode);
    saveSettingsBtn?.click();
  });

  useCurrentViewBtn?.addEventListener('click', () => {
    const map = mapComponent.getMap();
    if (!map) {
      return;
    }

    const center = map.getCenter();
    homeLatInput.value = center.lat.toFixed(6);
    homeLngInput.value = center.lng.toFixed(6);
    homeZoomInput.value = String(map.getZoom());

    const statusEl = document.getElementById('route-status');
    if (statusEl) {
      statusEl.textContent = 'Captured current map view. Click "Save Settings" to persist.';
    }
  });

  saveSettingsBtn?.addEventListener('click', async () => {
    try {
      const units = unitsSelect?.value as 'metric' | 'imperial';
      const fitnessLevel = fitnessLevelSelect?.value as 'casual' | 'moderate' | 'active';
      const darkMode = Boolean(darkModeToggle?.checked);
      const lat = Number(homeLatInput?.value);
      const lng = Number(homeLngInput?.value);
      const zoom = Number(homeZoomInput?.value);

      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        throw new Error('Latitude must be a number between -90 and 90.');
      }
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        throw new Error('Longitude must be a number between -180 and 180.');
      }
      if (!Number.isFinite(zoom) || zoom < 1 || zoom > 19) {
        throw new Error('Zoom must be a number between 1 and 19.');
      }

      const currentSettings = storageManager.getSettings();
      const newSettings: UserSettings = {
        name: currentSettings.name,
        units,
        fitnessLevel,
        darkMode,
        homeLocation: {
          lat,
          lng,
          zoom,
        },
      };

      await storageManager.saveSettings(newSettings);
      mapComponent.updateSettings({ units, fitnessLevel });
      mapComponent.setHomeView(newSettings.homeLocation);
      applyTheme(darkMode);

      const statusEl = document.getElementById('route-status');
      if (statusEl) {
        statusEl.textContent = 'Settings saved successfully!';
      }
    } catch (error) {
      console.error('Error saving settings:', error);

      const statusEl = document.getElementById('route-status');
      if (statusEl) {
        statusEl.textContent = 'Error: Could not save settings.';
      }
    }
  });
}

initUI().catch(error => {
  console.error('Failed to initialize app:', error);
});
