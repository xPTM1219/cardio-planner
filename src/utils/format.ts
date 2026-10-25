import { t } from '../i18n';
import type { Language } from '../i18n';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escape text for safe use inside HTML markup and attribute values.
 * @param value Plain text.
 * @returns The text with `& < > " '` replaced by HTML entities.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/**
 * Format a duration in the active language, rounded to the nearest minute.
 * The route popup, the status panel, and the saved-routes table all use
 * this function, so they always show the same value.
 *
 * @param seconds Duration in seconds. Values that are not finite or are
 *   negative count as zero.
 * @returns Text such as `"25 min"` or `"1 h 5 min"`.
 */
export function formatDuration(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const totalMinutes = Math.round(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return t('durationHoursMinutes', { h: hours, m: minutes });
  }
  return t('durationMinutes', { m: minutes });
}

/**
 * Format a date in the given UI language (for example `"Oct 25, 2026"`).
 * @param date Date to format.
 * @param language UI language that sets the date format.
 * @returns The formatted date.
 */
export function formatDate(date: Date, language: Language): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(date);
}

/**
 * Format a date and time in the given UI language
 * (for example `"Oct 25, 2026, 3:30 PM"`).
 * @param date Date to format.
 * @param language UI language that sets the format.
 * @returns The formatted date and time.
 */
export function formatDateTime(date: Date, language: Language): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
