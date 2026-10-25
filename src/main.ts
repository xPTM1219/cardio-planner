import { GeocodingService } from './components/GeocodingService';
import { MapComponent } from './components/MapComponent';
import { RoutePlanner } from './components/RoutePlanner';
import { StorageManager, UserSettings } from './components/StorageManager';
import type { Route } from './types';
import {
  Units,
  formatSpeedBasis,
  fromDisplayPace,
  fromDisplaySpeed,
  resolveSpeed,
  toDisplayPace,
  toDisplaySpeed,
  unitLabels,
} from './utils/speeds';
import { escapeHtml, formatDateTime } from './utils/format';
import { getRouteLocations } from './utils/savedRoutes';
import { MAX_WAYPOINTS, formatLatLng } from './utils/waypoints';
import { Language, getLanguage, setLanguage, t } from './i18n';
import { SettingsModalValues, openSettingsModal } from './ui/settingsModal';
import { openSavedRoutesModal } from './ui/savedRoutesModal';

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

/**
 * Name of the route that was loaded or saved last. The route popup shows it
 * instead of the default name. A waypoint change clears it.
 */
let activeRouteName: string | null = null;

/** Show the loading overlay. */
function showLoading(): void {
  const loading = document.createElement('div');
  loading.className = 'loading-overlay';
  loading.innerHTML = `<h2>${escapeHtml(t('appLoading'))}</h2>`;
  appRoot.appendChild(loading);
}

/** Hide the loading overlay. */
function hideLoading(): void {
  const loading = document.querySelector('.loading-overlay') as HTMLElement;
  if (loading) {
    loading.classList.add('hidden');
  }
}

/**
 * Apply the light or dark theme to the page.
 * @param darkMode `true` for the dark theme.
 */
function applyTheme(darkMode: boolean): void {
  document.body.classList.toggle('dark-mode', darkMode);
}

/**
 * Show a message in the Route Information panel. Line breaks are kept.
 * @param message Plain text.
 */
function setStatus(message: string): void {
  const statusEl = document.getElementById('route-status');
  if (statusEl) {
    statusEl.textContent = message;
  }
}

/** Get the active unit system from the stored settings. */
function getCurrentUnits(): Units {
  return storageManager.getSettings().units;
}

/** Make a unique id for a saved route. */
function createRouteId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Fill the read-only Start and End fields from the waypoint list.
 * @param locations Ordered `[lat, lng]` waypoints; empty clears the fields.
 */
function updateEndpointFields(locations: [number, number][]): void {
  const startPointEl = document.getElementById('start-point') as HTMLInputElement | null;
  const endPointEl = document.getElementById('end-point') as HTMLInputElement | null;
  const first = locations[0];
  const last = locations[locations.length - 1];
  if (startPointEl) startPointEl.value = first ? formatLatLng(first) : '';
  if (endPointEl) endPointEl.value = last ? formatLatLng(last) : '';
}

/**
 * Recalculate the current route with the effective speed from settings,
 * re-render it on the map, and update the status text.
 * @returns `true` when a route was calculated.
 */
