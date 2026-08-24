import { describe, expect, it } from 'vitest';
import { en } from './en';
import { es } from './es';
import { zhCN } from './zh-CN';
import { zhTW } from './zh-TW';
import { detectBrowserLanguage, interpolate, setLanguage, t } from './index';

describe('dictionary key parity', () => {
  const dictionaries = [
    ['en', en],
    ['es', es],
    ['zh-CN', zhCN],
    ['zh-TW', zhTW],
  ] as const;

  it('all languages define exactly the same keys as English', () => {
    const englishKeys = Object.keys(en).sort();
    for (const [name, dict] of dictionaries) {
      expect(Object.keys(dict).sort(), `${name} key mismatch`).toEqual(englishKeys);
    }
  });

  it('all values are non-empty strings in every language', () => {
    for (const [name, dict] of dictionaries) {
      for (const [key, value] of Object.entries(dict)) {
        expect(typeof value === 'string' && value.length > 0, `${name}.${key} is empty`).toBe(true);
      }
    }
  });
});

describe('interpolate', () => {
  it('replaces named placeholders', () => {
    expect(interpolate('{n} waypoint(s)', { n: 3 })).toBe('3 waypoint(s)');
    expect(interpolate('Loaded "{name}".', { name: 'Loop' })).toBe('Loaded "Loop".');
  });

  it('handles multiple and repeated placeholders', () => {
    expect(interpolate('{a} + {b} = {b}{a}', { a: 'x', b: 2 })).toBe('x + 2 = 2x');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(interpolate('keep {unknown}', {})).toBe('keep {unknown}');
  });
});

describe('t()', () => {
  it('returns the translation for the active language', () => {
    setLanguage('es');
    expect(t('settingsTitle')).toBe('Ajustes');

    setLanguage('zh-TW');
    expect(t('settingsTitle')).toBe('設定');

    setLanguage('en');
    expect(t('settingsTitle')).toBe('Settings');
  });

  it('fills placeholders through t()', () => {
    setLanguage('en');
    expect(t('statusRouteSaved', { name: 'Hill Loop' })).toBe(
      'Route "Hill Loop" saved successfully!'
    );
  });
});

describe('detectBrowserLanguage', () => {
  it('maps prefixes per spec', () => {
    expect(detectBrowserLanguage('es')).toBe('es');
    expect(detectBrowserLanguage('es-MX')).toBe('es');
    expect(detectBrowserLanguage('es-419')).toBe('es');
    expect(detectBrowserLanguage('zh-CN')).toBe('zh-CN');
    expect(detectBrowserLanguage('zh-cn')).toBe('zh-CN');
    expect(detectBrowserLanguage('zh-Hans-SG')).toBe('zh-CN');
    expect(detectBrowserLanguage('zh-TW')).toBe('zh-TW');
    expect(detectBrowserLanguage('zh_HK')).toBe('zh-TW');
    expect(detectBrowserLanguage('zh')).toBe('zh-TW');
    expect(detectBrowserLanguage('fr-FR')).toBe('en');
    expect(detectBrowserLanguage('pt-BR')).toBe('en');
    expect(detectBrowserLanguage('')).toBe('en');
  });
});
