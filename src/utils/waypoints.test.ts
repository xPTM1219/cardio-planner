import { describe, expect, it } from 'vitest';
import {
  DRAG_CLICK_GUARD_MS,
  MAX_WAYPOINTS,
  decideMapClick,
  formatLatLng,
  geometryToLatLngs,
  isLatLng,
  isSelectModifier,
  nearestSegment,
  pointsInRect,
  rectFromCorners,
  unwrapPath,
  waypointRole,
  wrapLatLng,
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

  it('ignores clicks with Ctrl or Cmd down', () => {
    expect(decideMapClick({ ...idle, modifier: true })).toBe('ignore');
    expect(decideMapClick({ ...idle, modifier: true, selectedCount: 2, count: MAX_WAYPOINTS })).toBe('ignore');
  });

  it('clears the selection instead of adding, also at the limit', () => {
    expect(decideMapClick({ ...idle, selectedCount: 1 })).toBe('deselect');
    expect(decideMapClick({ ...idle, selectedCount: 3, count: MAX_WAYPOINTS })).toBe('deselect');
    expect(decideMapClick({ ...idle, selectedCount: 0 })).toBe('add');
  });

  it('checks the drag guard before the selection', () => {
    expect(decideMapClick({ ...idle, msSinceDragEnd: 0, selectedCount: 2 })).toBe('ignore');
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

describe('waypointRole', () => {
  it('gives start, middle, and end by position', () => {
    expect([0, 1, 2, 3].map((i) => waypointRole(i, 4))).toEqual(['start', 'middle', 'middle', 'end']);
    expect([0, 1].map((i) => waypointRole(i, 2))).toEqual(['start', 'end']);
  });

  it('makes a single waypoint the start', () => {
    expect(waypointRole(0, 1)).toBe('start');
  });
});

describe('wrapLatLng', () => {
  it('keeps longitudes that are in range', () => {
    expect(wrapLatLng([45, -100])).toEqual([45, -100]);
    expect(wrapLatLng([0, 180])).toEqual([0, 180]);
    expect(wrapLatLng([0, -180])).toEqual([0, -180]);
  });

  it('moves longitudes from other world copies into range', () => {
    expect(wrapLatLng([10, 190])).toEqual([10, -170]);
    expect(wrapLatLng([10, -190])).toEqual([10, 170]);
    expect(wrapLatLng([10, -460])).toEqual([10, -100]);
    expect(wrapLatLng([10, 540])).toEqual([10, -180]);
  });
});

describe('unwrapPath', () => {
  it('does not change a path that does not cross 180 degrees', () => {
    const path: [number, number][] = [
      [45, -100],
      [45.1, -100.2],
      [45.2, -99.9],
    ];
    expect(unwrapPath(path)).toEqual(path);
  });

  it('keeps a path that crosses 180 degrees in one piece', () => {
    expect(
      unwrapPath([
        [0, 179],
        [0, -179],
        [0, -178],
      ])
    ).toEqual([
      [0, 179],
      [0, 181],
      [0, 182],
    ]);
    expect(
      unwrapPath([
        [0, -179],
        [0, 179],
      ])
    ).toEqual([
      [0, -179],
      [0, -181],
    ]);
  });

  it('moves the first point near the reference longitude', () => {
    expect(
      unwrapPath(
        [
          [0, -170],
          [0, -169],
        ],
        185
      )
    ).toEqual([
      [0, 190],
      [0, 191],
    ]);
    expect(unwrapPath([[0, 10]], 15)).toEqual([[0, 10]]);
  });

  it('gives back the wrapped points after wrapLatLng', () => {
    const path = unwrapPath([
      [0, 179],
      [0, -179],
    ]);
    expect(path.map(wrapLatLng)).toEqual([
      [0, 179],
      [0, -179],
    ]);
  });
});

describe('isSelectModifier', () => {
  it('is true for Ctrl or Cmd', () => {
    expect(isSelectModifier({ ctrlKey: true, metaKey: false })).toBe(true);
    expect(isSelectModifier({ ctrlKey: false, metaKey: true })).toBe(true);
    expect(isSelectModifier({ ctrlKey: false, metaKey: false })).toBe(false);
  });
});

describe('nearestSegment', () => {
  // An L-shaped path: right 100 px, then down 100 px.
  const path = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it('finds the segment under a click and the nearest point on it', () => {
    expect(nearestSegment(path, { x: 40, y: 3 })).toEqual({ index: 0, point: { x: 40, y: 0 }, t: 0.4 });
    expect(nearestSegment(path, { x: 96, y: 70 })).toEqual({ index: 1, point: { x: 100, y: 70 }, t: 0.7 });
  });

  it('chooses the nearer segment near a corner', () => {
    expect(nearestSegment(path, { x: 90, y: 4 })?.index).toBe(0);
    expect(nearestSegment(path, { x: 96, y: 10 })?.index).toBe(1);
  });

  it('chooses the first segment when two are at the same distance', () => {
    expect(nearestSegment(path, { x: 110, y: -10 })).toEqual({ index: 0, point: { x: 100, y: 0 }, t: 1 });
  });

  it('keeps the point between the ends of the segment', () => {
    expect(nearestSegment(path.slice(0, 2), { x: -30, y: 5 })).toEqual({ index: 0, point: { x: 0, y: 0 }, t: 0 });
  });

  it('accepts a segment with zero length', () => {
    expect(nearestSegment([{ x: 5, y: 5 }, { x: 5, y: 5 }], { x: 8, y: 9 })).toEqual({
      index: 0,
      point: { x: 5, y: 5 },
      t: 0,
    });
  });

  it('gives null for fewer than two points', () => {
    expect(nearestSegment([], { x: 0, y: 0 })).toBeNull();
    expect(nearestSegment([{ x: 1, y: 1 }], { x: 0, y: 0 })).toBeNull();
  });
});

describe('rectFromCorners', () => {
  it('orders the sides for a box drawn in any direction', () => {
    const expected = { left: 10, top: 20, right: 50, bottom: 80 };
    expect(rectFromCorners({ x: 10, y: 20 }, { x: 50, y: 80 })).toEqual(expected);
    expect(rectFromCorners({ x: 50, y: 80 }, { x: 10, y: 20 })).toEqual(expected);
    expect(rectFromCorners({ x: 50, y: 20 }, { x: 10, y: 80 })).toEqual(expected);
  });
});

describe('pointsInRect', () => {
  const rect = { left: 0, top: 0, right: 100, bottom: 50 };

  it('gives the indexes of the points inside, in order', () => {
    const points = [
      { x: 10, y: 10 },
      { x: 150, y: 10 },
      { x: 90, y: 40 },
      { x: 50, y: -1 },
    ];
    expect(pointsInRect(points, rect)).toEqual([0, 2]);
  });

  it('counts points on an edge as inside', () => {
    expect(pointsInRect([{ x: 0, y: 0 }, { x: 100, y: 50 }, { x: 100, y: 51 }], rect)).toEqual([0, 1]);
  });

  it('gives an empty list when no point is inside', () => {
    expect(pointsInRect([], rect)).toEqual([]);
    expect(pointsInRect([{ x: -5, y: 5 }], rect)).toEqual([]);
  });
});