async function recalculateRoute(): Promise<boolean> {
  try {
    const settings = storageManager.getSettings();
    const resolved = resolveSpeed(settings);
    const route = await routePlanner.calculateRoute(resolved.speedMps);

    if (!route) {
      setStatus(t('statusNeedTwoWaypoints'));
      return false;
    }

    if (activeRouteName) {
      route.name = activeRouteName;
    }
    mapComponent.renderRoute(route, { basisText: formatSpeedBasis(resolved, settings.units) });
    const info = routePlanner.getRouteInfo(settings.units, resolved);
    setStatus(info || t('statusNoRouteInfo'));
    return true;
  } catch (error) {
    console.error('Error calculating route:', error);
    setStatus(t('statusCalculateError'));
    return false;
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
    const results = await geocodingService.search(query, getLanguage());

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

/**
 * Save the current route under the name in the route-name field.
 *
 * [1] A waypoint change clears the calculated route, so the route is
 *     calculated again here. A stale route is never saved.
 * [2] Each save gets a new id and time, so two saves of the same route are
 *     two separate entries.
 */
async function saveCurrentRoute(): Promise<void> {
  if (routePlanner.getWaypoints().length < 2) {
    setStatus(t('statusNeedTwoWaypoints'));
    return;
  }

  // See note [1] in the docstring
  if (!routePlanner.getCurrentRoute() && !(await recalculateRoute())) {
    return;
  }
  const current = routePlanner.getCurrentRoute();
  if (!current) {
    return;
  }

  const routeNameInput = document.getElementById('route-name') as HTMLInputElement | null;
  const name =
    routeNameInput?.value.trim() || t('defaultRouteName', { date: formatDateTime(new Date(), getLanguage()) });

  try {
    // See note [2] in the docstring
    await storageManager.saveRoute({
      ...current,
      id: createRouteId(),
      name,
      createdAt: new Date().toISOString(),
    });

    activeRouteName = name;
    current.name = name;
    const settings = storageManager.getSettings();
    mapComponent.renderRoute(current, {
      basisText: formatSpeedBasis(resolveSpeed(settings), settings.units),
    });

    if (routeNameInput) routeNameInput.value = '';
    await refreshSavedRoutesCount();
    setStatus(t('statusRouteSaved', { name }));
  } catch (error) {
    console.error('Error saving route:', error);
    setStatus(t('statusSaveRouteError'));
  }
}

/**
 * Show a saved route on the map and calculate it with the current speed.
 *
 * [1] `updateWaypoints` calls the waypoint change handler, which clears the
 *     route name. The name is set again after that call.
 *
 * @param route Stored route.
 */
async function loadRoute(route: Route): Promise<void> {
  const locations = getRouteLocations(route);
  if (!locations) {
    setStatus(t('statusLoadRouteMissing'));
    return;
  }

  try {
    mapComponent.updateWaypoints(locations);
    // See note [1] in the docstring
    activeRouteName = route.name || null;
    const calculated = await recalculateRoute();
    mapComponent.fitBounds(locations);

    const routeNameInput = document.getElementById('route-name') as HTMLInputElement | null;
    if (routeNameInput) routeNameInput.value = route.name;

    if (calculated) {
      const settings = storageManager.getSettings();
      const info = routePlanner.getRouteInfo(settings.units, resolveSpeed(settings));
      setStatus(`${t('statusRouteLoaded', { name: route.name })}${info ? '\n' + info : ''}`);
    }
  } catch (error) {
    console.error('Error loading route:', error);
    setStatus(t('statusLoadRouteError'));
  }
}

/**
 * Delete a saved route and update the Saved Routes button.
 * @param route Stored route.
 * @returns `true` when the route was deleted.
 */
async function deleteSavedRoute(route: Route): Promise<boolean> {
  try {
    await storageManager.deleteRoute(route.id);
    await refreshSavedRoutesCount();
    setStatus(t('statusRouteDeleted'));
    return true;
  } catch (error) {
    console.error('Error deleting route:', error);
    setStatus(t('statusDeleteRouteError'));
    return false;
  }
}

/** Show the number of valid saved routes on the Saved Routes button. */
async function refreshSavedRoutesCount(): Promise<void> {
  const button = document.getElementById('saved-routes-btn');
  if (!button) {
    return;
  }
  const routes = await storageManager.loadRoutes();
  const count = routes.filter((route) => typeof route?.id === 'string' && getRouteLocations(route)).length;
  button.textContent = t('savedRoutesButton', { n: count });
}

/** Open the Saved Routes modal with the stored routes. */
async function openSavedRoutes(): Promise<void> {
  const settings = storageManager.getSettings();
  const routes = await storageManager.loadRoutes();
  openSavedRoutesModal({
    routes,
    rowOptions: {
      units: settings.units,
      language: getLanguage(),
      speedMps: resolveSpeed(settings).speedMps,
    },
    onLoad: loadRoute,
    onDelete: deleteSavedRoute,
  });
}

/**
 * Save the values from the Settings modal and apply them to the page.
 * @param values New language, units, theme, and home location.
 * @throws When the settings cannot be saved. The modal shows the error.
 */
async function saveSettingsFromModal(values: SettingsModalValues): Promise<void> {
  const saved = await storageManager.updateSettings(values);
  applyTheme(saved.darkMode);
  mapComponent.updateSettings({ units: saved.units });
  await refreshUI(saved.language);
  if (!routePlanner.getCurrentRoute()) {
    setStatus(t('statusSettingsSaved'));
  }
}

/** Open the Settings modal. */
function openSettings(): void {
  openSettingsModal({
    settings: storageManager.getSettings(),
    getCurrentView: () => mapComponent.getCurrentView(),
    onSave: saveSettingsFromModal,
  });
}

/**
 * Validate and store a custom speed or pace typed in the Activity panel.
 *
 * [1] A number field with text that is not a number has an empty value.
 *     `badInput` finds this case, so the text is not stored as "blank".
 * [2] An empty field clears the stored value.
 * [3] The value is stored in canonical units (km/h, min/km).
 *
 * @param kind Which field changed.
 */
async function saveCustomValue(kind: 'speed' | 'pace'): Promise<void> {
  const input = document.getElementById(`custom-${kind}`) as HTMLInputElement | null;
  const errorEl = document.getElementById(`custom-${kind}-error`);
  if (!input) {
    return;
  }

  const showError = (visible: boolean): void => {
    if (!errorEl) return;
    errorEl.textContent = visible ? t(kind === 'speed' ? 'errorCustomSpeed' : 'errorCustomPace') : '';
    errorEl.hidden = !visible;
  };

  const raw = input.value.trim();
  let canonical: number | undefined;
  // See note [1] in the docstring
  if (input.validity.badInput) {
    showError(true);
    return;
  }
  // See note [2] in the docstring
  if (raw !== '') {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      showError(true);
      return;
    }
    // See note [3] in the docstring
    const units = getCurrentUnits();
    canonical = kind === 'speed' ? fromDisplaySpeed(value, units) : fromDisplayPace(value, units);
  }
  showError(false);

  try {
    await storageManager.updateSettings(kind === 'speed' ? { customSpeed: canonical } : { customPace: canonical });
    await recalculateIfRouteShown();
  } catch (error) {
    console.error('Error saving activity settings:', error);
    setStatus(t('statusSettingsSaveError'));
  }
}

/** Recalculate the route only when a calculated route is on the map. */
async function recalculateIfRouteShown(): Promise<void> {
  if (routePlanner.getCurrentRoute()) {
    await recalculateRoute();
  }
}

/** Build the Route Planner panel (left sidebar). */
function controlsHTML(): string {
  return `
  <div class="panel control-panel">
    <h2>${escapeHtml(t('routePlannerTitle'))}</h2>

    <div class="form-group">
      <label for="address-search">${escapeHtml(t('addressSearchLabel'))}</label>
      <div class="search-row">
        <input type="text" id="address-search" placeholder="${escapeHtml(t('addressSearchPlaceholder'))}" autocomplete="off" />
        <button class="btn" id="search-btn">${escapeHtml(t('addressSearchButton'))}</button>
      </div>
    </div>

    <div class="form-group">
      <label for="start-point">${escapeHtml(t('startPointLabel'))}</label>
      <input type="text" id="start-point" placeholder="${escapeHtml(t('waypointAutoPlaceholder'))}" readonly />
    </div>

    <div class="form-group">
      <label for="end-point">${escapeHtml(t('endPointLabel'))}</label>
      <input type="text" id="end-point" placeholder="${escapeHtml(t('waypointAutoPlaceholder'))}" readonly />
    </div>

    <button class="btn" id="calculate-btn">${escapeHtml(t('calculateRouteButton'))}</button>
    <button class="btn btn-secondary" id="clear-btn">${escapeHtml(t('clearAllButton'))}</button>

    <div class="form-group form-group-spaced">
      <label for="route-name">${escapeHtml(t('routeNameLabel'))}</label>
      <input type="text" id="route-name" placeholder="${escapeHtml(t('routeNamePlaceholder'))}" />
    </div>

    <button class="btn btn-secondary" id="save-route-btn">${escapeHtml(t('saveRouteButton'))}</button>
    <button class="btn btn-secondary btn-spaced" id="saved-routes-btn">${escapeHtml(t('savedRoutesButton', { n: 0 }))}</button>
  </div>
`;
}

/** Build the Route Information panel. */
function routeInfoHTML(): string {
  return `
  <div class="panel route-info">
    <h3>${escapeHtml(t('routeInformationTitle'))}</h3>
    <p id="route-status" class="route-status">${escapeHtml(t('statusInitial'))}</p>
  </div>
`;
}

/**
 * Build the Activity panel. Speed and pace show in the active units.
 * @param settings Current settings.
 * @returns Panel HTML.
 */
function activityHTML(settings: UserSettings): string {
  const labels = unitLabels(settings.units);
  const speedValue = settings.customSpeed !== undefined ? String(toDisplaySpeed(settings.customSpeed, settings.units)) : '';
  const paceValue = settings.customPace !== undefined ? String(toDisplayPace(settings.customPace, settings.units)) : '';
  const activityOption = (value: UserSettings['activityType'], label: string): string =>
    `<option value="${value}"${settings.activityType === value ? ' selected' : ''}>${escapeHtml(label)}</option>`;

  return `
  <div class="panel settings-panel">
    <h3>${escapeHtml(t('activityPanelTitle'))}</h3>

    <div class="form-group">
      <label for="activity-type">${escapeHtml(t('activityTypeLabel'))}</label>
      <select id="activity-type">
        ${activityOption('walking', t('activityWalking'))}
        ${activityOption('jogging', t('activityJogging'))}
        ${activityOption('running', t('activityRunning'))}
        ${activityOption('bicycling', t('activityBicycling'))}
      </select>
    </div>

    <div class="form-group">
      <label for="custom-speed">${escapeHtml(t('customSpeedLabel', { unit: labels.speed }))}</label>
      <input type="number" id="custom-speed" placeholder="${escapeHtml(t('customValuePlaceholder'))}" step="any" min="0" value="${speedValue}" />
      <p class="field-error" id="custom-speed-error" role="alert" hidden></p>
    </div>

    <div class="form-group">
      <label for="custom-pace">${escapeHtml(t('customPaceLabel', { unit: labels.pace }))}</label>
      <input type="number" id="custom-pace" placeholder="${escapeHtml(t('customValuePlaceholder'))}" step="any" min="0" value="${paceValue}" />
      <p class="field-error" id="custom-pace-error" role="alert" hidden></p>
    </div>

    <button class="btn btn-secondary" id="open-settings-btn">⚙ ${escapeHtml(t('settingsButton'))}</button>
  </div>
`;
}

/**
 * Keep the `<html lang>` attribute in sync with the active language.
 * @param language Active UI language.
 */
function syncHtmlLang(language: Language): void {
  document.documentElement.lang = language;
}

/**
 * Mount the translated panels and bind their DOM events.
 *
 * [1] The address and route-name fields keep their text across re-renders.
 * [2] The Start and End fields come from the planner waypoints.
 */
function remountPanels(): void {
  const controlsContainer = document.getElementById('controls');
  const routeInfoContainer = document.getElementById('route-info');
  const activityContainer = document.getElementById('activity');
  if (!controlsContainer || !routeInfoContainer || !activityContainer) {
    return;
  }

  // See note [1] in the docstring
  const transientIds = ['address-search', 'route-name'];
  const snapshots = new Map<string, string>();
  for (const id of transientIds) {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) {
      snapshots.set(id, el.value);
    }
  }

  controlsContainer.innerHTML = controlsHTML();
  routeInfoContainer.innerHTML = routeInfoHTML();
  activityContainer.innerHTML = activityHTML(storageManager.getSettings());

  for (const id of transientIds) {
    const el = document.getElementById(id) as HTMLInputElement | null;
    const value = snapshots.get(id);
    if (el && value !== undefined) {
      el.value = value;
    }
  }

  // See note [2] in the docstring
  updateEndpointFields(routePlanner.getWaypoints().map((wp) => wp.location));
  setupPanelEventListeners();
}

