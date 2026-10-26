import L from 'leaflet';
import { PixelRect, isSelectModifier, rectFromCorners } from '../utils/waypoints';

/** Smallest mouse move, in pixels, that starts a box. A shorter move is a click. */
const MIN_BOX_PX = 4;

/** Options for {@link BoxSelect}. */
export interface BoxSelectOptions {
  /** Called with the box, in map container pixels, when the mouse is released. */
  onSelect: (rect: PixelRect) => void;
  /**
   * Called when a box ends or is stopped. The map ignores the click that
   * the browser sends after it (see `decideMapClick`).
   */
  onEnd: () => void;
}

/**
 * Ctrl+drag (Cmd+drag on macOS) on the map draws a box to select waypoints.
 *
 * It works like Leaflet's Shift+drag box zoom, but with another key.
 */
export class BoxSelect {
  private readonly map: L.Map;
  private readonly options: BoxSelectOptions;
  private start: L.Point | null = null;
  private box: HTMLElement | null = null;

  /**
   * Start to listen for Ctrl+drag on the map.
   *
   * [1] The listener is on the map container in the capture phase, so it
   *     runs before Leaflet's own `mousedown` listener on the container.
   *     Leaflet starts a map drag on `mousedown`, also with Ctrl down.
   *
   * @param map Leaflet map.
   * @param options Callbacks.
   */
  constructor(map: L.Map, options: BoxSelectOptions) {
    this.map = map;
    this.options = options;
    // See note [1] in the docstring
    map.getContainer().addEventListener('mousedown', this.onMouseDown, true);
  }

  /** Stop to listen and remove a box that is open. */
  destroy(): void {
    this.map.getContainer().removeEventListener('mousedown', this.onMouseDown, true);
    this.finish();
  }

  /**
   * Start a box on a left-button press with Ctrl or Cmd down.
   *
   * [1] A press on a marker, a popup, or a map control is not a box. A
   *     Ctrl+drag of a marker moves it.
   * [2] Stopping the event stops the map drag (Leaflet's listener does not
   *     get it). Preventing the default action stops the text selection.
   * [3] The Esc listener is on the window in the capture phase, so it runs
   *     before the other Esc listeners (for example "clear the selection").
   *
   * @param e Mouse event.
   */
  private readonly onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0 || !isSelectModifier(e)) {
      return;
    }
    // See note [1] in the docstring
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('.leaflet-marker-icon, .leaflet-popup, .leaflet-control')) {
      return;
    }
    // See note [2] in the docstring
    e.stopPropagation();
    e.preventDefault();

    this.finish();
    this.start = this.map.mouseEventToContainerPoint(e);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
    // See note [3] in the docstring
    window.addEventListener('keydown', this.onKeyDown, true);
  };

  /**
   * Draw the box from the start point to the mouse. The box shows only
   * after a move of {@link MIN_BOX_PX} pixels.
   * @param e Mouse event.
   */
  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.start) {
      return;
    }
    const point = this.map.mouseEventToContainerPoint(e);
    if (!this.box) {
      if (point.distanceTo(this.start) < MIN_BOX_PX) {
        return;
      }
      this.box = L.DomUtil.create('div', 'selection-box', this.map.getContainer());
    }
    const rect = rectFromCorners(this.start, point);
    this.box.style.left = `${rect.left}px`;
    this.box.style.top = `${rect.top}px`;
    this.box.style.width = `${rect.right - rect.left}px`;
    this.box.style.height = `${rect.bottom - rect.top}px`;
  };

  /**
   * End the box and send it to the callback. A press without a box (a
   * Ctrl+click) selects nothing.
   * @param e Mouse event.
   */
  private readonly onMouseUp = (e: MouseEvent): void => {
    if (!this.start) {
      return;
    }
    const rect = rectFromCorners(this.start, this.map.mouseEventToContainerPoint(e));
    const hadBox = this.box !== null;
    this.finish();
    if (hadBox) {
      this.options.onSelect(rect);
    }
    this.options.onEnd();
  };

  /**
   * Stop the box with the Esc key. Nothing is selected, and the selection
   * does not change.
   * @param e Keyboard event.
   */
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.finish();
      this.options.onEnd();
    }
  };

  /** Remove the box and the listeners of the open box. */
  private finish(): void {
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.box?.remove();
    this.box = null;
    this.start = null;
  }
}
