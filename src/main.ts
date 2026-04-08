import { MapComponent } from './components/MapComponent';
import { RoutePlanner } from './components/RoutePlanner';
import { StorageManager, UserSettings } from './components/StorageManager';

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

// Show loading overlay
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

// Create control panel HTML
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
      <label for="route-name">Route Name</label>
      <input type="text" id="route-name" placeholder="Enter route name..." />
    </div>
    
    <button class="btn btn-secondary" id="save-route-btn">Save Route</button>
  </div>
`;

// Create route info panel HTML
const routeInfoHTML = `
  <div class="route-info">
    <h3>Route Information</h3>
    <p id="route-status" style="color: #666;">Click on the map to add waypoints...</p>
  </div>
`;

// Create settings panel HTML
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

// Initialize UI
async function initUI(): Promise<void> {
  // Wait for DOM to be ready
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
  
  // Show loading
  showLoading();
  
  // Hide loading after a short delay
  setTimeout(hideLoading, 500);
  
  // Mount panels into predefined sidebar containers
  controlsContainer.innerHTML = controlsHTML;
  routeInfoContainer.innerHTML = routeInfoHTML;
  settingsContainer.innerHTML = settingsHTML;
  
  // Initialize map
  await mapComponent.init('map');

  // Load and apply persisted settings
  const savedSettings = await storageManager.loadSettings();
  mapComponent.updateSettings({
    units: savedSettings.units,
    fitnessLevel: savedSettings.fitnessLevel,
  });
  mapComponent.setHomeView(savedSettings.homeLocation);

  const unitsSelect = document.getElementById('units') as HTMLSelectElement | null;
  const fitnessLevelSelect = document.getElementById('fitness-level') as HTMLSelectElement | null;
  const homeLatInput = document.getElementById('home-lat') as HTMLInputElement | null;
  const homeLngInput = document.getElementById('home-lng') as HTMLInputElement | null;
  const homeZoomInput = document.getElementById('home-zoom') as HTMLInputElement | null;

  if (unitsSelect) unitsSelect.value = savedSettings.units;
  if (fitnessLevelSelect) fitnessLevelSelect.value = savedSettings.fitnessLevel;
  if (homeLatInput) homeLatInput.value = String(savedSettings.homeLocation.lat);
  if (homeLngInput) homeLngInput.value = String(savedSettings.homeLocation.lng);
  if (homeZoomInput) homeZoomInput.value = String(savedSettings.homeLocation.zoom);
  
  // Setup event listeners
  setupEventListeners();
}

// Setup event listeners
function setupEventListeners(): void {
  const calculateBtn = document.getElementById('calculate-btn') as HTMLButtonElement;
  const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
  const saveRouteBtn = document.getElementById('save-route-btn') as HTMLButtonElement;
  const unitsSelect = document.getElementById('units') as HTMLSelectElement;
  const fitnessLevelSelect = document.getElementById('fitness-level') as HTMLSelectElement;
  const homeLatInput = document.getElementById('home-lat') as HTMLInputElement;
  const homeLngInput = document.getElementById('home-lng') as HTMLInputElement;
  const homeZoomInput = document.getElementById('home-zoom') as HTMLInputElement;
  const useCurrentViewBtn = document.getElementById('use-current-view-btn') as HTMLButtonElement;
  const saveSettingsBtn = document.getElementById('save-settings-btn') as HTMLButtonElement;
  
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
      
      // Update status
      const waypoints = routePlanner.getWaypoints();
      const statusEl = document.getElementById('route-status');
      if (statusEl) {
        statusEl.textContent = `Added ${waypoints.length} waypoint(s). Click again to add more. Then click "Calculate Route".`;
      }
    });
  }
  
  // Calculate route button
  calculateBtn?.addEventListener('click', async () => {
    try {
      const route = await routePlanner.calculateRoute();
      
      if (route) {
        // Render route on map
        mapComponent.renderRoute(route);
        
        // Update status
        const statusEl = document.getElementById('route-status');
        if (statusEl) {
          const units = unitsSelect?.value as 'metric' | 'imperial';
          const info = routePlanner.getRouteInfo(units);
          statusEl.textContent = info || 'No route information available.';
        }
      }
    } catch (error) {
      console.error('Error calculating route:', error);
      
      const statusEl = document.getElementById('route-status');
      if (statusEl) {
        statusEl.textContent = 'Error: Could not calculate route. Please try again.';
      }
    }
  });
  
  // Clear button
  clearBtn?.addEventListener('click', () => {
    routePlanner.clear();
    mapComponent.clearRoute();
    mapComponent.clearWaypointMarkers();
    
    const statusEl = document.getElementById('route-status');
    if (statusEl) {
      statusEl.textContent = 'Map cleared. Click on the map to add waypoints...';
    }
    
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
  
  // Units select change
  unitsSelect?.addEventListener('change', (e: Event) => {
    const units = (e.target as HTMLSelectElement).value as 'metric' | 'imperial';
    mapComponent.updateSettings({ units });
    
    // Update route info display
    const currentRoute = routePlanner.getCurrentRoute();
    if (currentRoute) {
      const statusEl = document.getElementById('route-status');
      if (statusEl) {
        const info = routePlanner.getRouteInfo(units);
        statusEl.textContent = info || 'No route information available.';
      }
    }
  });
  
  // Fitness level select change
  fitnessLevelSelect?.addEventListener('change', (e: Event) => {
    const fitnessLevel = (e.target as HTMLSelectElement).value as 'casual' | 'moderate' | 'active';
    mapComponent.updateSettings({ fitnessLevel });
    
    // Save settings
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

    const statusEl = document.getElementById('route-status');
    if (statusEl) {
      statusEl.textContent = 'Captured current map view. Click "Save Settings" to persist.';
    }
  });

  // Save settings button
  saveSettingsBtn?.addEventListener('click', async () => {
    try {
      const units = unitsSelect?.value as 'metric' | 'imperial';
      const fitnessLevel = fitnessLevelSelect?.value as 'casual' | 'moderate' | 'active';
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
      
      // Get current settings
      const currentSettings = storageManager.getSettings();
      
      // Update settings
      const newSettings: UserSettings = {
        name: currentSettings.name,
        units,
        fitnessLevel,
        homeLocation: {
          lat,
          lng,
          zoom,
        },
      };
      
      await storageManager.saveSettings(newSettings);
      
      // Update map component settings
      mapComponent.updateSettings({ units, fitnessLevel });
      mapComponent.setHomeView(newSettings.homeLocation);
      
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

// Start the app
initUI().catch(error => {
  console.error('Failed to initialize app:', error);
});
