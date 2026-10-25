import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n';
import {
  ACTIVITY_SPEEDS_KMH,
  convertDistance,
  fromDisplayPace,
  fromDisplaySpeed,
  toDisplayPace,
  toDisplaySpeed,
  unitLabels,
  formatPace,
  formatSpeedBasis,
  kmhToMph,
  minPerKmToMinPerMi,
  minPerMiToMinPerKm,
  mphToKmh,
  resolveSpeed,
} from './speeds';

describe('ACTIVITY_SPEEDS_KMH', () => {
  it('has the documented averages', () => {
    expect(ACTIVITY_SPEEDS_KMH).toEqual({
      walking: 5,
      jogging: 8,
      running: 12,
      bicycling: 20,
    });
  });
});

describe('resolveSpeed precedence chain', () => {
  it('uses the activity default when nothing custom is set', () => {
    const resolved = resolveSpeed({ activityType: 'jogging' });

    expect(resolved.speedKmh).toBe(8);
    expect(resolved.speedMps).toBeCloseTo(8 / 3.6, 10);
    expect(resolved.source).toBe('activity');
    expect(resolved.activityType).toBe('jogging');
  });

  it('custom speed overrides activity default', () => {
    const resolved = resolveSpeed({ activityType: 'jogging', customSpeed: 6.5 });

    expect(resolved.speedKmh).toBe(6.5);
    expect(resolved.source).toBe('speed');
  });

  it('custom pace overrides both custom speed and activity default', () => {
    const resolved = resolveSpeed({
      activityType: 'running',
      customSpeed: 9.9,
      customPace: 6, // 6 min/km = 10 km/h
    });

    expect(resolved.speedKmh).toBe(10);
    expect(resolved.paceMinPerKm).toBe(6);
    expect(resolved.source).toBe('pace');
  });

  it('ignores invalid (zero/negative/non-finite) overrides and falls through', () => {
    expect(resolveSpeed({ activityType: 'walking', customSpeed: -2 }).source).toBe('activity');
    expect(resolveSpeed({ activityType: 'walking', customSpeed: 0 }).source).toBe('activity');
    expect(resolveSpeed({ activityType: 'walking', customSpeed: Number.NaN }).source).toBe('activity');
    expect(resolveSpeed({ activityType: 'walking', customPace: 0 }).source).toBe('activity');

    // Invalid everything -> legacy fallback of 5 km/h
    const fallback = resolveSpeed({ activityType: 'bogus' });
    expect(fallback.speedKmh).toBe(5);
    expect(fallback.source).toBe('default');
  });
});

describe('duration math per activity', () => {
  it('produces distance / speed durations for each activity', () => {
    const distanceMeters = 10000; // 10 km
    for (const [activity, speedKmh] of Object.entries(ACTIVITY_SPEEDS_KMH)) {
      const speedMps = speedKmh / 3.6;
      const durationSeconds = distanceMeters / speedMps;
      // 10 km walking at 5 km/h is exactly 2 hours
      const expectedHours = 10 / speedKmh;
      expect(durationSeconds / 3600).toBeCloseTo(expectedHours, 10);
      if (activity === 'walking') {
        expect(durationSeconds).toBe(7200);
      }
      if (activity === 'bicycling') {
        expect(durationSeconds).toBe(1800);
      }
    }
  });
});

describe('unit conversions', () => {
  it('converts km/h to mph and back', () => {
    expect(kmhToMph(100)).toBeCloseTo(62.1371192, 6);
    expect(mphToKmh(kmhToMph(42))).toBeCloseTo(42, 10);
  });

  it('converts min/km to min/mi and back', () => {
    expect(minPerKmToMinPerMi(5)).toBeCloseTo(8.04672, 5);
    expect(minPerMiToMinPerKm(minPerKmToMinPerMi(7))).toBeCloseTo(7, 10);
  });
});

describe('formatting', () => {
  it('formats pace as m:ss', () => {
    expect(formatPace(6.5)).toBe('6:30');
    expect(formatPace(5)).toBe('5:00');
    expect(formatPace(4.983)).toBe('4:59');
  });

  it('formats each basis in metric', () => {
    expect(formatSpeedBasis(resolveSpeed({ customPace: 6.5 }), 'metric')).toBe(
      'at your pace 6:30 min/km'
    );
    expect(formatSpeedBasis(resolveSpeed({ customSpeed: 13.7 }), 'metric')).toBe(
      'at your speed 13.7 km/h'
    );
    expect(formatSpeedBasis(resolveSpeed({ activityType: 'jogging' }), 'metric')).toBe(
      'at 8.0 km/h jog pace'
    );
  });

  it('formats each basis in imperial', () => {
    expect(formatSpeedBasis(resolveSpeed({ customPace: 6.5 }), 'imperial')).toBe(
      'at your pace 10:28 min/mi'
    );
    expect(formatSpeedBasis(resolveSpeed({ customSpeed: 20 }), 'imperial')).toBe(
      'at your speed 12.4 mph'
    );
    expect(formatSpeedBasis(resolveSpeed({ activityType: 'bicycling' }), 'imperial')).toBe(
      'at 12.4 mph bike pace'
    );
  });
});

describe('translated speed basis', () => {
  afterEach(() => {
    setLanguage('en');
  });

  it('translates the activity word', () => {
    setLanguage('es');
    expect(formatSpeedBasis(resolveSpeed({ activityType: 'jogging' }), 'metric')).toBe('a 8.0 km/h, ritmo de trote');
    setLanguage('zh-CN');
    expect(formatSpeedBasis(resolveSpeed({ activityType: 'bicycling' }), 'metric')).toBe('按骑行速度 20.0 km/h');
  });

  it('shows the default speed in the active units', () => {
    expect(formatSpeedBasis(resolveSpeed({}), 'imperial')).toBe('at default 3.1 mph');
    expect(formatSpeedBasis(resolveSpeed({}), 'metric')).toBe('at default 5.0 km/h');
  });
});

describe('distance and display conversions', () => {
  it('converts meters to km or miles with two decimals', () => {
    expect(convertDistance(1500, 'metric')).toBe(1.5);
    expect(convertDistance(1609.344, 'imperial')).toBe(1);
    expect(convertDistance(1234, 'metric')).toBe(1.23);
  });

  it('gives unit labels per system', () => {
    expect(unitLabels('metric')).toEqual({ distance: 'km', speed: 'km/h', pace: 'min/km' });
    expect(unitLabels('imperial')).toEqual({ distance: 'mi', speed: 'mph', pace: 'min/mi' });
  });

  it('shows stored speed and pace in the active units', () => {
    expect(toDisplaySpeed(10, 'metric')).toBe(10);
    expect(toDisplaySpeed(10, 'imperial')).toBe(6.2);
    expect(toDisplayPace(6, 'metric')).toBe(6);
    expect(toDisplayPace(6, 'imperial')).toBe(9.66);
  });

  it('stores typed values in canonical units', () => {
    expect(fromDisplaySpeed(10, 'metric')).toBe(10);
    expect(fromDisplaySpeed(6.2, 'imperial')).toBeCloseTo(9.978, 3);
    expect(fromDisplayPace(6, 'metric')).toBe(6);
    expect(fromDisplayPace(9.66, 'imperial')).toBeCloseTo(6.0024, 3);
  });

  it('keeps the canonical value when only the units change (no 10 km/h -> 10 mph bug)', () => {
    const storedKmh = fromDisplaySpeed(10, 'metric');
    expect(toDisplaySpeed(storedKmh, 'imperial')).toBe(6.2);
    expect(toDisplaySpeed(storedKmh, 'metric')).toBe(10);
  });
});
