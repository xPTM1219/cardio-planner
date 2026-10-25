import { describe, expect, it } from 'vitest';
import {
  DRAG_CLICK_GUARD_MS,
  MAX_WAYPOINTS,
  decideMapClick,
  formatLatLng,
  geometryToLatLngs,
  isLatLng,
} from './waypoints';

describe('decideMapClick', () => {
  const idle = { dragging: false, msSinceDragEnd: Infinity, count: 0 };

  it('adds a waypoint for a normal click', () => {
    expect(decideMapClick(idle)).toBe('add');
  });

  it('ignores clicks while a marker is dragged', () => {
    expect(decideMapClick({ ...idle, dragging: true })).toBe('ignore');
  });

  it('ignores clicks right after a drag ends, then accepts them again', () => {
    expect(decideMapClick({ ...idle, msSinceDragEnd: 0 })).toBe('ignore');
    expect(decideMapClick({ ...idle, msSinceDragEnd: DRAG_CLICK_GUARD_MS - 1 })).toBe('ignore');
    expect(decideMapClick({ ...idle, msSinceDragEnd: DRAG_CLICK_GUARD_MS })).toBe('add');
  });

  it('reports the limit when the route is full', () => {
    expect(decideMapClick({ ...idle, count: MAX_WAYPOINTS - 1 })).toBe('add');
    expect(decideMapClick({ ...idle, count: MAX_WAYPOINTS })).toBe('limit');
    expect(decideMapClick({ ...idle, count: 3, max: 3 })).toBe('limit');
  });

  it('prefers ignoring drag clicks over the limit message', () => {
    expect(decideMapClick({ dragging: true, msSinceDragEnd: Infinity, count: MAX_WAYPOINTS })).toBe('ignore');
  });
});

describe('formatLatLng', () => {
  it('uses four decimals', () => {
    expect(formatLatLng([45, -100])).toBe('45.0000, -100.0000');
    expect(formatLatLng([48.858372, 2.294481])).toBe('48.8584, 2.2945');
  });
});

describe('geometryToLatLngs', () => {
  it('swaps GeoJSON [lon, lat] to Leaflet [lat, lng]', () => {
    expect(
      geometryToLatLngs({
        type: 'LineString',
        coordinates: [
          [-100, 45],
          [2.29, 48.86],
        ],
      })
    ).toEqual([
      [45, -100],
      [48.86, 2.29],
    ]);
  });
});

describe('isLatLng', () => {
  it('accepts valid coordinates', () => {
    expect(isLatLng([0, 0])).toBe(true);
    expect(isLatLng([-90, 180])).toBe(true);
  });

  it('rejects wrong shapes, types, and ranges', () => {
    expect(isLatLng(null)).toBe(false);
    expect(isLatLng([1])).toBe(false);
    expect(isLatLng([1, 2, 3])).toBe(false);
    expect(isLatLng(['1', 2])).toBe(false);
    expect(isLatLng([NaN, 2])).toBe(false);
    expect(isLatLng([91, 0])).toBe(false);
    expect(isLatLng([0, -181])).toBe(false);
  });
});
