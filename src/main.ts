import { GeocodingService } from './components/GeocodingService';
import { MapComponent } from './components/MapComponent';
import { RoutePlanner } from './components/RoutePlanner';
import { StorageManager, DEFAULT_HOME_LOCATION, UserSettings } from './components/StorageManager';
import {
  Units,
  formatSpeedBasis,
  minPerMiToMinPerKm,
  mphToKmh,
  resolveSpeed,
} from './utils/speeds';
import { Language, getLanguage, setLanguage, t } from './i18n';

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
const geocodingService = GeocodingService.getInstance();

// Show loading overlay
function showLoading(): void {
  const loading = document.createElement('div');
  loading.className = 'loading-overlay';
  loading.innerHTML = `<h2>${t('appLoading')}</h2>`;
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

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function setStatus(message: string): void {
  const statusEl = document.getElementById('route-status');
  if (statusEl) {
    statusEl.textContent = message;
  }
}

async function refreshSavedRoutesDropdown(): Promise<void> {
  const select = document.getElementById('saved-routes') as HTMLSelectElement | null;
  if (!select) {
    return;
  }

  let routes;
  try {
    routes = await storageManager.loadRoutes();
  } catch (error) {
    console.error('Error loading saved routes:', error);
    select.innerHTML = '<option value="">No saved routes</option>';
    select.disabled = true;
    return;
  }

  if (routes.length === 0) {
    select.innerHTML = '<option value="">No saved routes</option>';
    select.disabled = true;
    return;
  }

  select.disabled = false;
  const units = storageManager.getSettings().units;
  select.innerHTML = routes
    .map((route) => {
      const distance = routePlanner.convertDistance(route.distance, units);
      const unitLabel = units === 'metric' ? 'km' : 'mi';
      const date = new Date(route.createdAt).toLocaleDateString();
      return `<option value="${escapeHtml(route.id)}">${escapeHtml(route.name)} — ${distance} ${unitLabel} (${date})</option>`;
    })
    .join('');
}

function getCurrentUnits(): Units {
  const select = document.getElementById('units') as HTMLSelectElement | null;
  return (select?.value as Units | undefined) ?? storageManager.getSettings().units;
}

/**
 * Recalculate the current route with the effective speed from settings,
 * re-render it on the map, and update the status text.
 */
async function recalculateRoute(): Promise<void> {
  try {
    const resolved = resolveSpeed(storageManager.getSettings());
    const units = getCurrentUnits();
    const route = await routePlanner.calculateRoute(resolved.speedMps);

    if (!route) {
      setStatus(t('statusNeedTwoWaypoints'));
      return;
    }

    mapComponent.renderRoute(route, { basisText: formatSpeedBasis(resolved, units) });
    const info = routePlanner.getRouteInfo(units, resolved);
    setStatus(info || t('statusNoRouteInfo'));
  } catch (error) {
    console.error('Error calculating route:', error);
    setStatus(t('statusCalculateError'));
  }
}

/**
 * Run the address search and fly the map to the first result.
 * Never modifies waypoints, route, or storage.
 */
async function performAddressSearch(): Promise<void> {
  const input = document.getElementById('address-search') as HTMLInputElement | null;
  const query = input?.value.trim() ?? '';

  if (!query) {
    setStatus(t('statusSearchEmptyQuery'));
    return;
  }

  setStatus(t('statusSearching', { query }));

  try {
    const results = await geocodingService.search(query);

    if (results.length === 0) {
      setStatus(t('statusNoResults', { query }));
      return;
    }

    const first = results[0];
    mapComponent.flyToLocation([first.lat, first.lon], 16);
    setStatus(t('statusFound', { name: first.displayName }));
  } catch (error) {
    console.error('Address search failed:', error);
    setStatus(t('statusSearchError'));
  }
}

async function loadSelectedRoute(): Promise<void> {
  const select = document.getElementById('saved-routes') as HTMLSelectElement | null;
  const id = select?.value;
  if (!id) {
    return;
  }

  try {
    const routes = await storageManager.loadRoutes();
    const route = routes.find((r) => r.id === id);
    if (!route || !Array.isArray(route.waypoints)) {
      setStatus(t('statusLoadRouteMissing'));
      return;
    }

    const locations = route.waypoints.map((wp) => wp.location);
    const units = getCurrentUnits();

    // Replace planner state and re-render map visuals. updateWaypoints fires a
    // change notification that clears stale route layers; render afterwards.
    routePlanner.setWaypoints(locations);
    mapComponent.updateWaypoints(locations);
    mapComponent.renderRoute(route, {
      basisText: formatSpeedBasis(resolveSpeed(storageManager.getSettings()), units),
    });
    mapComponent.fitBounds(locations);

    const startPointEl = document.getElementById('start-point') as HTMLInputElement | null;
    const endPointEl = document.getElementById('end-point') as HTMLInputElement | null;
    const first = locations[0];
    const last = locations[locations.length - 1];
    if (startPointEl && first) {
      startPointEl.value = `${first[0].toFixed(4)}, ${first[1].toFixed(4)}`;
    }
    if (endPointEl && last) {
      endPointEl.value = `${last[0].toFixed(4)}, ${last[1].toFixed(4)}`;
    }

    const info = routePlanner.getRouteInfo(units, resolveSpeed(storageManager.getSettings()));
    setStatus(`${t('statusRouteLoaded', { name: route.name })}${info ? '\n' + info : ''}`);
  } catch (error) {
    console.error('Error loading route:', error);
    setStatus(t('statusLoadRouteError'));
  }
}

// Create control panel HTML
function controlsHTML(): string {
  return `
  <div class="control-panel">
    <h2>${t('routePlannerTitle')}</h2>

    <div class="form-group">
      <label for="address-search">${t('addressSearchLabel')}</label>
      <div style="display: flex; gap: 0.5rem;">
        <input type="text" id="address-search" placeholder="${t('addressSearchPlaceholder')}" style="flex: 1;" />
        <button class="btn" id="search-btn">${t('addressSearchButton')}</button>
      </div>
    </div>

    <div class="form-group">
      <label for="start-point">${t('startPointLabel')}</label>
      <input type="text" id="start-point" placeholder="${t('waypointAutoPlaceholder')}" readonly />
    </div>

    <div class="form-group">
      <label for="end-point">${t('endPointLabel')}</label>
      <input type="text" id="end-point" placeholder="${t('waypointAutoPlaceholder')}" readonly />
    </div>

    <button class="btn" id="calculate-btn">${t('calculateRouteButton')}</button>
    <button class="btn btn-secondary" id="clear-btn">${t('clearAllButton')}</button>

    <div class="form-group" style="margin-top: 1rem;">
      <label for="route-name">${t('routeNameLabel')}</label>
      <input type="text" id="route-name" placeholder="${t('routeNamePlaceholder')}" />
    </div>

    <button class="btn btn-secondary" id="save-route-btn">${t('saveRouteButton')}</button>

    <div class="form-group" style="margin-top: 1rem;">
      <label for="saved-routes">${t('savedRoutesLabel')}</label>
      <select id="saved-routes"></select>
    </div>

    <button class="btn btn-secondary" id="load-route-btn">${t('loadRouteButton')}</button>
    <button class="btn btn-secondary" id="delete-route-btn">${t('deleteRouteButton')}</button>
  </div>
`;
}

// Create route info panel HTML
function routeInfoHTML(): string {
  return `
  <div class="route-info">
    <h3>${t('routeInformationTitle')}</h3>
    <p id="route-status" style="color: #666;">${t('statusInitial')}</p>
  </div>
`;
}

// Create settings panel HTML
function settingsHTML(): string {
  return `
  <div class="settings-panel">
    <h3>${t('settingsTitle')}</h3>

    <div class="form-group">
      <label for="units">${t('unitsLabel')}</label>
      <select id="units">
        <option value="metric">${t('unitsMetric')}</option>
        <option value="imperial">${t('unitsImperial')}</option>
      </select>
    </div>

    <div class="form-group">
      <label for="language-select">${t('languageLabel')}</label>
      <select id="language-select">
        <option value="en">English</option>
        <option value="es">Español</option>
        <option value="zh-CN">简体中文</option>
        <option value="zh-TW">繁體中文</option>
      </select>
    </div>

    <div class="form-group">
      <label for="activity-type">${t('activityTypeLabel')}</label>
      <select id="activity-type">
        <option value="walking">${t('activityWalking')}</option>
        <option value="jogging">${t('activityJogging')}</option>
        <option value="running">${t('activityRunning')}</option>
        <option value="bicycling">${t('activityBicycling')}</option>
      </select>
    </div>

    <div class="form-group">
      <label for="custom-speed">${t('customSpeedLabel')}</label>
      <input type="number" id="custom-speed" placeholder="${t('customSpeedPlaceholder')}" step="0.1" min="0" />
    </div>

    <div class="form-group">
      <label for="custom-pace">${t('customPaceLabel')}</label>
      <input type="number" id="custom-pace" placeholder="${t('customPacePlaceholder')}" step="0.01" min="0" />
    </div>

    <div class="form-group">
      <label for="dark-mode-toggle">${t('darkModeLabel')}</label>
      <input type="checkbox" id="dark-mode-toggle" />
    </div>

    <div class="form-group">
      <label for="home-lat">${t('homeLatLabel')}</label>
      <input type="number" id="home-lat" placeholder="${DEFAULT_HOME_LOCATION.lat}" step="0.0001" />
    </div>

    <div class="form-group">
      <label for="home-lng">${t('homeLngLabel')}</label>
      <input type="number" id="home-lng" placeholder="${DEFAULT_HOME_LOCATION.lng}" step="0.0001" />
    </div>

    <div class="form-group">
      <label for="home-zoom">${t('homeZoomLabel')}</label>
      <input type="number" id="home-zoom" placeholder="${DEFAULT_HOME_LOCATION.zoom}" min="1" max="19" step="1" />
    </div>

    <button class="btn btn-secondary" id="use-current-view-btn">${t('useCurrentViewButton')}</button>

    <button class="btn btn-secondary" id="save-settings-btn">${t('saveSettingsButton')}</button>
  </div>
`;
}

// Keep the <html lang> attribute in sync with the active language
function syncHtmlLang(language: Language): void {
  document.documentElement.lang = language;
}

/** Fill the settings panel inputs from the given settings snapshot. */
function populateSettingsValues(settings: UserSettings): void {
  const unitsSelect = document.getElementById('units') as HTMLSelectElement | null;
  const languageSelect = document.getElementById('language-select') as HTMLSelectElement | null;
  const activityTypeSelect = document.getElementById('activity-type') as HTMLSelectElement | null;
  const customSpeedInput = document.getElementById('custom-speed') as HTMLInputElement | null;
  const customPaceInput = document.getElementById('custom-pace') as HTMLInputElement | null;
  const darkModeToggle = document.getElementById('dark-mode-toggle') as HTMLInputElement | null;
  const homeLatInput = document.getElementById('home-lat') as HTMLInputElement | null;
  const homeLngInput = document.getElementById('home-lng') as HTMLInputElement | null;
  const homeZoomInput = document.getElementById('home-zoom') as HTMLInputElement | null;

  if (unitsSelect) unitsSelect.value = settings.units;
  if (languageSelect) languageSelect.value = settings.language;
  if (activityTypeSelect) activityTypeSelect.value = settings.activityType;
  if (darkModeToggle) darkModeToggle.checked = settings.darkMode;

  // Show custom speed/pace in the user's preferred units
  if (customSpeedInput) {
    customSpeedInput.value =
      settings.customSpeed !== undefined && settings.units === 'imperial'
        ? String(Math.round(settings.customSpeed * 0.621371192 * 10) / 10)
        : settings.customSpeed !== undefined
          ? String(settings.customSpeed)
          : '';
  }
  if (customPaceInput) {
    customPaceInput.value =
      settings.customPace !== undefined && settings.units === 'imperial'
        ? String(Math.round((settings.customPace / 0.621371192) * 100) / 100)
        : settings.customPace !== undefined
          ? String(settings.customPace)
          : '';
  }
  if (homeLatInput) homeLatInput.value = String(settings.homeLocation.lat);
  if (homeLngInput) homeLngInput.value = String(settings.homeLocation.lng);
  if (homeZoomInput) homeZoomInput.value = String(settings.homeLocation.zoom);
}

/**
 * Mount translated panels, preserving transient inputs across re-renders
 * (used at boot and when the language changes).
 */
function remountPanels(): void {
  const controlsContainer = document.getElementById('controls');
  const routeInfoContainer = document.getElementById('route-info');
  const settingsContainer = document.getElementById('settings');
  if (!controlsContainer || !routeInfoContainer || !settingsContainer) {
    return;
  }

  // Snapshot transient values that are not part of persisted settings
  const transientIds = ['address-search', 'route-name', 'start-point', 'end-point'];
  const snapshots = new Map<string, string>();
  for (const id of transientIds) {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) {
      snapshots.set(id, el.value);
    }
  }

  controlsContainer.innerHTML = controlsHTML();
  routeInfoContainer.innerHTML = routeInfoHTML();
  settingsContainer.innerHTML = settingsHTML();

  populateSettingsValues({ ...storageManager.getSettings(), language: getLanguage() });

  for (const id of transientIds) {
    const el = document.getElementById(id) as HTMLInputElement | null;
    const value = snapshots.get(id);
    if (el && value !== undefined) {
      el.value = value;
    }
  }

  setupEventListeners();
}

