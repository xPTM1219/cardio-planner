import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n';
import { escapeHtml, formatDate, formatDuration } from './format';

afterEach(() => {
  setLanguage('en');
});

describe('formatDuration', () => {
  it('rounds to the nearest minute', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(89)).toBe('1 min');
    expect(formatDuration(90)).toBe('2 min');
    expect(formatDuration(25 * 60 + 29)).toBe('25 min');
  });

  it('shows hours past 60 minutes', () => {
    expect(formatDuration(60 * 60)).toBe('1 h 0 min');
    expect(formatDuration(65 * 60)).toBe('1 h 5 min');
    expect(formatDuration(59 * 60 + 45)).toBe('1 h 0 min');
  });

  it('treats invalid and negative values as zero', () => {
    expect(formatDuration(NaN)).toBe('0 min');
    expect(formatDuration(-120)).toBe('0 min');
    expect(formatDuration(Infinity)).toBe('0 min');
  });

  it('uses the active language', () => {
    setLanguage('zh-CN');
    expect(formatDuration(65 * 60)).toBe('1 小时 5 分钟');
    setLanguage('zh-TW');
    expect(formatDuration(5 * 60)).toBe('5 分鐘');
  });
});

describe('escapeHtml', () => {
  it('escapes markup and quotes', () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe(
      '&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;'
    );
  });

  it('keeps plain text as it is', () => {
    expect(escapeHtml('Hill Loop 5 km')).toBe('Hill Loop 5 km');
  });
});

describe('formatDate', () => {
  const date = new Date(2026, 9, 25, 12, 0, 0);

  it('formats per UI language', () => {
    expect(formatDate(date, 'en')).toBe(new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date));
    expect(formatDate(date, 'es')).toBe(new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(date));
    expect(formatDate(date, 'en')).not.toBe(formatDate(date, 'zh-CN'));
  });
});
