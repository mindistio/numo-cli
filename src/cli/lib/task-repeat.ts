// Build a RepeatConfig from CLI flags (non-interactive routines).
// Repeat semantics: type daily|weekly|monthly|none,
// weekDays as 'Mon'..'Sun', monthDays as 1..31.

import type { RepeatConfig, WeekDay } from '../types/api';
import { Errors } from './errors';

const WEEKDAY_LOOKUP: Record<string, WeekDay> = {
  mon: 'Mon', monday: 'Mon',
  tue: 'Tue', tues: 'Tue', tuesday: 'Tue',
  wed: 'Wed', weds: 'Wed', wednesday: 'Wed',
  thu: 'Thu', thur: 'Thu', thurs: 'Thu', thursday: 'Thu',
  fri: 'Fri', friday: 'Fri',
  sat: 'Sat', saturday: 'Sat',
  sun: 'Sun', sunday: 'Sun',
};

const REPEAT_TYPES = ['daily', 'weekly', 'monthly', 'none'] as const;

/** Normalize a user-typed weekday ('mon', 'Monday', 'TUE'...) to the API token ('Mon'). */
export function normalizeWeekday(s: string): WeekDay {
  const day = WEEKDAY_LOOKUP[s.trim().toLowerCase()];
  if (!day) throw Errors.invalidInput(`Invalid weekday: "${s}". Use Mon,Tue,Wed,Thu,Fri,Sat,Sun`);
  return day;
}

export interface RepeatOpts {
  repeat?: string;
  every?: string;
  weekdays?: string;
  monthDays?: string;
}

/** Build a RepeatConfig from CLI flags, or undefined if --repeat was not provided. */
export function buildRepeatConfig(opts: RepeatOpts): RepeatConfig | undefined {
  if (opts.repeat === undefined) return undefined;
  const type = opts.repeat as RepeatConfig['type'];
  if (!(REPEAT_TYPES as readonly string[]).includes(type)) {
    throw Errors.invalidInput(`--repeat must be one of: ${REPEAT_TYPES.join(', ')}`);
  }

  const every = opts.every !== undefined ? parseInt(opts.every, 10) : 1;
  if (!Number.isFinite(every) || every < 1 || every > 365) {
    throw Errors.invalidInput('--every must be an integer 1-365');
  }

  const repeat: RepeatConfig = { type, every, custom: false, monthDays: null, weekDays: null };

  if (type === 'weekly' && opts.weekdays) {
    repeat.weekDays = opts.weekdays.split(',').map((d) => normalizeWeekday(d));
  }
  if (type === 'monthly' && opts.monthDays) {
    repeat.monthDays = opts.monthDays.split(',').map((s) => {
      const n = parseInt(s.trim(), 10);
      if (!Number.isFinite(n) || n < 1 || n > 31) {
        throw Errors.invalidInput(`--month-days must be 1-31 (got "${s.trim()}")`);
      }
      return n;
    });
  }

  return repeat;
}