/** Switch UI language immediately: re-render texts and sync <html lang>. */
async function applyLanguage(language: Language): Promise<void> {
  setLanguage(language);
  syncHtmlLang(language);
  remountPanels();
  mapComponent.refreshMarkerLabels();
  await refreshSavedRoutesDropdown();

  if (routePlanner.getCurrentRoute()) {
    await recalculateRoute();
  } else {
    setStatus(t('statusInitial'));
  }
}

// Initialize UI
async function initUI(): Promise<void> {
  // Wait for DOM to be ready
  const mapContainer = document.getElementById('map');
  if (!mapContainer) {
    throw new Error('Map container not found');
  }

  // Show loading
  showLoading();

  // Hide loading after a short delay
  setTimeout(hideLoading, 500);

  // Load and apply persisted settings before rendering so panels open in
  // the stored language.
  let savedSettings = storageManager.getSettings();
  try {
    savedSettings = await storageManager.loadSettings();
  } catch (error) {
    // Storage failures must not abort initialization; defaults already applied.
    console.error('Failed to load settings; using current/defaults:', error);
  }
  setLanguage(savedSettings.language);
  syncHtmlLang(savedSettings.language);

  // Mount panels into predefined sidebar containers
  remountPanels();

  applyTheme(savedSettings.darkMode);

  // Initialize map centered on home location
  await mapComponent.init('map', savedSettings.homeLocation);
  mapComponent.updateSettings({ units: savedSettings.units });

  // Populate the saved-routes dropdown once the UI exists
  await refreshSavedRoutesDropdown();
}