/**
 * Re-render all text after a settings change: language, units, and labels.
 * @param language UI language to use.
 */
async function refreshUI(language: Language): Promise<void> {
  setLanguage(language);
  syncHtmlLang(language);
  remountPanels();
  mapComponent.refreshMarkerLabels();
  await refreshSavedRoutesCount();

  if (routePlanner.getCurrentRoute()) {
    await recalculateRoute();
  } else {
    const count = routePlanner.getWaypoints().length;
    setStatus(count > 0 ? t('statusWaypointsCount', { n: count }) : t('statusInitial'));
  }
}

/**
 * Start the app: settings, panels, map, and map events.
 *
 * [1] The settings load before the panels render, so the panels open in the
 *     stored language and theme.
 * [2] A storage failure does not stop the start; the defaults stay in use.
 * [3] The map events are bound after the map exists, one time only. This
 *     order makes map clicks add waypoints from the start.
 *
 * @throws When the map container is missing.
 */
async function initUI(): Promise<void> {
  const mapContainer = document.getElementById('map');
  if (!mapContainer) {
    throw new Error('Map container not found');
  }

  showLoading();
  setTimeout(hideLoading, 500);

  // See note [1] in the docstring
  let savedSettings = storageManager.getSettings();
  try {
    savedSettings = await storageManager.loadSettings();
  } catch (error) {
    // See note [2] in the docstring
    console.error('Failed to load settings; using current/defaults:', error);
  }
  setLanguage(savedSettings.language);
  syncHtmlLang(savedSettings.language);
  applyTheme(savedSettings.darkMode);

  remountPanels();

  // See note [3] in the docstring
  await mapComponent.init('map', savedSettings.homeLocation);
  mapComponent.updateSettings({ units: savedSettings.units });
  setupMapEvents();

  await refreshSavedRoutesCount();
}

