import 'leaflet';
import L from 'leaflet';
// Leaflet CSS is loaded from index.html to avoid TS side-effect import typing issues.
import { HomeLocation, Route } from '../types';
import { DEFAULT_HOME_LOCATION } from './StorageManager';
import { t } from '../i18n';
import { convertDistance, unitLabels } from '../utils/speeds';
import { escapeHtml, formatDuration } from '../utils/format';
import { MAX_WAYPOINTS, decideMapClick, geometryToLatLngs } from '../utils/waypoints';

/**
 * Leaflet map with waypoint markers and the calculated route line.
 *
 * The map owns the click-to-add behavior. Code outside this class gets
 * waypoint changes only through {@link setWaypointsChangeHandler}, so there
 * is one source of truth for the waypoint list.
 */
export class MapComponent {
  private static instance: MapComponent;
  private map: L.Map | null = null;
  private routeLayer: L.Polyline | null = null;
  private waypointsLayer: L.LayerGroup | null = null;
  private waypointsLine: L.Polyline | null = null;
  private waypointData: Array<{ location: [number, number]; marker: L.Marker }> = [];
  private onWaypointsChanged: ((locations: [number, number][]) => void) | null = null;
  private onWaypointLimit: (() => void) | null = null;
  private dragging = false;
  private lastDragEndAt = Number.NEGATIVE_INFINITY;
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
   * Initialize the Leaflet map with an OSM tile layer and the click-to-add
   * handler.
   *
   * [1] The click handler is attached here, one time, after the map exists.
   *     Panel re-renders do not attach it again.
   * [2] The map size is calculated again after the layout is complete.
   *
   * @param containerId DOM id of the element to mount the map into.
   * @param homeLocation Initial center/zoom; defaults to
   *   {@link DEFAULT_HOME_LOCATION} when omitted.
   * @throws When Leaflet cannot create the map.
   */
  async init(containerId: string, homeLocation: HomeLocation = DEFAULT_HOME_LOCATION): Promise<void> {
    try {
      this.map = L.map(containerId).setView([homeLocation.lat, homeLocation.lng], homeLocation.zoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(this.map);

      this.waypointsLayer = L.layerGroup().addTo(this.map);

      // See note [1] in the docstring
      this.map.on('click', (e: L.LeafletMouseEvent) => this.handleMapClick(e));

      // See note [2] in the docstring
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
   * Add a waypoint where the user clicks, unless the click comes from a
   * marker drag or the waypoint limit is reached (see {@link decideMapClick}).
   * @param e Leaflet click event.
   */
  private handleMapClick(e: L.LeafletMouseEvent): void {
    const decision = decideMapClick({
      dragging: this.dragging,
      msSinceDragEnd: Date.now() - this.lastDragEndAt,
      count: this.waypointData.length,
    });

    if (decision === 'limit') {
      this.onWaypointLimit?.();
      return;
    }
    if (decision === 'add') {
      this.addWaypointMarker([e.latlng.lat, e.latlng.lng]);
    }
  }

  /**
   * End the marker drag state and record the time. A second call for the
   * same drag does nothing, so the first release keeps its time.
   */
  private endDragState(): void {
    if (this.dragging) {
      this.dragging = false;
      this.lastDragEndAt = Date.now();
    }
  }

  /**
   * Draw the thin line that connects the waypoints, replacing the old one.
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
   * A new call replaces the previous handler.
   *
   * @param handler Receives the current ordered list of `[lat, lon]` locations.
   */
  setWaypointsChangeHandler(handler: (locations: [number, number][]) => void): void {
    this.onWaypointsChanged = handler;
  }

  /**
   * Register a handler called when a map click cannot add a waypoint because
   * the route has {@link MAX_WAYPOINTS} waypoints. A new call replaces the
   * previous handler.
   *
   * @param handler Called with no arguments.
   */
  setWaypointLimitHandler(handler: () => void): void {
    this.onWaypointLimit = handler;
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
    if (!this.map) {
      return;
    }

    if (this.routeLayer) {
      this.map.removeLayer(this.routeLayer);
    }

    const polyline = L.polyline(geometryToLatLngs(route.geometry), {
      color: '#e74c3c',
      weight: 4,
      opacity: 0.8,
      dashArray: '10, 10',
    }).addTo(this.map);

    this.routeLayer = polyline;

    const distance = convertDistance(route.distance, this.settings.units);
    const unitLabel = unitLabels(this.settings.units).distance;
    const basisLine = options?.basisText ? `<br/>${escapeHtml(options.basisText)}` : '';

    const popupContent = `
      <div class="map-popup">
        <strong>${escapeHtml(route.name)}</strong><br/>
        ${escapeHtml(t('distanceLabel'))} ${distance} ${unitLabel}<br/>
        ${escapeHtml(t('durationLabel'))} ${escapeHtml(formatDuration(route.duration))}${basisLine}
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

  /**
   * Build the popup HTML for a waypoint marker.
   * @param label Translated title, for example "Start Point".
   * @param location `[lat, lng]` of the waypoint.
   * @returns Popup HTML with a "Delete this point" link.
   */
  private waypointPopupHtml(label: string, location: [number, number]): string {
    return `
      <div class="map-popup">
        <strong>${escapeHtml(label)}</strong><br/>
        ${escapeHtml(t('popupLat'))} ${location[0].toFixed(4)}<br/>
        ${escapeHtml(t('popupLng'))} ${location[1].toFixed(4)}<br/>
        <a href="#" class="delete-waypoint-btn">${escapeHtml(t('popupDeletePoint'))}</a>
      </div>
    `;
  }

  /**
   * Create a draggable marker with a delete link in its popup.
   *
   * [1] The drag flag and the drag end time let {@link handleMapClick}
   *     ignore the map click that Leaflet can send at the end of a drag.
   *     Any pointer or mouse release also ends the drag state, so the flag
   *     cannot stay on if Leaflet does not send `dragend`.
   * [2] The line follows the marker during the drag. The change handler
   *     gets the new location only when the drag ends.
   *
   * @param location `[lat, lng]` of the new marker.
   * @returns The marker, already added to the waypoint layer.
   * @throws When the map is not initialized.
   */
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
    marker.bindPopup(this.waypointPopupHtml(t('popupWaypoint'), location));

    // See note [1] in the docstring
    marker.on('dragstart', () => {
      this.dragging = true;
      const release = (): void => this.endDragState();
      for (const type of ['pointerup', 'mouseup', 'touchend', 'pointercancel']) {
        document.addEventListener(type, release, { capture: true, once: true });
      }
    });

    // See note [2] in the docstring
    marker.on('drag', () => {
      const ll = marker.getLatLng();
      const idx = this.waypointData.findIndex((d) => d.marker === marker);
      if (idx !== -1) {
        this.waypointData[idx].location = [ll.lat, ll.lng];
        this.updateWaypointsLine();
      }
    });

    marker.on('dragend', () => {
      this.endDragState();
      const ll = marker.getLatLng();
      const idx = this.waypointData.findIndex((d) => d.marker === marker);
      if (idx !== -1) {
        this.waypointData[idx].location = [ll.lat, ll.lng];
        this.refreshAllMarkerStyles();
        this.updateWaypointsLine();
        this.notifyWaypointsChanged();
      }
    });

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
   * @returns The created Leaflet marker, or `null` when
   *   {@link MAX_WAYPOINTS} is reached.
   */
  addWaypointMarker(location: [number, number]): L.Marker | null {
    if (this.waypointData.length >= MAX_WAYPOINTS) {
      this.onWaypointLimit?.();
      return null;
    }
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

  /**
   * Set the color and popup of every marker from its position: green for
   * the start, red for the end, blue between.
   */
  private refreshAllMarkerStyles(): void {
    const n = this.waypointData.length;
    this.waypointData.forEach((entry, i) => {
      const isFirst = i === 0;
      const isLast = i === n - 1;
      const color = isFirst ? 'green' : isLast ? 'red' : 'blue';
      entry.marker.setIcon(this.createWaypointIcon(color));

      let label = t('popupWaypointN', { n: i + 1 });
      if (isFirst) label = t('popupStartPoint');
      if (isLast) label = t('popupEndPoint');
      entry.marker.setPopupContent(this.waypointPopupHtml(label, entry.location));
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
   * `locations`, then refresh visuals and notify listeners. Locations past
   * {@link MAX_WAYPOINTS} are dropped.
   *
   * @param locations Ordered `[lat, lon]` coordinates; an empty list clears.
   */
  updateWaypoints(locations: [number, number][]): void {
    this.clearWaypointMarkers();
    if (!this.map || locations.length === 0) {
      return;
    }
    locations.slice(0, MAX_WAYPOINTS).forEach((loc) => this.addWaypointInternal(loc));
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
   * Get the current map center and zoom.
   * @returns The view as a home location, or `null` before {@link init}.
   */
  getCurrentView(): HomeLocation | null {
    if (!this.map) {
      return null;
    }
    const center = this.map.getCenter();
    return { lat: center.lat, lng: center.lng, zoom: this.map.getZoom() };
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
    this.dragging = false;
    this.lastDragEndAt = Number.NEGATIVE_INFINITY;
  }
}
