import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import { APP_VERSION } from './version';

describe('APP_VERSION', () => {
  it('is the version from package.json', () => {
    expect(APP_VERSION).toBe(pkg.version);
  });

  it('has the major.minor.patch form', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