// Setup event listeners
function setupEventListeners(): void {
  const calculateBtn = document.getElementById('calculate-btn') as HTMLButtonElement;
  const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
  const saveRouteBtn = document.getElementById('save-route-btn') as HTMLButtonElement;
  const unitsSelect = document.getElementById('units') as HTMLSelectElement;
  const activityTypeSelect = document.getElementById('activity-type') as HTMLSelectElement;
  const customSpeedInput = document.getElementById('custom-speed') as HTMLInputElement;
  const customPaceInput = document.getElementById('custom-pace') as HTMLInputElement;
  const darkModeToggle = document.getElementById('dark-mode-toggle') as HTMLInputElement;
  const homeLatInput = document.getElementById('home-lat') as HTMLInputElement;
  const homeLngInput = document.getElementById('home-lng') as HTMLInputElement;
  const homeZoomInput = document.getElementById('home-zoom') as HTMLInputElement;
  const useCurrentViewBtn = document.getElementById('use-current-view-btn') as HTMLButtonElement;
  const saveSettingsBtn = document.getElementById('save-settings-btn') as HTMLButtonElement;
  const loadRouteBtn = document.getElementById('load-route-btn') as HTMLButtonElement;
  const deleteRouteBtn = document.getElementById('delete-route-btn') as HTMLButtonElement;
  const searchBtn = document.getElementById('search-btn') as HTMLButtonElement;
  const addressInput = document.getElementById('address-search') as HTMLInputElement;
  const languageSelect = document.getElementById('language-select') as HTMLSelectElement;

  // Wire live waypoint changes (drag / delete) -> sync planner, clear stale route, update status
  mapComponent.setWaypointsChangeHandler((locations) => {
    routePlanner.setWaypoints(locations);
    mapComponent.clearRoute();
    if (locations.length === 0) {
      setStatus(t('statusCleared'));
    } else {
      setStatus(t('statusWaypointsCount', { n: locations.length }));
    }
  });

  // Map click handler for adding waypoints
  const map = mapComponent.getMap();
  if (map) {
    map.on('click', async (e: L.LeafletMouseEvent) => {
      const latlng = e.latlng;
      
      // Update waypoint inputs
      const startPointEl = document.getElementById('start-point') as HTMLInputElement;
      const endPointEl = document.getElementById('end-point') as HTMLInputElement;
      
      startPointEl.value = `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
      endPointEl.value = `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
      
      // Add waypoint to planner
      routePlanner.addWaypoint([latlng.lat, latlng.lng]);

      // Add draggable/deletable marker to map (addWaypointMarker handles colors + line + notifications)
      mapComponent.addWaypointMarker([latlng.lat, latlng.lng]);

      // Update status (planner and map stay in sync via change handler too)
      const waypoints = routePlanner.getWaypoints();
      setStatus(t('statusAddedWaypoints', { n: waypoints.length }));
    });
  }
  
  // Calculate route button
  calculateBtn?.addEventListener('click', () => {
    void recalculateRoute();
  });
  
  // Clear button
  clearBtn?.addEventListener('click', () => {
    routePlanner.clear();
    mapComponent.clearRoute();
    mapComponent.clearWaypointMarkers();

    setStatus(t('statusCleared'));

    // Clear inputs
    const startPointEl = document.getElementById('start-point') as HTMLInputElement;
    const endPointEl = document.getElementById('end-point') as HTMLInputElement;
    
    startPointEl.value = '';
    endPointEl.value = '';
  });
  
  // Save route button
  saveRouteBtn?.addEventListener('click', async () => {
    const routeNameInput = document.getElementById('route-name') as HTMLInputElement;
    const routeName = routeNameInput.value || `Route ${Date.now()}`;
    
    try {
      const currentRoute = routePlanner.getCurrentRoute();
      
      if (currentRoute) {
        // Update route name
        currentRoute.name = routeName;
        
        // Save to storage
        await storageManager.saveRoute(currentRoute);
        
        // Clear input
        routeNameInput.value = '';

        setStatus(t('statusRouteSaved', { name: routeName }));

        // Keep the dropdown in sync after every save
        await refreshSavedRoutesDropdown();
      }
    } catch (error) {
      console.error('Error saving route:', error);
      setStatus(t('statusSaveRouteError'));
    }
  });
  
  // Load saved route
  loadRouteBtn?.addEventListener('click', () => {
    void loadSelectedRoute();
  });

  // Delete selected saved route
  deleteRouteBtn?.addEventListener('click', async () => {
    const select = document.getElementById('saved-routes') as HTMLSelectElement | null;
    const id = select?.value;
    if (!id) {
      return;
    }

    try {
      await storageManager.deleteRoute(id);
      await refreshSavedRoutesDropdown();
      setStatus(t('statusRouteDeleted'));
    } catch (error) {
      console.error('Error deleting route:', error);
      setStatus(t('statusDeleteRouteError'));
    }
  });

  // Language select: re-render texts immediately; persisted via Save Settings
  languageSelect?.addEventListener('change', (e: Event) => {
    const language = (e.target as HTMLSelectElement).value as Language;
    void applyLanguage(language);
  });

  // Address search: button click or Enter key. Fired only on explicit
  // user action (Nominatim etiquette: no autocomplete/debounce requests).
  searchBtn?.addEventListener('click', () => {
    void performAddressSearch();
  });
  addressInput?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void performAddressSearch();
    }
  });

  // Units select change
  unitsSelect?.addEventListener('change', (e: Event) => {
    const units = (e.target as HTMLSelectElement).value as 'metric' | 'imperial';
    mapComponent.updateSettings({ units });

    // Re-derive status (and popup units) for the current route
    if (routePlanner.getCurrentRoute()) {
      void recalculateRoute();
    }

    // Distance labels in the saved-routes dropdown follow the active units
    void refreshSavedRoutesDropdown();
  });
  
  // Activity type select change (persisted, then duration re-derived on save)
  activityTypeSelect?.addEventListener('change', () => {
    saveSettingsBtn?.click();
  });

  // Custom speed / pace changes are persisted via the Save Settings flow
  customSpeedInput?.addEventListener('change', () => {
    saveSettingsBtn?.click();
  });
  customPaceInput?.addEventListener('change', () => {
    saveSettingsBtn?.click();
  });

  // Dark mode toggle
  darkModeToggle?.addEventListener('change', (e: Event) => {
    const darkMode = (e.target as HTMLInputElement).checked;
    applyTheme(darkMode);
    saveSettingsBtn?.click();
  });
  
  // Save settings button
  useCurrentViewBtn?.addEventListener('click', () => {
    const map = mapComponent.getMap();
    if (!map) {
      return;
    }

    const center = map.getCenter();
    homeLatInput.value = center.lat.toFixed(6);
    homeLngInput.value = center.lng.toFixed(6);
    homeZoomInput.value = String(map.getZoom());

    setStatus(t('statusCapturedView'));
  });

  // Save settings button
  saveSettingsBtn?.addEventListener('click', async () => {
    try {
      const units = unitsSelect?.value as 'metric' | 'imperial';
      const language = (languageSelect?.value ?? getLanguage()) as Language;
      const activityType = (activityTypeSelect?.value ?? 'walking') as UserSettings['activityType'];
      const darkMode = Boolean(darkModeToggle?.checked);
      const lat = Number(homeLatInput?.value);
      const lng = Number(homeLngInput?.value);
      const zoom = Number(homeZoomInput?.value);

      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        throw new Error(t('errorLatitudeRange'));
      }
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        throw new Error(t('errorLongitudeRange'));
      }
      if (!Number.isFinite(zoom) || zoom < 1 || zoom > 19) {
        throw new Error(t('errorZoomRange'));
      }

      // Custom speed/pace inputs are entered in the active unit system;
      // store canonical values (km/h, min/km).
      const speedRaw = customSpeedInput?.value.trim() ?? '';
      const paceRaw = customPaceInput?.value.trim() ?? '';

      let customSpeedCanonical: number | undefined;
      if (speedRaw !== '') {
        const value = Number(speedRaw);
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error(t('errorCustomSpeed'));
        }
        customSpeedCanonical = units === 'imperial' ? mphToKmh(value) : value;
      }

      let customPaceCanonical: number | undefined;
      if (paceRaw !== '') {
        const value = Number(paceRaw);
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error(t('errorCustomPace'));
        }
        customPaceCanonical = units === 'imperial' ? minPerMiToMinPerKm(value) : value;
      }

      // Get current settings
      const currentSettings = storageManager.getSettings();

      // Update settings
      const newSettings: UserSettings = {
        name: currentSettings.name,
        units,
        language,
        activityType,
        customSpeed: customSpeedCanonical,
        customPace: customPaceCanonical,
        darkMode,
        homeLocation: {
          lat,
          lng,
          zoom,
        },
      };

      await storageManager.saveSettings(newSettings);

      // Update map component settings
      mapComponent.updateSettings({ units });
      syncHtmlLang(language);
      applyTheme(darkMode);

      // Re-derive the current route's duration with the new speed settings
      if (routePlanner.getCurrentRoute()) {
        await recalculateRoute();
      } else {
        setStatus(t('statusSettingsSaved'));
      }
    } catch (error) {
      console.error('Error saving settings:', error);

      const message = error instanceof Error ? error.message : t('statusSettingsSaveError');
      setStatus(message);
    }
  });
}

// Start the app
initUI().catch(error => {
  console.error('Failed to initialize app:', error);
});
