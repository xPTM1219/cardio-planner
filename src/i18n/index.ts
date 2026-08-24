import { en } from './en';
import { es } from './es';
import { zhCN } from './zh-CN';
import { zhTW } from './zh-TW';

export type Language = 'en' | 'es' | 'zh-CN' | 'zh-TW';

export const LANGUAGES: Language[] = ['en', 'es', 'zh-CN', 'zh-TW'];

export type TranslationKey = keyof typeof en;

type Dictionary = Record<TranslationKey, string>;

const dictionaries: Record<Language, Dictionary> = {
  en,
  es,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
};

let currentLanguage: Language = 'en';

/**
 * Replace `{token}` placeholders in a translated template.
 * Unknown tokens are left untouched.
 */
export function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  );
}

/**
 * Look up the translation for `key` in the active language, falling back to
 * English and finally to the raw key. Optional params fill `{n}` placeholders.
 */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  const text = dictionaries[currentLanguage][key] ?? en[key] ?? String(key);
  return params ? interpolate(text, params) : text;
}

export function getLanguage(): Language {
  return currentLanguage;
}

export function setLanguage(language: Language): void {
  if (LANGUAGES.includes(language)) {
    currentLanguage = language;
  }
}

/**
 * Map a BCP-47 language tag (or navigator.language) to a supported language:
 * `es*` → Spanish; `zh-CN*`/`zh-Hans*` → Simplified Chinese; other `zh*` →
 * Traditional Chinese; anything else → English.
 */
export function detectBrowserLanguage(candidate?: string): Language {
  const tag = (
    candidate ?? (typeof navigator !== 'undefined' ? navigator.language : '')
  ).toLowerCase();
  if (!tag) {
    return 'en';
  }
  if (tag.startsWith('es')) {
    return 'es';
  }
  if (tag.startsWith('zh-cn') || tag.startsWith('zh-hans')) {
    return 'zh-CN';
  }
  if (tag.startsWith('zh')) {
    return 'zh-TW';
  }
  return 'en';
}