/**
 * Bind map events. Call this one time, after the map is initialized.
 * Panel re-renders must not call it again.
 */
function setupMapEvents(): void {
  mapComponent.setWaypointsChangeHandler((locations) => {
    routePlanner.setWaypoints(locations);
    activeRouteName = null;
    mapComponent.clearRoute();
    updateEndpointFields(locations);
    setStatus(locations.length === 0 ? t('statusCleared') : t('statusWaypointsCount', { n: locations.length }));
  });

  mapComponent.setWaypointLimitHandler(() => {
    setStatus(t('statusMaxWaypoints', { max: MAX_WAYPOINTS }));
  });
}

/**
 * Bind the events of the panel elements. {@link remountPanels} calls this
 * after each re-render, because the elements are new.
 */
function setupPanelEventListeners(): void {
  const calculateBtn = document.getElementById('calculate-btn');
  const clearBtn = document.getElementById('clear-btn');
  const saveRouteBtn = document.getElementById('save-route-btn');
  const savedRoutesBtn = document.getElementById('saved-routes-btn');
  const searchBtn = document.getElementById('search-btn');
  const addressInput = document.getElementById('address-search');
  const activityTypeSelect = document.getElementById('activity-type') as HTMLSelectElement | null;
  const customSpeedInput = document.getElementById('custom-speed');
  const customPaceInput = document.getElementById('custom-pace');
  const openSettingsBtn = document.getElementById('open-settings-btn');

  calculateBtn?.addEventListener('click', () => {
    void recalculateRoute();
  });

  clearBtn?.addEventListener('click', () => {
    routePlanner.clear();
    activeRouteName = null;
    mapComponent.clearRoute();
    mapComponent.clearWaypointMarkers();
    updateEndpointFields([]);
    setStatus(t('statusCleared'));
  });

  saveRouteBtn?.addEventListener('click', () => {
    void saveCurrentRoute();
  });

  savedRoutesBtn?.addEventListener('click', () => {
    void openSavedRoutes();
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

  activityTypeSelect?.addEventListener('change', async () => {
    try {
      await storageManager.updateSettings({
        activityType: activityTypeSelect.value as UserSettings['activityType'],
      });
      await recalculateIfRouteShown();
    } catch (error) {
      console.error('Error saving activity type:', error);
      setStatus(t('statusSettingsSaveError'));
    }
  });

  customSpeedInput?.addEventListener('change', () => {
    void saveCustomValue('speed');
  });
  customPaceInput?.addEventListener('change', () => {
    void saveCustomValue('pace');
  });

  openSettingsBtn?.addEventListener('click', () => {
    openSettings();
  });
}

// Start the app
initUI().catch(error => {
  console.error('Failed to initialize app:', error);
});
