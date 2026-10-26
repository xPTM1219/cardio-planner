import { describe, expect, it } from 'vitest';
import { distanceMeters, pathDistanceMeters } from './geo';

// One degree along the equator on a sphere of radius 6371 km.
const DEGREE_M = 6371000 * (Math.PI / 180);

describe('distanceMeters', () => {
  it('measures one degree along the equator', () => {
    expect(distanceMeters([0, 0], [0, 1])).toBeCloseTo(DEGREE_M, 3);
  });

  it('measures one degree along a meridian', () => {
    expect(distanceMeters([10, 20], [11, 20])).toBeCloseTo(DEGREE_M, 3);
  });

  it('is zero for the same point', () => {
    expect(distanceMeters([45, -100], [45, -100])).toBe(0);
  });

  it('crosses the antimeridian by the short way', () => {
    expect(distanceMeters([0, 179.5], [0, -179.5])).toBeCloseTo(DEGREE_M, 3);
  });
});

describe('pathDistanceMeters', () => {
  it('adds the segment lengths', () => {
    expect(
      pathDistanceMeters([
        [0, 0],
        [0, 1],
        [0, 3],
      ])
    ).toBeCloseTo(3 * DEGREE_M, 3);
  });

  it('is zero for fewer than two points', () => {
    expect(pathDistanceMeters([])).toBe(0);
    expect(pathDistanceMeters([[45, -100]])).toBe(0);
  });
});
