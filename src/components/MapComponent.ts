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
  private waypoints: [number, number][] = [];
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
      const line = L.polyline(this.waypoints, { color: 'blue', weight: 2 });
      this.map?.addLayer(line);
      this.waypointsLine = line;
    } else {
      this.waypointsLine = null;
    }
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

  /**
   * Add a waypoint marker to the map
   */
  addWaypointMarker(location: [number, number]): L.CircleMarker {
    // Determine where to add the marker: prefer waypointsLayer, fallback to map
    const targetLayer = this.waypointsLayer || this.map;

    // Add to waypoints list first to determine color
    this.waypoints.push(location);

    // Create marker and add it to the determined layer
    if (!targetLayer) {
      throw new Error('Map not initialized');
    }
    const color = this.waypoints.length === 1 ? 'green' : 'red';
    const marker = L.circleMarker(location, { color, radius: 5 }).addTo(targetLayer);

    // Bind popup and event listener using the provided location coordinates
    const label = this.waypoints.length === 1 ? 'Start Point' : 'End Point';
    const popupContent = `
      <div style="min-width: 150px;">
        <strong>${label}</strong><br/>
        Lat: ${location[0].toFixed(4)}<br/>
        Lng: ${location[1].toFixed(4)}
      </div>
    `;
    marker.bindPopup(popupContent);
    marker.on('click', () => {
      // Popup is now bound and will show on click
    });

    // Update the connecting line
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
  }

  /**
   * Update all waypoint markers based on a list of coordinates.
   * This clears existing markers and adds new ones with popups.
   * @param locations Array of [lat, lng] coordinates for waypoints.
   */
  updateWaypoints(locations: [number, number][]): void {
    this.clearWaypointMarkers();
    this.waypoints = locations; // Update the waypoints list
    if (!this.map) {
      return;
    }

    locations.forEach((location, index) => {
      // Create marker and add it to the layer group or map
      const targetLayer = this.waypointsLayer || this.map;
      if (!targetLayer) {
        return;
      }
      let color = 'blue';
      if (index === 0) {
        color = 'green';
      } else if (index === locations.length - 1) {
        color = 'red';
      }
      const marker = L.circleMarker(location, { color, radius: 5 }).addTo(targetLayer);

      // Bind popup and event listener immediately after creation
      let label = `Waypoint ${index + 1}`;
      if (index === 0) {
        label = 'Start Point';
      } else if (index === locations.length - 1) {
        label = 'End Point';
      }
      const popupContent = `
        <div style="min-width: 150px;">
          <strong>${label}</strong><br/>
          Lat: ${location[0].toFixed(4)}<br/>
          Lng: ${location[1].toFixed(4)}
        </div>
      `;
      marker.bindPopup(popupContent);
      marker.on('click', () => {
        // Popup is now bound and will show on click
      });
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
    this.waypoints = [];
  }
}
