import 'leaflet';
import L from 'leaflet';
// Leaflet CSS is loaded from index.html to avoid TS side-effect import typing issues.
import { HomeLocation, Route } from '../types';
import { DEFAULT_HOME_LOCATION } from './StorageManager';
import { t } from '../i18n';
import { convertDistance, unitLabels } from '../utils/speeds';
import { escapeHtml, formatDuration } from '../utils/format';
import {
  MAX_WAYPOINTS,
  MapClickState,
  PixelRect,
  WaypointRole,
  decideMapClick,
  geometryToLatLngs,
  isSelectModifier,
  nearestSegment,
  pointsInRect,
  unwrapPath,
  waypointRole,
  wrapLatLng,
} from '../utils/waypoints';
import { BoxSelect } from './BoxSelect';

/**
 * Map pane for the invisible line that gets the clicks to add a point. It is
 * above the overlay pane (400, route line) and below the markers (600).
 */
const WAYPOINT_LINE_PANE = 'waypointLinePane';

/** One waypoint on the map. */
interface WaypointEntry {
  /**
   * `[lat, lng]` of the marker. The longitude can be outside -180 to 180
   * (see {@link MapComponent}).
   */
  location: [number, number];
  /** The draggable marker. */
  marker: L.Marker;
  /** `true` when the user selected the waypoint. */
  selected: boolean;
}

/** State of a drag that moves all selected waypoints together. */
interface GroupDrag {
  /** The waypoint whose marker the user drags. */
  anchor: WaypointEntry;
  /** Map zoom at the start. The pixel positions use this zoom. */
  zoom: number;
  /** Pixel position of the anchor at the start. */
  anchorStart: L.Point;
  /** The other selected waypoints, with their pixel positions at the start. */
  others: { entry: WaypointEntry; start: L.Point }[];
}

/**
 * Check if an event comes from a place where the user types text.
 * @param target Event target.
 * @returns `true` for an input, a select, a text area, or editable content.
 */
function isTextEntry(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches('input, select, textarea'));
}

/**
 * Leaflet map with waypoint markers and the calculated route line.
 *
 * The map owns the click-to-add behavior. Code outside this class gets
 * waypoint changes only through {@link setWaypointsChangeHandler}, so there
 * is one source of truth for the waypoint list.
 *
 * [1] Leaflet shows copies of the world side by side. The markers stay where
 *     the user puts them, also on a copy, so the longitude of a marker can be
 *     outside -180 to 180. The change handler always gets longitudes from
 *     -180 to 180, and paths from outside are drawn in one piece (see
 *     `unwrapPath`).
 * [2] The user can select waypoints with Ctrl+click or Ctrl+drag (Cmd on
 *     macOS). A drag of a selected marker moves all selected waypoints. The
 *     selection bar, the Delete or Backspace key, and the Esc key act on the
 *     selection.
 */
