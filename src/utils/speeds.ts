import { ActivityType } from '../types';
import { t } from '../i18n';

/** Average speeds per activity in km/h (adjustable averages, not exact). */
export const ACTIVITY_SPEEDS_KMH: Record<ActivityType, number> = {
  walking: 5,
  jogging: 8,
  running: 12,
  bicycling: 20,
};

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  walking: 'walk',
  jogging: 'jog',
  running: 'run',
  bicycling: 'bike',
};

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

export function kmhToMph(kmh: number): number {
  return kmh * MILES_PER_KM;
}

export function mphToKmh(mph: number): number {
  return mph / MILES_PER_KM;
}

export function minPerKmToMinPerMi(minPerKm: number): number {
  return minPerKm / MILES_PER_KM;
}

export function minPerMiToMinPerKm(minPerMi: number): number {
  return minPerMi * MILES_PER_KM;
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
 */
export function formatSpeedBasis(resolved: ResolvedSpeed, units: Units): string {
  switch (resolved.source) {
    case 'pace': {
      const paceMinPerKm = resolved.paceMinPerKm ?? 0;
      const pace =
        units === 'imperial'
          ? formatPace(minPerKmToMinPerMi(paceMinPerKm))
          : formatPace(paceMinPerKm);
      return t('basisYourPace', { pace, unit: units === 'imperial' ? 'min/mi' : 'min/km' });
    }
    case 'speed': {
      if (units === 'imperial') {
        return t('basisYourSpeed', { speed: `${kmhToMph(resolved.speedKmh).toFixed(1)} mph` });
      }
      return t('basisYourSpeed', { speed: `${resolved.speedKmh.toFixed(1)} km/h` });
    }
    case 'activity': {
      const activity = resolved.activityType ? ACTIVITY_LABELS[resolved.activityType] : 'default';
      if (units === 'imperial') {
        return t('basisActivityPace', {
          speed: kmhToMph(resolved.speedKmh).toFixed(1) + ' mph',
          activity,
        });
      }
      return t('basisActivityPace', {
        speed: resolved.speedKmh.toFixed(1) + ' km/h',
        activity,
      });
    }
    default:
      return t('basisDefaultSpeed', { speed: resolved.speedKmh.toFixed(1) + ' km/h' });
  }
}
