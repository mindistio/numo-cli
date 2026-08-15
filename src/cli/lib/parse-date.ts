import * as chrono from 'chrono-node';
import { localDateOnly } from './task-dates';

/**
 * An offset-less ISO date carrying a clock. Only ever used to REFUSE one: chrono
 * reproduces every well-formed case here exactly — measured against 2.9 for the T and
 * space separators, with seconds, with a fraction, and for 00:00 — so parsing them a
 * second time by hand was two answers to one question, and the calendar check that stood
 * beside it duplicated chrono too (2026-13-45 and 2026-02-30 come back null from it).
 *
 * What chrono cannot do is say no. Handed a broken clock it drops the clock and keeps
 * the bare day: "2026-03-27 25:00" and "2026-08-14:15" both come back as the date alone.
 * That is the same silent loss `--due tonight` used to make — a task booked up to a full
 * day early, with nothing to notice — so the refusal stays on this side.
 */
const ISO_CLOCK = /^\d{4}-\d{2}-\d{2}[T ](\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?$/;

/**
 * An ISO date followed by something that is neither a clock, an offset, nor the end of
 * the string. `2026-08-14:15` is the shape that motivated it: the old pattern read the
 * `:15` as the seconds of a time it had never matched, and answered with the bare day.
 */
const ISO_JUNK_TAIL = /^\d{4}-\d{2}-\d{2}(?![T ]|[+-]|Z?$)/;

/**
 * The casual time bands chrono understands. It files their hour under *implied*
 * — the same bucket it uses for the reference clock it copies into "tomorrow" —
 * so `isCertain('hour')` cannot tell "the text named a time" from "the text named
 * no time", and treating both as no-time booked `--due tonight` at 00:00.
 *
 * A word list, not a test on the value. Measured against chrono 2.9 at 08:37:
 * "tomorrow" and "in 3 days" come back carrying the reference clock, but
 * "next monday" and "December 12" come back at 12:00 — so "is the hour just the
 * reference clock?" keeps midday for those two, and any rule reading the number
 * has to hard-code chrono's own no-information default. Naming the five words is
 * shorter and says what it means. "midnight" and "noon" need no entry: chrono
 * marks those certain.
 */
const CASUAL_TIME_BAND = /\b(tonight|morning|afternoon|evening|night)\b/i;

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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

  // Refuse the two shapes chrono answers by throwing the clock away, then hand it
  // everything else — including any instant carrying an offset ("…14:30:00Z"), which it
  // converts to the local clock. Reading those digits here instead would keep 14:30Z as
  // 14:30 and move the task by the whole offset.
  const clock = ISO_CLOCK.exec(trimmed);
  if (clock && (+clock[1]! > 23 || +clock[2]! > 59)) return null;
  if (ISO_JUNK_TAIL.test(trimmed)) return null;

  const [result] = chrono.parse(trimmed, new Date(), { forwardDate: true });
  if (!result) return null;

  const when = result.start.date();
  // Local calendar day, never toISOString: at a negative UTC offset a late time carries
  // the UTC date forward, and "tomorrow 21:00" then lands the day after tomorrow.
  const date = localDateOnly(when);
  // Whether the text named a time is chrono's answer to give, not something the digits
  // can be read for: "in 12 days" and "December 12" both carry a 12 that is not a clock.
  // Certain covers an explicit clock ("14:30", "3pm", "noon"); the band list covers the
  // times chrono knows but only implies.
  if (!result.start.isCertain('hour') && !CASUAL_TIME_BAND.test(trimmed)) return date;
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
