import L from 'leaflet';
// Leaflet CSS is loaded from index.html to avoid TS side-effect import typing issues.
import { HomeLocation, Route } from '../types';

export class MapComponent {
  private static instance: MapComponent;
  private map: L.Map | null = null;
  private plannedRouteLayer: L.Polyline | null = null;
  private actualRouteLayer: L.Polyline | null = null;
  private waypointsLayer: L.LayerGroup | null = null;
  private waypointsLine: L.Polyline | null = null;
  private waypoints: [number, number][] = [];
  private waypointMarkers: L.Marker[] = [];
  private waypointMovedCallback: ((index: number, location: [number, number]) => void) | null = null;
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
    }
    if (this.waypoints.length > 1) {
      const line = L.polyline(this.waypoints, { color: '#2563eb', weight: 2, dashArray: '6, 6' });
      this.map?.addLayer(line);
      this.waypointsLine = line;
    } else {
      this.waypointsLine = null;
    }
  }

  private toLatLngs(route: Route): [number, number][] {
    return route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  }

  /**
   * Render a route on the map
   */
  renderRoute(route: Route, kind: 'planned' | 'actual' = 'planned'): void {
    // Ensure map is initialized
    if (!this.map) {
      return;
    }

    const existingLayer = kind === 'planned' ? this.plannedRouteLayer : this.actualRouteLayer;
    if (existingLayer) {
      this.map.removeLayer(existingLayer);
    }

    // Create polyline from route geometry [lon,lat] -> [lat,lng]
    const latLngs = this.toLatLngs(route);
    const polyline = L.polyline(latLngs, {
      color: kind === 'planned' ? '#e74c3c' : '#22c55e',
      weight: kind === 'planned' ? 4 : 5,
      opacity: 0.85,
      dashArray: kind === 'planned' ? '10, 10' : undefined,
    }).addTo(this.map);

    if (kind === 'planned') {
      this.plannedRouteLayer = polyline;
    } else {
      this.actualRouteLayer = polyline;
    }

    // Add popup with route info
    const distanceKm = (route.distance / 1000).toFixed(2);
    const durationMin = Math.round(route.duration / 60);

    const popupContent = `
      <div style="min-width: 170px;">
        <strong>${route.name}</strong><br/>
        Type: ${kind === 'planned' ? 'Planned' : 'Actual'}<br/>
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
    if (this.plannedRouteLayer && this.map) {
      this.map.removeLayer(this.plannedRouteLayer);
      this.plannedRouteLayer = null;
    }
    if (this.actualRouteLayer && this.map) {
      this.map.removeLayer(this.actualRouteLayer);
      this.actualRouteLayer = null;
    }
  }

  clearActualRoute(): void {
    if (this.actualRouteLayer && this.map) {
      this.map.removeLayer(this.actualRouteLayer);
      this.actualRouteLayer = null;
    }
  }

  /**
   * Add a waypoint marker to the map
   */
  addWaypointMarker(location: [number, number], indexOverride?: number): L.Marker {
    // Determine where to add the marker: prefer waypointsLayer, fallback to map
    const targetLayer = this.waypointsLayer || this.map;

    // Create marker and add it to the determined layer
    if (!targetLayer) {
      throw new Error('Map not initialized');
    }
    const waypointIndex = indexOverride ?? this.waypoints.length;

    const marker = L.marker(location, {
      draggable: true,
      title: `Waypoint ${waypointIndex + 1}`,
    }).addTo(targetLayer);

    // Bind popup and event listener using the provided location coordinates
    const popupContent = `
      <div style="min-width: 150px;">
        <strong>Waypoint ${waypointIndex + 1}</strong><br/>
        Lat: ${location[0].toFixed(4)}<br/>
        Lng: ${location[1].toFixed(4)}
      </div>
    `;
    marker.bindPopup(popupContent);
    marker.on('dragend', (e: L.DragEndEvent) => {
      const moved = (e.target as L.Marker).getLatLng();
      const nextLocation: [number, number] = [moved.lat, moved.lng];
      this.waypoints[waypointIndex] = nextLocation;
      this.updateWaypointsLine();
      this.waypointMovedCallback?.(waypointIndex, nextLocation);

      marker.setPopupContent(`
        <div style="min-width: 150px;">
          <strong>Waypoint ${waypointIndex + 1}</strong><br/>
          Lat: ${nextLocation[0].toFixed(4)}<br/>
          Lng: ${nextLocation[1].toFixed(4)}
        </div>
      `);
    });

    // Add to waypoints list and update the connecting line
    if (indexOverride === undefined) {
      this.waypoints.push(location);
    } else {
      this.waypoints[indexOverride] = location;
    }
    this.waypointMarkers[waypointIndex] = marker;
    this.updateWaypointsLine();

    return marker;
  }

  /**
   * Remove all waypoint markers
   */
  clearWaypointMarkers(): void {
    if (this.waypointsLayer) {
      this.waypointsLayer.clearLayers();
    }
    if (this.waypointsLine && this.map) {
      this.map.removeLayer(this.waypointsLine);
      this.waypointsLine = null;
    }
    this.waypoints = [];
    this.waypointMarkers = [];
  }

  /**
   * Update all waypoint markers based on a list of coordinates.
   * This clears existing markers and adds new ones with popups.
   * @param locations Array of [lat, lng] coordinates for waypoints.
   */
  updateWaypoints(locations: [number, number][]): void {
    this.clearWaypointMarkers();
    this.waypoints = [...locations];
    if (!this.map) {
      return;
    }

    locations.forEach((location, index) => {
      this.addWaypointMarker(location, index);
    });

    // Update the connecting line
    this.updateWaypointsLine();
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

  setWaypointMovedCallback(callback: ((index: number, location: [number, number]) => void) | null): void {
    this.waypointMovedCallback = callback;
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
    this.plannedRouteLayer = null;
    this.actualRouteLayer = null;
    this.waypointsLayer = null;
    this.waypointsLine = null;
    this.waypoints = [];
    this.waypointMarkers = [];
    this.waypointMovedCallback = null;
  }
}
