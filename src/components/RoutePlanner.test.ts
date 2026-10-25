import { beforeEach, describe, expect, it } from 'vitest';
import { RoutePlanner } from './RoutePlanner';
import { MAX_WAYPOINTS } from '../utils/waypoints';
import { formatDuration } from '../utils/format';

describe('RoutePlanner.convertDistance', () => {
  const planner = RoutePlanner.getInstance();

  it('converts meters to kilometers in metric units', () => {
    expect(planner.convertDistance(1500, 'metric')).toBe(1.5);
  });

  it('converts meters to miles in imperial units', () => {
    expect(planner.convertDistance(1609.344, 'imperial')).toBeCloseTo(1, 2);
  });

  it('rounds to two decimal places', () => {
    expect(planner.convertDistance(1234, 'metric')).toBe(1.23);
    expect(planner.convertDistance(0, 'imperial')).toBe(0);
  });
});

describe('RoutePlanner.calculateRoute durations', () => {
  let planner: RoutePlanner;

  beforeEach(() => {
    (RoutePlanner as unknown as { instance: undefined }).instance = undefined;
    planner = RoutePlanner.getInstance();
  });

  // ~111.195 km along the equator
  const legMeters = 6371000 * (Math.PI / 180);

  it('uses the provided speed for duration', async () => {
    planner.setWaypoints([
      [0, 0],
      [0, 1],
    ]);

    const route = await planner.calculateRoute((8 / 3.6)); // jogging 8 km/h

    expect(route).not.toBeNull();
    expect(route!.distance / legMeters).toBeCloseTo(1, 3);
    expect(route!.duration).toBe(route!.distance / (8 / 3.6));
  });

  it('falls back to legacy 5 km/h when no speed is given', async () => {
    planner.setWaypoints([
      [0, 0],
      [0, 1],
    ]);

    const route = await planner.calculateRoute();

    expect(route!.duration).toBeCloseTo(legMeters / (5 / 3.6), 6);
  });

  it('ignores non-positive speeds and uses the fallback', async () => {
    planner.setWaypoints([
      [0, 0],
      [0, 1],
    ]);

    const route = await planner.calculateRoute(-4);

    expect(route!.duration).toBeCloseTo(legMeters / (5 / 3.6), 6);
  });
});

describe('RoutePlanner stale route handling', () => {
  let planner: RoutePlanner;

  beforeEach(async () => {
    (RoutePlanner as unknown as { instance: undefined }).instance = undefined;
    planner = RoutePlanner.getInstance();
    planner.setWaypoints([
      [0, 0],
      [0, 1],
    ]);
    await planner.calculateRoute();
  });

  it('setWaypoints clears the current route', () => {
    expect(planner.getCurrentRoute()).not.toBeNull();
    planner.setWaypoints([
      [0, 0],
      [0, 2],
    ]);
    expect(planner.getCurrentRoute()).toBeNull();
  });

  it('add, remove, and move also clear the current route', async () => {
    planner.addWaypoint([0, 3]);
    expect(planner.getCurrentRoute()).toBeNull();

    await planner.calculateRoute();
    planner.removeWaypointAt(0);
    expect(planner.getCurrentRoute()).toBeNull();

    await planner.calculateRoute();
    planner.updateWaypointLocation(0, [1, 1]);
    expect(planner.getCurrentRoute()).toBeNull();
  });

  it('the route keeps its own copy of the waypoints', async () => {
    const route = await planner.calculateRoute();
    planner.updateWaypointLocation(0, [5, 5]);
    expect(route!.waypoints[0].location).toEqual([0, 0]);
  });
});

describe('RoutePlanner waypoint limit', () => {
  beforeEach(() => {
    (RoutePlanner as unknown as { instance: undefined }).instance = undefined;
  });

  it('refuses waypoints past MAX_WAYPOINTS', () => {
    const planner = RoutePlanner.getInstance();
    const full: [number, number][] = Array.from({ length: MAX_WAYPOINTS + 5 }, (_, i) => [0, i * 0.001]);
    planner.setWaypoints(full);
    expect(planner.getWaypoints()).toHaveLength(MAX_WAYPOINTS);
    expect(planner.addWaypoint([1, 1])).toBe(false);
    expect(planner.getWaypoints()).toHaveLength(MAX_WAYPOINTS);
  });
});

describe('RoutePlanner.getRouteInfo', () => {
  it('uses the shared duration format', async () => {
    (RoutePlanner as unknown as { instance: undefined }).instance = undefined;
    const planner = RoutePlanner.getInstance();
    planner.setWaypoints([
      [0, 0],
      [0, 0.1],
    ]);
    const route = await planner.calculateRoute(5 / 3.6);
    const info = planner.getRouteInfo('metric');
    expect(info).toContain(`Duration: ${formatDuration(route!.duration)}`);
    expect(info).toContain('Distance: 11.12 km');
  });
});