export class MapComponent {
  private static instance: MapComponent;
  private map: L.Map | null = null;
  private boxSelect: BoxSelect | null = null;
  private selectionBar: HTMLElement | null = null;
  private groupDrag: GroupDrag | null = null;
  private routeLayer: L.Polyline | null = null;
  private waypointsLayer: L.LayerGroup | null = null;
  private waypointsLine: L.Polyline | null = null;
  private waypointsHitLine: L.Polyline | null = null;
  private waypointData: WaypointEntry[] = [];
  private waypointPopup: L.Popup | null = null;
  private popupMarker: L.Marker | null = null;
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
   * [1] When the user pans to another copy of the world, the map moves back
   *     to the main copy. Thus most clicks give longitudes from -180 to 180.
   * [2] The click handler is attached here, one time, after the map exists.
   *     Panel re-renders do not attach it again. The same applies to the
   *     selection box, the selection bar, and the keys.
   * [3] The map size is calculated again after the layout is complete.
   * [4] The browser sends a click when a selection box ends. The click
   *     guard of a marker drag also ignores this click.
   *
   * @param containerId DOM id of the element to mount the map into.
   * @param homeLocation Initial center/zoom; defaults to
   *   {@link DEFAULT_HOME_LOCATION} when omitted.
   * @throws When Leaflet cannot create the map.
   */
  async init(containerId: string, homeLocation: HomeLocation = DEFAULT_HOME_LOCATION): Promise<void> {
    try {
      // See note [1] in the docstring
      this.map = L.map(containerId, { worldCopyJump: true }).setView(
        [homeLocation.lat, homeLocation.lng],
        homeLocation.zoom
      );

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(this.map);

      this.waypointsLayer = L.layerGroup().addTo(this.map);
      const linePane = this.map.createPane(WAYPOINT_LINE_PANE);
      linePane.style.zIndex = '450';

      // See note [2] in the docstring
      this.map.on('click', (e: L.LeafletMouseEvent) => this.handleMapClick(e));
      this.boxSelect = new BoxSelect(this.map, {
        onSelect: (rect) => this.selectInRect(rect),
        // See note [4] in the docstring
        onEnd: () => {
          this.lastDragEndAt = Date.now();
        },
      });
      this.createSelectionBar(this.map);
      document.addEventListener('keydown', this.handleKeyDown);

      // See note [3] in the docstring
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
   * Collect the state that {@link decideMapClick} needs for a click.
   * @param e Browser mouse event of the click.
   * @returns Drag, key, and waypoint state now.
   */
  private clickState(e: MouseEvent): MapClickState {
    return {
      dragging: this.dragging,
      msSinceDragEnd: Date.now() - this.lastDragEndAt,
      count: this.waypointData.length,
      modifier: isSelectModifier(e),
      selectedCount: this.getSelectedCount(),
    };
  }

  /**
   * Add a waypoint where the user clicks, or clear the selection (see
   * {@link decideMapClick}).
   * @param e Leaflet click event.
   */
  private handleMapClick(e: L.LeafletMouseEvent): void {
    const decision = decideMapClick(this.clickState(e.originalEvent));

    if (decision === 'limit') {
      this.onWaypointLimit?.();
      return;
    }
    if (decision === 'deselect') {
      this.clearSelection();
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
   * Add a waypoint on the line between two waypoints, at the place nearest
   * to the click.
   *
   * [1] The rules of a map click apply (see {@link decideMapClick}): no
   *     point from a drag or with Ctrl or Cmd down, a clear of the selection
   *     when waypoints are selected, and a message at the limit.
   * [2] The new point is on the line, so the route shape does not change
   *     until the user drags the point. A click on the round end of the line
   *     at a waypoint adds nothing, because a point is already there.
   *
   * @param e Leaflet click event of the invisible line.
   */
  private handleLineClick(e: L.LeafletMouseEvent): void {
    if (!this.map) {
      return;
    }
    // See note [1] in the docstring
    const decision = decideMapClick(this.clickState(e.originalEvent));
    if (decision === 'limit') {
      this.onWaypointLimit?.();
      return;
    }
    if (decision === 'deselect') {
      this.clearSelection();
      return;
    }
    if (decision !== 'add') {
      return;
    }

    // See note [2] in the docstring
    const map = this.map;
    const points = this.waypointData.map((d) => map.project(d.location));
    const nearest = nearestSegment(points, map.project(e.latlng));
    if (!nearest || nearest.t === 0 || nearest.t === 1) {
      return;
    }
    const location = map.unproject(L.point(nearest.point.x, nearest.point.y));
    this.insertWaypoint(nearest.index + 1, [location.lat, location.lng]);
  }

  /**
   * Draw the lines that connect the waypoints, or remove them when there are
   * fewer than two waypoints.
   *
   * [1] The lines are moved, not made again, because a marker drag calls
   *     this method many times.
   * [2] The thin blue line is only for the eye. It gets no clicks.
   * [3] A wide, invisible line on top gets the clicks that add a point (see
   *     {@link handleLineClick}). Its clicks do not go on to the map, so they
   *     do not also add a point at the end of the route.
   */
  private updateWaypointsLine(): void {
    const locations = this.getWaypointLocations();
    if (!this.map || locations.length < 2) {
      this.removeWaypointLines();
      return;
    }
    // See note [1] in the docstring
    if (this.waypointsLine && this.waypointsHitLine) {
      this.waypointsLine.setLatLngs(locations);
      this.waypointsHitLine.setLatLngs(locations);
      return;
    }
    // See note [2] in the docstring
    this.waypointsLine = L.polyline(locations, { color: 'blue', weight: 2, interactive: false }).addTo(this.map);
    // See note [3] in the docstring
    this.waypointsHitLine = L.polyline(locations, {
      pane: WAYPOINT_LINE_PANE,
      color: 'blue',
      weight: 16,
      opacity: 0,
      className: 'waypoint-line-hit',
      bubblingMouseEvents: false,
    }).addTo(this.map);
    this.waypointsHitLine.on('click', (e: L.LeafletMouseEvent) => this.handleLineClick(e));
  }

  /** Remove both waypoint lines from the map, if present. */
  private removeWaypointLines(): void {
    for (const line of [this.waypointsLine, this.waypointsHitLine]) {
      if (line) {
        this.map?.removeLayer(line);
      }
    }
    this.waypointsLine = null;
    this.waypointsHitLine = null;
  }

  /** Get the marker locations, as shown on the map. */
  private getWaypointLocations(): [number, number][] {
    return this.waypointData.map((d) => d.location);
  }

  /** Send the waypoint locations, with longitudes from -180 to 180, to the change handler. */
  private notifyWaypointsChanged(): void {
    if (this.onWaypointsChanged) {
      this.onWaypointsChanged(this.getWaypointLocations().map(wrapLatLng));
    }
  }

  /**
   * Register a handler called when waypoints are added, removed, or moved (drag).
   * A new call replaces the previous handler.
   *
   * @param handler Receives the current ordered list of `[lat, lon]`
   *   locations, with longitudes from -180 to 180.
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
   * [1] The line is drawn on the same copy of the world as the markers.
   * [2] The route line gets no clicks: a click on the line adds a waypoint
   *     (see {@link handleLineClick}). Thus the popup opens one time, now.
   *     It does not move the map, so a zoomed-in view stays as it is.
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

    // See note [1] in the docstring
    const latLngs = unwrapPath(geometryToLatLngs(route.geometry), this.waypointData[0]?.location[1]);
    // See note [2] in the docstring
    const polyline = L.polyline(latLngs, {
      color: '#e74c3c',
      weight: 4,
      opacity: 0.8,
      dashArray: '10, 10',
      interactive: false,
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

    polyline.bindPopup(popupContent, { autoPan: false }).openPopup();
  }

  /** Remove the rendered route polyline from the map, if present. */
  clearRoute(): void {
    if (this.routeLayer && this.map) {
      this.map.removeLayer(this.routeLayer);
      this.routeLayer = null;
    }
  }

  /**
   * Make the round marker icon. The CSS classes set the color and the ring
   * of a selected waypoint.
   * @param role Position of the waypoint in the route.
   * @param selected `true` when the waypoint is selected.
   * @returns The Leaflet icon.
   */
  private createWaypointIcon(role: WaypointRole, selected: boolean): L.DivIcon {
    const classes = ['waypoint-dot', `waypoint-dot--${role}`];
    if (selected) {
      classes.push('is-selected');
    }
    return L.divIcon({
      className: '',
      html: `<div class="${classes.join(' ')}"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      popupAnchor: [0, -8],
    });
  }

  /**
   * Get the popup title of the waypoint at a position.
   * @param index Zero-based position of the waypoint.
   * @returns Translated text, for example "Start Point" or "Waypoint 3".
   */
  private waypointLabel(index: number): string {
    const role = waypointRole(index, this.waypointData.length);
    if (role === 'start') return t('popupStartPoint');
    if (role === 'end') return t('popupEndPoint');
    return t('popupWaypointN', { n: index + 1 });
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
   * Open the popup of a waypoint marker. Only one waypoint popup is open at
   * a time.
   *
   * [1] The content is built now, so the label and the coordinates are
   *     always current.
   * [2] The marker is the popup source, so the popup uses the anchor of the
   *     marker icon.
   *
   * @param marker A marker in the waypoint list.
   */
  private openWaypointPopup(marker: L.Marker): void {
    const index = this.waypointData.findIndex((d) => d.marker === marker);
    if (index === -1 || !this.map) {
      return;
    }

    // See note [1] in the docstring
    const content = document.createElement('div');
    content.innerHTML = this.waypointPopupHtml(
      this.waypointLabel(index),
      wrapLatLng(this.waypointData[index].location)
    );
    content.querySelector<HTMLElement>('.delete-waypoint-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      const current = this.waypointData.findIndex((d) => d.marker === marker);
      if (current !== -1) {
        this.removeWaypoint(current);
      }
    });

    // See note [2] in the docstring
    this.waypointPopup = L.popup({}, marker).setLatLng(marker.getLatLng()).setContent(content).openOn(this.map);
    this.popupMarker = marker;
  }

  /**
   * Open the popup of a marker, or close it when it is already open.
   * @param marker A marker in the waypoint list.
   */
  private toggleWaypointPopup(marker: L.Marker): void {
    if (this.popupMarker === marker && this.waypointPopup && this.map?.hasLayer(this.waypointPopup)) {
      this.closeWaypointPopup();
    } else {
      this.openWaypointPopup(marker);
    }
  }

  /** Close the waypoint popup, if it is open. */
  private closeWaypointPopup(): void {
    if (this.waypointPopup && this.map) {
      this.map.closePopup(this.waypointPopup);
    }
    this.waypointPopup = null;
    this.popupMarker = null;
  }

  /**
   * Create a draggable marker. A click or the Enter key opens its popup.
   * Ctrl+click or Cmd+click selects it.
   *
   * [1] The marker does not use `bindPopup`, because `bindPopup` opens the
   *     popup on each click. The click handler can then select the waypoint
   *     instead.
   * [2] The drag flag and the drag end time let {@link handleMapClick}
   *     ignore the map click that Leaflet can send at the end of a drag.
   *     Any pointer or mouse release also ends the drag state, so the flag
   *     cannot stay on if Leaflet does not send `dragend`.
   * [3] When the marker is selected and other waypoints are selected too,
   *     the drag moves all of them (see {@link moveGroup}).
   * [4] The line follows the markers during the drag. The change handler
   *     gets the new locations one time, when the drag ends.
   *
   * @param location `[lat, lng]` of the new marker.
   * @returns The marker, already added to the waypoint layer.
   * @throws When the map is not initialized.
   */
  private createDraggableWaypointMarker(location: [number, number]): L.Marker {
    const marker = L.marker(location, {
      icon: this.createWaypointIcon('middle', false),
      draggable: true,
      riseOnHover: true,
    });

    const targetLayer = this.waypointsLayer || this.map;
    if (!targetLayer) {
      throw new Error('Map not initialized');
    }
    marker.addTo(targetLayer);

    // See note [1] in the docstring
    marker.on('click', (e: L.LeafletMouseEvent) => {
      if (isSelectModifier(e.originalEvent)) {
        this.toggleSelection(marker);
      } else {
        this.toggleWaypointPopup(marker);
      }
    });
    marker.on('keypress', (e: L.LeafletKeyboardEvent) => {
      if (e.originalEvent.key === 'Enter') {
        this.toggleWaypointPopup(marker);
      }
    });

    // See note [2] in the docstring
    marker.on('dragstart', () => {
      this.dragging = true;
      this.closeWaypointPopup();
      const release = (): void => this.endDragState();
      for (const type of ['pointerup', 'mouseup', 'touchend', 'pointercancel']) {
        document.addEventListener(type, release, { capture: true, once: true });
      }
      // See note [3] in the docstring
      this.startGroupDrag(marker);
    });

    // See note [4] in the docstring
    marker.on('drag', () => {
      const ll = marker.getLatLng();
      const idx = this.waypointData.findIndex((d) => d.marker === marker);
      if (idx !== -1) {
        this.waypointData[idx].location = [ll.lat, ll.lng];
        this.moveGroup();
        this.updateWaypointsLine();
      }
    });

    marker.on('dragend', () => {
      this.endDragState();
      const ll = marker.getLatLng();
      const idx = this.waypointData.findIndex((d) => d.marker === marker);
      if (idx !== -1) {
        this.waypointData[idx].location = [ll.lat, ll.lng];
        this.moveGroup();
        this.refreshAllMarkerStyles();
        this.updateWaypointsLine();
        this.notifyWaypointsChanged();
      }
      this.groupDrag = null;
    });

    return marker;
  }

  /**
   * Prepare a group drag when the dragged marker is one of two or more
   * selected waypoints. Otherwise only the dragged marker moves.
   * @param marker The marker that the user starts to drag.
   */
  private startGroupDrag(marker: L.Marker): void {
    this.groupDrag = null;
    const anchor = this.waypointData.find((d) => d.marker === marker);
    if (!this.map || !anchor?.selected || this.getSelectedCount() < 2) {
      return;
    }
    const map = this.map;
    const zoom = map.getZoom();
    this.groupDrag = {
      anchor,
      zoom,
      anchorStart: map.project(anchor.location, zoom),
      others: this.waypointData
        .filter((d) => d.selected && d !== anchor)
        .map((entry) => ({ entry, start: map.project(entry.location, zoom) })),
    };
  }

  /**
   * Move the other selected markers of a group drag by the same pixel
   * offset as the dragged marker.
   *
   * [1] The offset is in pixels at the zoom of the start. Thus the shape of
   *     the group does not change, also far from the equator, and also if
   *     the zoom changes during the drag.
   */
  private moveGroup(): void {
    const group = this.groupDrag;
    if (!group || !this.map) {
      return;
    }
    // See note [1] in the docstring
    const offset = this.map.project(group.anchor.location, group.zoom).subtract(group.anchorStart);
    for (const { entry, start } of group.others) {
      const ll = this.map.unproject(start.add(offset), group.zoom);
      entry.marker.setLatLng(ll);
      entry.location = [ll.lat, ll.lng];
    }
  }

  /** Get the number of selected waypoints. */
  private getSelectedCount(): number {
    return this.waypointData.filter((d) => d.selected).length;
  }

  /**
   * Select or unselect the waypoint at a position and update its icon.
   * @param index Zero-based position of the waypoint.
   * @param selected New state.
   */
  private setSelected(index: number, selected: boolean): void {
    const entry = this.waypointData[index];
    if (!entry || entry.selected === selected) {
      return;
    }
    entry.selected = selected;
    entry.marker.setIcon(this.createWaypointIcon(waypointRole(index, this.waypointData.length), selected));
  }

  /**
   * Select a waypoint, or unselect it when it is selected.
   * @param marker A marker in the waypoint list.
   */
  private toggleSelection(marker: L.Marker): void {
    const index = this.waypointData.findIndex((d) => d.marker === marker);
    if (index !== -1) {
      this.setSelected(index, !this.waypointData[index].selected);
      this.updateSelectionBar();
    }
  }

  /**
   * Add the waypoints in a box to the selection. Only the waypoints that
   * show in the box on the screen are selected.
   * @param rect Box in map container pixels.
   */
  private selectInRect(rect: PixelRect): void {
    const map = this.map;
    if (!map) {
      return;
    }
    const points = this.waypointData.map((d) => map.latLngToContainerPoint(d.location));
    for (const index of pointsInRect(points, rect)) {
      this.setSelected(index, true);
    }
    this.updateSelectionBar();
  }

  /** Unselect all waypoints. */
  private clearSelection(): void {
    this.waypointData.forEach((_, i) => this.setSelected(i, false));
    this.updateSelectionBar();
  }

  /** Remove all selected waypoints (one change notification). */
  private deleteSelected(): void {
    const indices: number[] = [];
    this.waypointData.forEach((d, i) => {
      if (d.selected) {
        indices.push(i);
      }
    });
    this.removeWaypoints(indices);
  }

  /**
   * Delete or unselect the selected waypoints from the keyboard: Delete or
   * Backspace deletes them, Esc unselects them.
   *
   * [1] The keys do nothing when no waypoint is selected, when the user
   *     types in a field, or when a modal is open.
   * [2] Backspace is accepted too, because many laptop keyboards have no
   *     Delete key. The default action (for example "go back") is stopped.
   *
   * @param e Keyboard event.
   */
  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    // See note [1] in the docstring
    if (this.getSelectedCount() === 0 || isTextEntry(e.target) || document.querySelector('dialog[open]')) {
      return;
    }
    // See note [2] in the docstring
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.deleteSelected();
    } else if (e.key === 'Escape') {
      this.clearSelection();
    }
  };

  /**
   * Make the selection bar: a map control at the top right with the count
   * and the Delete and Clear buttons. It shows only when waypoints are
   * selected.
   *
   * [1] Clicks and scrolls on the bar do not go on to the map.
   *
   * @param map Leaflet map.
   */
  private createSelectionBar(map: L.Map): void {
    const bar = L.DomUtil.create('div', 'leaflet-bar selection-bar');
    bar.hidden = true;
    bar.innerHTML = `
      <span class="selection-count" role="status"></span>
      <button type="button" class="btn btn-small btn-danger" data-action="delete"></button>
      <button type="button" class="btn btn-small btn-secondary" data-action="clear"></button>
    `;
    // See note [1] in the docstring
    L.DomEvent.disableClickPropagation(bar);
    L.DomEvent.disableScrollPropagation(bar);
    bar.addEventListener('click', (e) => {
      const action = e.target instanceof Element ? e.target.closest('[data-action]')?.getAttribute('data-action') : null;
      if (action === 'delete') {
        this.deleteSelected();
      } else if (action === 'clear') {
        this.clearSelection();
      }
    });

    const control = new L.Control({ position: 'topright' });
    control.onAdd = (): HTMLElement => bar;
    control.addTo(map);
    this.selectionBar = bar;
    this.updateSelectionBar();
  }

  /** Show the selection count and the button text, or hide the bar when nothing is selected. */
  private updateSelectionBar(): void {
    const bar = this.selectionBar;
    if (!bar) {
      return;
    }
    const count = this.getSelectedCount();
    bar.hidden = count === 0;
    const setText = (selector: string, text: string): void => {
      const el = bar.querySelector(selector);
      if (el) el.textContent = text;
    };
    setText('.selection-count', t('selectionCount', { n: count }));
    setText('[data-action="delete"]', t('deleteSelectedButton'));
    setText('[data-action="clear"]', t('clearSelectionButton'));
  }

  /**
   * Add a waypoint at the end of the route (see {@link insertWaypoint}).
   *
   * @param location `[lat, lon]` coordinate for the new waypoint.
   * @returns The created Leaflet marker, or `null` when
   *   {@link MAX_WAYPOINTS} is reached.
   */
  addWaypointMarker(location: [number, number]): L.Marker | null {
    return this.insertWaypoint(this.waypointData.length, location);
  }

  /**
   * Add a waypoint at a position in the route. Refreshes the marker colors
   * and the line, and notifies the change handler one time.
   *
   * @param index Zero-based position for the new waypoint. Values out of
   *   range add it at the start or at the end.
   * @param location `[lat, lon]` coordinate for the new waypoint.
   * @returns The created Leaflet marker, or `null` when
   *   {@link MAX_WAYPOINTS} is reached (the limit handler is called).
   */
  insertWaypoint(index: number, location: [number, number]): L.Marker | null {
    if (this.waypointData.length >= MAX_WAYPOINTS) {
      this.onWaypointLimit?.();
      return null;
    }
    this.closeWaypointPopup();
    const position = Math.max(0, Math.min(index, this.waypointData.length));
    const marker = this.createDraggableWaypointMarker(location);
    this.waypointData.splice(position, 0, { location, marker, selected: false });
    this.refreshAllMarkerStyles();
    this.updateWaypointsLine();
    this.notifyWaypointsChanged();
    return marker;
  }

  private addWaypointInternal(location: [number, number]): L.Marker {
    const marker = this.createDraggableWaypointMarker(location);
    this.waypointData.push({ location, marker, selected: false });
    return marker;
  }

  /**
   * Remove a marker from the map.
   * @param marker A waypoint marker.
   */
  private removeMarkerLayer(marker: L.Marker): void {
    if (this.waypointsLayer) {
      this.waypointsLayer.removeLayer(marker);
    } else if (this.map) {
      this.map.removeLayer(marker);
    }
  }

  /**
   * Remove the waypoint at an index. Updates visuals and notifies listeners.
   * @param index Zero-based position; out-of-range values are ignored.
   */
  removeWaypoint(index: number): void {
    this.removeWaypoints([index]);
  }

  /**
   * Remove the waypoints at some indexes. Refreshes the marker colors and the
   * line, and notifies the change handler one time.
   * @param indices Zero-based positions, in any order. Values out of range
   *   and repeated values are ignored.
   */
  removeWaypoints(indices: readonly number[]): void {
    const toRemove = new Set(indices.filter((i) => Number.isInteger(i) && i >= 0 && i < this.waypointData.length));
    if (toRemove.size === 0) {
      return;
    }
    this.closeWaypointPopup();
    this.waypointData = this.waypointData.filter((entry, i) => {
      if (!toRemove.has(i)) {
        return true;
      }
      this.removeMarkerLayer(entry.marker);
      return false;
    });
    this.refreshAllMarkerStyles();
    this.updateWaypointsLine();
    this.updateSelectionBar();
    this.notifyWaypointsChanged();
  }

  /**
   * Set the icon of every marker from its position (green start, blue
   * middle, red end) and its selection state.
   */
  private refreshAllMarkerStyles(): void {
    const n = this.waypointData.length;
    this.waypointData.forEach((entry, i) => {
      entry.marker.setIcon(this.createWaypointIcon(waypointRole(i, n), entry.selected));
    });
  }

  /**
   * Build the open waypoint popup and the selection bar text again (e.g.
   * after a language change).
   */
  refreshMarkerLabels(): void {
    const marker = this.popupMarker;
    if (marker && this.waypointPopup && this.map?.hasLayer(this.waypointPopup)) {
      this.openWaypointPopup(marker);
    }
    this.updateSelectionBar();
  }

  /**
   * Remove all waypoint markers and the connecting line, then notify
   * listeners. The selection is cleared too.
   */
  clearWaypointMarkers(): void {
    const had = this.waypointData.length > 0;
    this.closeWaypointPopup();
    if (this.waypointsLayer) {
      this.waypointsLayer.clearLayers();
    } else if (this.map) {
      this.waypointData.forEach((d) => this.map?.removeLayer(d.marker));
    }
    this.removeWaypointLines();
    this.waypointData = [];
    this.updateSelectionBar();
    if (had) {
      this.notifyWaypointsChanged();
    }
  }

  /**
   * Replace all waypoint markers with draggable/deletable ones built from
   * `locations`, then refresh visuals and notify listeners. Locations past
   * {@link MAX_WAYPOINTS} are dropped.
   *
   * [1] A route that crosses the 180° meridian is drawn in one piece.
   *
   * @param locations Ordered `[lat, lon]` coordinates; an empty list clears.
   */
  updateWaypoints(locations: [number, number][]): void {
    this.clearWaypointMarkers();
    if (!this.map || locations.length === 0) {
      return;
    }
    // See note [1] in the docstring
    unwrapPath(locations.slice(0, MAX_WAYPOINTS)).forEach((loc) => this.addWaypointInternal(loc));
    this.refreshAllMarkerStyles();
    this.updateWaypointsLine();
    this.notifyWaypointsChanged();
  }

  /**
   * Fit the map view to show all given waypoints. The points are placed as
   * in {@link updateWaypoints}.
   * @param waypoints `[lat, lon]` list; needs at least two points to act.
   */
  fitBounds(waypoints: [number, number][]): void {
    if (waypoints.length >= 2 && this.map) {
      const bounds = L.latLngBounds(unwrapPath(waypoints));
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
   * @returns The view as a home location, with a longitude from -180 to
   *   180, or `null` before {@link init}.
   */
  getCurrentView(): HomeLocation | null {
    if (!this.map) {
      return null;
    }
    const center = this.map.getCenter().wrap();
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
    this.boxSelect?.destroy();
    this.boxSelect = null;
    document.removeEventListener('keydown', this.handleKeyDown);
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.selectionBar = null;
    this.groupDrag = null;
    this.routeLayer = null;
    this.waypointsLayer = null;
    this.waypointsLine = null;
    this.waypointsHitLine = null;
    this.waypointData = [];
    this.waypointPopup = null;
    this.popupMarker = null;
    this.dragging = false;
    this.lastDragEndAt = Number.NEGATIVE_INFINITY;
  }
}
