/** Mean earth radius in meters, used by the Haversine formula. */
const EARTH_RADIUS_M = 6371e3;

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

/**
 * Great-circle distance between two `[lat, lon]` points using the Haversine
 * formula on a spherical earth of radius 6371 km.
 * @param a First `[lat, lon]` point.
 * @param b Second `[lat, lon]` point.
 * @returns Distance in meters.
 */
export function distanceMeters(a: [number, number], b: [number, number]): number {
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return EARTH_RADIUS_M * c;
}

/**
 * Length of a path of straight-line segments.
 * @param locations Ordered `[lat, lon]` points.
 * @returns The sum of the segment distances in meters (`0` for fewer than
 *   two points).
 */
export function pathDistanceMeters(locations: readonly [number, number][]): number {
  let total = 0;
  for (let i = 1; i < locations.length; i++) {
    total += distanceMeters(locations[i - 1], locations[i]);
  }
  return total;
}
