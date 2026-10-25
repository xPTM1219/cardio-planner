import { ActivityType } from '../types';
import { t, TranslationKey } from '../i18n';

/** Average speeds per activity in km/h (adjustable averages, not exact). */
export const ACTIVITY_SPEEDS_KMH: Record<ActivityType, number> = {
  walking: 5,
  jogging: 8,
  running: 12,
  bicycling: 20,
};

/** Translation keys for the short activity words in the speed basis text. */
const ACTIVITY_BASIS_KEYS: Record<ActivityType, TranslationKey> = {
  walking: 'activityBasisWalking',
  jogging: 'activityBasisJogging',
  running: 'activityBasisRunning',
  bicycling: 'activityBasisBicycling',
};

/** Unit system for distances, speeds, and paces shown in the UI. */
export type Units = 'metric' | 'imperial';

/** 1 km ≈ 0.621371192 miles */
export const MILES_PER_KM = 0.621371192;

/** Legacy fallback speed (5 km/h walking) used when nothing else applies. */
export const FALLBACK_SPEED_KMH = 5;

export interface ResolvedSpeed {
  /** Effective speed in km/h. */
  speedKmh: number;
  /** Effective speed in meters per second. */
  speedMps: number;
  /** Which resolution step produced the speed. */
  source: 'pace' | 'speed' | 'activity' | 'default';
  /** Canonical pace when `source` is `'pace'`, in min/km. */
  paceMinPerKm?: number;
  /** Activity used when `source` is `'activity'`. */
  activityType?: ActivityType;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function toMps(speedKmh: number): number {
  return speedKmh / 3.6;
}

/**
 * Resolve the effective speed for a route calculation.
 * Precedence: custom pace > custom speed > activity default > legacy fallback.
 */
export function resolveSpeed(input: {
  activityType?: unknown;
  customSpeed?: unknown;
  customPace?: unknown;
}): ResolvedSpeed {
  if (isPositiveFinite(input.customPace)) {
    const paceMinPerKm = input.customPace;
    const speedKmh = 60 / paceMinPerKm;
    return { speedKmh, speedMps: toMps(speedKmh), source: 'pace', paceMinPerKm };
  }

  if (isPositiveFinite(input.customSpeed)) {
    const speedKmh = input.customSpeed;
    return { speedKmh, speedMps: toMps(speedKmh), source: 'speed' };
  }

  if (
    typeof input.activityType === 'string' &&
    Object.prototype.hasOwnProperty.call(ACTIVITY_SPEEDS_KMH, input.activityType)
  ) {
    const activityType = input.activityType as ActivityType;
    const speedKmh = ACTIVITY_SPEEDS_KMH[activityType];
    return { speedKmh, speedMps: toMps(speedKmh), source: 'activity', activityType };
  }

  return { speedKmh: FALLBACK_SPEED_KMH, speedMps: toMps(FALLBACK_SPEED_KMH), source: 'default' };
}

/**
 * Convert a speed from km/h to mph.
 * @param kmh Speed in km/h.
 * @returns Speed in mph.
 */
export function kmhToMph(kmh: number): number {
  return kmh * MILES_PER_KM;
}

/**
 * Convert a speed from mph to km/h.
 * @param mph Speed in mph.
 * @returns Speed in km/h.
 */
export function mphToKmh(mph: number): number {
  return mph / MILES_PER_KM;
}

/**
 * Convert a pace from minutes per km to minutes per mile.
 * @param minPerKm Pace in minutes per km.
 * @returns Pace in minutes per mile.
 */
export function minPerKmToMinPerMi(minPerKm: number): number {
  return minPerKm / MILES_PER_KM;
}

/**
 * Convert a pace from minutes per mile to minutes per km.
 * @param minPerMi Pace in minutes per mile.
 * @returns Pace in minutes per km.
 */
export function minPerMiToMinPerKm(minPerMi: number): number {
  return minPerMi * MILES_PER_KM;
}

/**
 * Convert a distance in meters to km or miles, rounded to two decimals.
 * @param distanceMeters Distance in meters.
 * @param units Target unit system.
 * @returns Distance in km (metric) or miles (imperial).
 */
export function convertDistance(distanceMeters: number, units: Units): number {
  const value = units === 'metric' ? distanceMeters / 1000 : (distanceMeters / 1000) * MILES_PER_KM;
  return Math.round(value * 100) / 100;
}

/**
 * Unit labels for the active unit system.
 * @param units Unit system.
 * @returns Labels for distance, speed, and pace.
 */
export function unitLabels(units: Units): { distance: string; speed: string; pace: string } {
  return units === 'imperial'
    ? { distance: 'mi', speed: 'mph', pace: 'min/mi' }
    : { distance: 'km', speed: 'km/h', pace: 'min/km' };
}

/**
 * Convert a stored speed (km/h) to the value shown in the speed field.
 * Imperial values are rounded to one decimal to hide conversion noise.
 * @param speedKmh Stored speed in km/h.
 * @param units Active unit system.
 * @returns Speed in km/h (metric) or mph (imperial).
 */
export function toDisplaySpeed(speedKmh: number, units: Units): number {
  return units === 'imperial' ? Math.round(kmhToMph(speedKmh) * 10) / 10 : speedKmh;
}

/**
 * Convert a speed typed in the speed field to the stored unit (km/h).
 * @param value Speed in km/h (metric) or mph (imperial).
 * @param units Active unit system.
 * @returns Speed in km/h.
 */
export function fromDisplaySpeed(value: number, units: Units): number {
  return units === 'imperial' ? mphToKmh(value) : value;
}

/**
 * Convert a stored pace (min/km) to the value shown in the pace field.
 * Imperial values are rounded to two decimals to hide conversion noise.
 * @param paceMinPerKm Stored pace in minutes per km.
 * @param units Active unit system.
 * @returns Pace in min/km (metric) or min/mi (imperial).
 */
export function toDisplayPace(paceMinPerKm: number, units: Units): number {
  return units === 'imperial' ? Math.round(minPerKmToMinPerMi(paceMinPerKm) * 100) / 100 : paceMinPerKm;
}

/**
 * Convert a pace typed in the pace field to the stored unit (min/km).
 * @param value Pace in min/km (metric) or min/mi (imperial).
 * @param units Active unit system.
 * @returns Pace in minutes per km.
 */
export function fromDisplayPace(value: number, units: Units): number {
  return units === 'imperial' ? minPerMiToMinPerKm(value) : value;
}

/** Format minutes as `m:ss` (e.g., 6.5 → "6:30"). */
export function formatPace(minutes: number): string {
  const totalSeconds = Math.round(minutes * 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Human-readable description of which speed basis was used,
 * e.g. "at your pace 6:30 min/km" or "at 8.0 km/h jog pace".
 * The text is in the active UI language.
 *
 * @param resolved Result of {@link resolveSpeed}.
 * @param units Unit system for the numbers in the text.
 * @returns The description text.
 */
export function formatSpeedBasis(resolved: ResolvedSpeed, units: Units): string {
  const labels = unitLabels(units);
  const speedValue = units === 'imperial' ? kmhToMph(resolved.speedKmh) : resolved.speedKmh;
  const speed = `${speedValue.toFixed(1)} ${labels.speed}`;

  switch (resolved.source) {
    case 'pace': {
      const paceMinPerKm = resolved.paceMinPerKm ?? 0;
      const paceValue = units === 'imperial' ? minPerKmToMinPerMi(paceMinPerKm) : paceMinPerKm;
      return t('basisYourPace', { pace: formatPace(paceValue), unit: labels.pace });
    }
    case 'speed':
      return t('basisYourSpeed', { speed });
    case 'activity': {
      const activity = resolved.activityType ? t(ACTIVITY_BASIS_KEYS[resolved.activityType]) : '';
      return t('basisActivityPace', { speed, activity });
    }
    default:
      return t('basisDefaultSpeed', { speed });
  }
}
