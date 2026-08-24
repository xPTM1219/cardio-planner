import { beforeEach, describe, expect, it } from 'vitest';
import { RoutePlanner } from './RoutePlanner';

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
