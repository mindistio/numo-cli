import * as chrono from 'chrono-node';
import { localDateOnly } from './task-dates';

const PLAIN_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?(?::\d{2})?(?:\.\d+)?$/;

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Whether the calendar actually has this day — `new Date` rolls 2026-13-45 over instead. */
function isRealDate(year: number, month: number, day: number): boolean {
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/**
 * Parse a human-friendly date string into 'YYYY-MM-DD' or 'YYYY-MM-DD HH:mm'.
 * Accepts ISO-shaped input, with or without an offset, and natural language
 * ("tomorrow", "next monday", "in 3 days"). Returns null for anything it cannot read,
 * including a date the calendar does not have.
 */
export function parseHumanDate(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Offset-less date: the digits are already what the wire wants, but they still have to
  // be a date. "2026-13-45" is one the CLI can see is impossible, so it says so here where
  // the message can name the input, and a stray 'T' or seconds leave the documented shape.
  //
  // The anchor matters: an instant carrying an offset ("...14:30:00Z") deliberately falls
  // past here to chrono, which converts it to the local clock. Matching it here and
  // returning the digits would keep 14:30Z as 14:30 and move the task by the whole offset.
  const plain = PLAIN_DATE.exec(trimmed);
  if (plain) {
    const [, y, mo, d, h, mi] = plain;
    if (!isRealDate(+y, +mo, +d)) return null;
    if (h === undefined) return `${y}-${mo}-${d}`;
    if (+h > 23 || +mi > 59) return null;
    return `${y}-${mo}-${d} ${h}:${mi}`;
  }

  const [result] = chrono.parse(trimmed, new Date(), { forwardDate: true });
  if (!result) return null;

  const when = result.start.date();
  // Local calendar day, never toISOString: at a negative UTC offset a late time carries
  // the UTC date forward, and "tomorrow 21:00" then lands the day after tomorrow.
  const date = localDateOnly(when);
  // Whether the text named a time is chrono's answer to give, not something the digits
  // can be read for: "in 12 days" and "December 12" both carry a 12 that is not a clock.
  if (!result.start.isCertain('hour')) return date;
  return `${date} ${hhmm(when)}`;
}

/**
 * Parse to date-only YYYY-MM-DD format.
 */
export function parseHumanDateOnly(input: string): string | null {
  const result = parseHumanDate(input);
  if (!result) return null;
  return result.slice(0, 10);
}
