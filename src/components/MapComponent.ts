import 'leaflet';
import L from 'leaflet';
// Leaflet CSS is loaded from index.html to avoid TS side-effect import typing issues.
import { HomeLocation, Route } from '../types';
import { DEFAULT_HOME_LOCATION } from './StorageManager';
import { t } from '../i18n';

function escapeHtml(value: string): string {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

export class MapComponent {
  private static instance: MapComponent;
  private map: L.Map | null = null;
  private routeLayer: L.Polyline | null = null;
  private waypointsLayer: L.LayerGroup | null = null;
  private waypointsLine: L.Polyline | null = null;
  private waypointData: Array<{ location: [number, number]; marker: L.Marker }> = [];
  private onWaypointsChanged: ((locations: [number, number][]) => void) | null = null;
  private settings: { units: 'metric' | 'imperial' } = {
    units: 'metric',
  };

  private constructor() {}

  /** Returns the shared singleton instance. */
  public static getInstance(): MapComponent {
    if (!MapComponent.instance) {
      MapComponent.instance = new MapComponent();
    }
    return MapComponent.instance;
  }

  /**
   * Initialize the Leaflet map with an OSM tile layer.
   *
   * @param containerId DOM id of the element to mount the map into.
   * @param homeLocation Initial center/zoom; defaults to
   *   {@link DEFAULT_HOME_LOCATION} when omitted.
   * @throws When Leaflet cannot create the map.
   */
  async init(containerId: string, homeLocation: HomeLocation = DEFAULT_HOME_LOCATION): Promise<void> {
    try {
      this.map = L.map(containerId).setView([homeLocation.lat, homeLocation.lng], homeLocation.zoom);

      // Add OpenStreetMap tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(this.map);

      // Add custom markers for waypoints
      this.setupWaypointMarkers();

      // Ensure map computes correct dimensions after dynamic layout updates
      setTimeout(() => {
        this.map?.invalidateSize();
      }, 0);

      window.addEventListener('resize', () => {
        this.map?.invalidateSize();
      });

      console.log('Map initialized successfully');
    } catch (error) {
      console.error('Error initializing map:', error);
      throw new Error('Failed to initialize map');
    }
  }

  /**
   * Setup custom waypoint markers
   */
  private setupWaypointMarkers(): void {
    if (this.map) {
      this.waypointsLayer = L.layerGroup().addTo(this.map);
    }
  }

  /**
   * Update the line connecting waypoints
   */
  private updateWaypointsLine(): void {
    if (this.waypointsLine && this.map) {
      this.map.removeLayer(this.waypointsLine);
      this.waypointsLine = null;
    }
    const locations = this.getWaypointLocations();
    if (locations.length > 1) {
      const line = L.polyline(locations, { color: 'blue', weight: 2 });
      this.map?.addLayer(line);
      this.waypointsLine = line;
    }
  }

  private getWaypointLocations(): [number, number][] {
    return this.waypointData.map((d) => d.location);
  }

  private notifyWaypointsChanged(): void {
    if (this.onWaypointsChanged) {
      this.onWaypointsChanged(this.getWaypointLocations());
    }
  }

  /**
   * Register a handler called when waypoints are added, removed, or moved (drag).
   *
   * @param handler Receives the current ordered list of `[lat, lon]` locations.
   */
  setWaypointsChangeHandler(handler: (locations: [number, number][]) => void): void {
    this.onWaypointsChanged = handler;
  }

  /**
   * Render a route on the map as a dashed polyline with an info popup.
   * Any previously rendered route is replaced.
   *
   * @param route Route to draw (geometry, name, distance, duration).
   * @param options.basisText Plain-text speed basis appended to the popup,
   *   e.g. "at your pace 6:30 min/km".
   */
  renderRoute(route: Route, options?: { basisText?: string }): void {
    // Ensure map is initialized
    if (!this.map) {
      return;
    }

    // Remove existing route if present
    if (this.routeLayer) {
      this.map.removeLayer(this.routeLayer);
    }

    // Create polyline from route geometry
    const coordinates = route.geometry.coordinates;
    const polyline = L.polyline(coordinates, {
      color: '#e74c3c',
      weight: 4,
      opacity: 0.8,
      dashArray: '10, 10',
    }).addTo(this.map);

    this.routeLayer = polyline;

    // Add popup with route info
    const metric = this.settings.units === 'metric';
    const distance = metric
      ? Math.round((route.distance / 1000) * 100) / 100
      : Math.round(route.distance * 0.000621371 * 100) / 100;
    const unitLabel = metric ? 'km' : 'mi';
    const durationMin = Math.round(route.duration / 60);
    const hours = Math.floor(durationMin / 60);
    const durationLabel = hours > 0 ? `${hours}h ${durationMin % 60}m` : `${durationMin} min`;
    const basisLine = options?.basisText ? `<br/>${escapeHtml(options.basisText)}` : '';

    const popupContent = `
      <div style="min-width: 150px;">
        <strong>${escapeHtml(route.name)}</strong><br/>
        Distance: ${distance} ${unitLabel}<br/>
        Duration: ${durationLabel}${basisLine}
      </div>
    `;

    polyline.bindPopup(popupContent);
  }

  /** Remove the rendered route polyline from the map, if present. */
  clearRoute(): void {
    if (this.routeLayer && this.map) {
      this.map.removeLayer(this.routeLayer);
      this.routeLayer = null;
    }
  }

  private createWaypointIcon(color: string): L.DivIcon {
    return L.divIcon({
      className: '',
      html: `<div style="
        width:12px;height:12px;
        background-color:${color};
        border:2px solid #fff;
        border-radius:50%;
        box-shadow:0 1px 3px rgba(0,0,0,0.4);
      "></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      popupAnchor: [0, -8],
    });
  }

  private createDraggableWaypointMarker(location: [number, number]): L.Marker {
    const marker = L.marker(location, {
      icon: this.createWaypointIcon('blue'),
      draggable: true,
      riseOnHover: true,
    });

    const targetLayer = this.waypointsLayer || this.map;
    if (!targetLayer) {
      throw new Error('Map not initialized');
    }
    marker.addTo(targetLayer);

    const initialPopup = `
      <div style="min-width:150px;">
        <strong>${t('popupWaypoint')}</strong><br/>
        Lat: ${location[0].toFixed(4)}<br/>
        Lng: ${location[1].toFixed(4)}<br/>
        <a href="#" class="delete-waypoint-btn" style="color:#c00;text-decoration:underline;">${t('popupDeletePoint')}</a>
      </div>
    `;
    marker.bindPopup(initialPopup);

    // Live update line while dragging
    marker.on('drag', () => {
      const ll = marker.getLatLng();
      const idx = this.waypointData.findIndex((d) => d.marker === marker);
      if (idx !== -1) {
        this.waypointData[idx].location = [ll.lat, ll.lng];
        this.updateWaypointsLine();
      }
    });

    // Commit change and notify
    marker.on('dragend', () => {
      const ll = marker.getLatLng();
      const idx = this.waypointData.findIndex((d) => d.marker === marker);
      if (idx !== -1) {
        this.waypointData[idx].location = [ll.lat, ll.lng];
        this.updateWaypointsLine();
        this.notifyWaypointsChanged();
      }
    });

    // Handle delete button inside popup
    marker.on('popupopen', (ev: L.PopupEvent) => {
      const popupEl = ev.popup.getElement();
      if (!popupEl) return;
      const btn = popupEl.querySelector<HTMLElement>('.delete-waypoint-btn');
      if (btn) {
        btn.onclick = (e) => {
          e.preventDefault();
          const idx = this.waypointData.findIndex((d) => d.marker === marker);
          if (idx !== -1) {
            this.removeWaypoint(idx);
          }
          marker.closePopup();
        };
      }
    });

    return marker;
  }

  /**
   * Add a single waypoint marker (draggable, deletable via popup).
   * Refreshes marker colors/line and notifies the change handler.
   *
   * @param location `[lat, lon]` coordinate for the new waypoint.
   * @returns The created Leaflet marker.
   */
  addWaypointMarker(location: [number, number]): L.Marker {
    const marker = this.addWaypointInternal(location);
    this.refreshAllMarkerStyles();
    this.updateWaypointsLine();
    this.notifyWaypointsChanged();
    return marker;
  }

  private addWaypointInternal(location: [number, number]): L.Marker {
    const marker = this.createDraggableWaypointMarker(location);
    this.waypointData.push({ location, marker });
    return marker;
  }

  /**
   * Remove the waypoint at an index. Updates visuals and notifies listeners.
   * @param index Zero-based position; out-of-range values are ignored.
   */
  removeWaypoint(index: number): void {
    if (index < 0 || index >= this.waypointData.length) return;
    const entry = this.waypointData[index];
    if (this.waypointsLayer) {
      this.waypointsLayer.removeLayer(entry.marker);
    } else if (this.map) {
      this.map.removeLayer(entry.marker);
    }
    this.waypointData.splice(index, 1);
    this.refreshAllMarkerStyles();
    this.updateWaypointsLine();
    this.notifyWaypointsChanged();
  }

  private refreshAllMarkerStyles(): void {
    const n = this.waypointData.length;
    this.waypointData.forEach((entry, i) => {
      const isFirst = i === 0;
      const isLast = i === n - 1;
      const color = isFirst ? 'green' : isLast ? 'red' : 'blue';
      entry.marker.setIcon(this.createWaypointIcon(color));

      const loc = entry.location;
      let label = t('popupWaypointN', { n: i + 1 });
      if (isFirst) label = t('popupStartPoint');
      if (isLast) label = t('popupEndPoint');
      const popupContent = `
        <div style="min-width:150px;">
          <strong>${label}</strong><br/>
          Lat: ${loc[0].toFixed(4)}<br/>
          Lng: ${loc[1].toFixed(4)}<br/>
          <a href="#" class="delete-waypoint-btn" style="color:#c00;text-decoration:underline;">${t('popupDeletePoint')}</a>
        </div>
      `;
      entry.marker.setPopupContent(popupContent);
    });
  }

  /**
   * Re-render marker popup labels (e.g. after a language change).
   */
  refreshMarkerLabels(): void {
    this.refreshAllMarkerStyles();
  }

  /**
   * Remove all waypoint markers and the connecting line, then notify listeners.
   */
  clearWaypointMarkers(): void {
    const had = this.waypointData.length > 0;
    if (this.waypointsLayer) {
      this.waypointsLayer.clearLayers();
    } else if (this.map) {
      this.waypointData.forEach((d) => this.map?.removeLayer(d.marker));
    }
    if (this.waypointsLine && this.map) {
      this.map.removeLayer(this.waypointsLine);
      this.waypointsLine = null;
    }
    this.waypointData = [];
    if (had) {
      this.notifyWaypointsChanged();
    }
  }

  /**
   * Replace all waypoint markers with draggable/deletable ones built from
   * `locations`, then refresh visuals and notify listeners.
   *
   * @param locations Ordered `[lat, lon]` coordinates; an empty list clears.
   */
  updateWaypoints(locations: [number, number][]): void {
    this.clearWaypointMarkers();
    if (!this.map || locations.length === 0) {
      return;
    }
    locations.forEach((loc) => this.addWaypointInternal(loc));
    this.refreshAllMarkerStyles();
    this.updateWaypointsLine();
    this.notifyWaypointsChanged();
  }



  /**
   * Fit the map view to show all given waypoints.
   * @param waypoints `[lat, lon]` list; needs at least two points to act.
   */
  fitBounds(waypoints: [number, number][]): void {
    if (waypoints.length >= 2 && this.map) {
      const bounds = L.latLngBounds(waypoints);
      this.map.fitBounds(bounds, { padding: [50, 50] });
    }
  }

  /**
   * Smoothly fly the map to a location without touching waypoints or routes.
   * @param location `[lat, lon]` target center.
   * @param zoom Target zoom level (address search uses 16).
   */
  flyToLocation(location: [number, number], zoom: number): void {
    this.map?.flyTo(location, zoom);
  }

  /**
   * Get the underlying Leaflet map instance.
   * @returns The map, or `null` before {@link init} has completed.
   */
  getMap(): L.Map | null {
    return this.map;
  }

  /**
   * Merge UI-relevant settings used when rendering popups.
   * @param settings Partial settings; only `units` is currently consumed.
   */
  updateSettings(settings: Partial<typeof this.settings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  /**
   * Move the map view to a home location immediately (no animation).
   * @param homeLocation Center coordinates and zoom level.
   */
  setHomeView(homeLocation: HomeLocation): void {
    if (!this.map) {
      return;
    }

    this.map.setView([homeLocation.lat, homeLocation.lng], homeLocation.zoom);
  }

  /**
   * Remove the map from the DOM and reset all internal layer state.
   * The instance remains reusable after another {@link init} call.
   */
  destroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.routeLayer = null;
    this.waypointsLayer = null;
    this.waypointsLine = null;
    this.waypointData = [];
  }
}
