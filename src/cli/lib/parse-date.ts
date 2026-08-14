import * as chrono from 'chrono-node';
import { localDateOnly } from './task-dates';

/**
 * Parse a human-friendly date string into YYYY-MM-DD HH:mm format.
 * Accepts: ISO dates, natural language ("tomorrow", "next monday", "in 3 days").
 * Returns null if parsing fails.
 */
export function parseHumanDate(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Pass-through ISO-like dates (YYYY-MM-DD or YYYY-MM-DD HH:mm)
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed;

  const [result] = chrono.parse(trimmed, new Date(), { forwardDate: true });
  if (!result) return null;

  const when = result.start.date();
  // Local calendar day, never toISOString: at a negative UTC offset a late time carries
  // the UTC date forward, and "tomorrow 21:00" then lands the day after tomorrow.
  const date = localDateOnly(when);
  // Whether the text named a time is chrono's answer to give, not something the digits
  // can be read for: "in 12 days" and "December 12" both carry a 12 that is not a clock.
  if (!result.start.isCertain('hour')) return date;
  return `${date} ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
}

/**
 * Parse to date-only YYYY-MM-DD format.
 */
export function parseHumanDateOnly(input: string): string | null {
  const result = parseHumanDate(input);
  if (!result) return null;
  return result.slice(0, 10);
}
