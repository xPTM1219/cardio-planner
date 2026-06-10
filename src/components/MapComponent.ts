import 'leaflet';
import L from 'leaflet';
// Leaflet CSS is loaded from index.html to avoid TS side-effect import typing issues.
import { HomeLocation, Route } from '../types';

export class MapComponent {
  private static instance: MapComponent;
  private map: L.Map | null = null;
  private routeLayer: L.Polyline | null = null;
  private waypointsLayer: L.LayerGroup | null = null;
  private waypointsLine: L.Polyline | null = null;
  private waypointData: Array<{ location: [number, number]; marker: L.Marker }> = [];
  private onWaypointsChanged: ((locations: [number, number][]) => void) | null = null;
  private settings: { units: 'metric' | 'imperial'; fitnessLevel: 'casual' | 'moderate' | 'active' } = {
    units: 'metric',
    fitnessLevel: 'moderate',
  };

  private constructor() {}

  public static getInstance(): MapComponent {
    if (!MapComponent.instance) {
      MapComponent.instance = new MapComponent();
    }
    return MapComponent.instance;
  }

  /**
   * Initialize the map
   */
  async init(containerId: string): Promise<void> {
    try {
      const defaultHome: HomeLocation = {
        lat: 18.2644,
        lng: -65.648,
        zoom: 13,
      };
      this.map = L.map(containerId).setView([defaultHome.lat, defaultHome.lng], defaultHome.zoom);

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
   */
  setWaypointsChangeHandler(handler: (locations: [number, number][]) => void): void {
    this.onWaypointsChanged = handler;
  }

  /**
   * Render a route on the map
   */
  renderRoute(route: Route): void {
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
    const distanceKm = (route.distance / 1000).toFixed(2);
    const durationMin = Math.round(route.duration / 60);

    const popupContent = `
      <div style="min-width: 150px;">
        <strong>${route.name}</strong><br/>
        Distance: ${distanceKm} km<br/>
        Duration: ${durationMin} min
      </div>
    `;

    polyline.bindPopup(popupContent);
  }

  /**
   * Remove route from map
   */
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
        <strong>Waypoint</strong><br/>
        Lat: ${location[0].toFixed(4)}<br/>
        Lng: ${location[1].toFixed(4)}<br/>
        <a href="#" class="delete-waypoint-btn" style="color:#c00;text-decoration:underline;">Delete this point</a>
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
      const btn = popupEl.querySelector('.delete-waypoint-btn') as HTMLElement | null;
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
   * Add a single waypoint marker (draggable, deletable via popup). Refreshes colors/line and notifies.
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
   * Remove waypoint at index. Updates visuals and notifies listeners.
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
      let label = `Waypoint ${i + 1}`;
      if (isFirst) label = 'Start Point';
      if (isLast) label = 'End Point';
      const popupContent = `
        <div style="min-width:150px;">
          <strong>${label}</strong><br/>
          Lat: ${loc[0].toFixed(4)}<br/>
          Lng: ${loc[1].toFixed(4)}<br/>
          <a href="#" class="delete-waypoint-btn" style="color:#c00;text-decoration:underline;">Delete this point</a>
        </div>
      `;
      entry.marker.setPopupContent(popupContent);
    });
  }

  /**
    * Remove all waypoint markers
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
    * Update all waypoint markers based on a list of coordinates.
    * This clears existing markers and adds new draggable/deletable ones.
    * @param locations Array of [lat, lng] coordinates for waypoints.
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
   * Fit map to show all waypoints and route
   */
  fitBounds(waypoints: [number, number][]): void {
    if (waypoints.length >= 2 && this.map) {
      const bounds = L.latLngBounds(waypoints);
      this.map.fitBounds(bounds, { padding: [50, 50] });
    }
  }

  /**
   * Get the map instance
   */
  getMap(): L.Map | null {
    return this.map;
  }

  /**
   * Update settings (called when user changes preferences)
   */
  updateSettings(settings: Partial<typeof this.settings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  /**
   * Set the map view to a specific home location.
   */
  setHomeView(homeLocation: HomeLocation): void {
    if (!this.map) {
      return;
    }

    this.map.setView([homeLocation.lat, homeLocation.lng], homeLocation.zoom);
  }

  /**
    * Remove map from DOM
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
