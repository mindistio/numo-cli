// Pinned, because two rules in this file are about timezones and would otherwise be
// checked against whichever one the developer happens to sit in. New York gives both a
// negative UTC offset and a DST transition on a known date.
process.env.TZ = 'America/New_York';

import { describe, it, expect } from 'vitest';
import {
  localDateOnly,
  localDateOffset,
  normalizeDueDateInBody,
  isCompletableDate,
} from '../task-dates';

describe('localDateOnly', () => {
  it('formats a Date as local YYYY-MM-DD (not UTC)', () => {
    // Constructed in local time; components are local regardless of the runner's tz.
    expect(localDateOnly(new Date(2026, 5, 19, 23, 30))).toBe('2026-06-19');
    expect(localDateOnly(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });

  it('zero-pads month and day', () => {
    expect(localDateOnly(new Date(2026, 2, 5))).toBe('2026-03-05');
  });
});

describe('localDateOffset', () => {
  const base = new Date(2026, 5, 19, 12, 0); // 2026-06-19 local
  it('returns yesterday/tomorrow by calendar day', () => {
    expect(localDateOffset(-1, base)).toBe('2026-06-18');
    expect(localDateOffset(1, base)).toBe('2026-06-20');
    expect(localDateOffset(0, base)).toBe('2026-06-19');
  });

  // Contract: a day is a calendar day, not 24 hours. Adding 86_400_000ms — which the
  // module header warns against and which a month-rollover case cannot tell apart —
  // lands on the 9th here, because the clock moved forward overnight on the 8th.
  it('crosses a DST boundary by the calendar, not by adding 24 hours', () => {
    expect(localDateOffset(1, new Date(2026, 2, 7, 23, 30))).toBe('2026-03-08');
    expect(localDateOffset(-1, new Date(2026, 2, 8, 0, 30))).toBe('2026-03-07');
  });
});

// toApiDueDate has no describe of its own. Nothing outside this module calls it — every
// path reaches it through normalizeDueDateInBody, and those cases assert the same
// input/output pairs one call further out, where a caller actually stands.

describe('normalizeDueDateInBody', () => {
  it('canonicalizes a bare date (no withTime sent — the API derives it)', () => {
    const body: Record<string, unknown> = { text: 'x', dueDate: '2026-06-19' };
    normalizeDueDateInBody(body);
    expect(body.dueDate).toBe('2026-06-19 00:00');
    expect('withTime' in body).toBe(false);
  });

  it('slices a timed date with seconds to minutes (guards the API date regex; no withTime)', () => {
    const body: Record<string, unknown> = { text: 'x', dueDate: '2026-06-19 14:30:45' };
    normalizeDueDateInBody(body);
    expect(body.dueDate).toBe('2026-06-19 14:30');
    expect('withTime' in body).toBe(false);
  });

  // The other half of the same rule: a value already in the wire shape is not mangled by
  // the slicing that trims the one above.
  it('leaves an already-canonical timed date alone', () => {
    const body: Record<string, unknown> = { text: 'x', dueDate: '2026-06-19 14:30' };
    normalizeDueDateInBody(body);
    expect(body.dueDate).toBe('2026-06-19 14:30');
  });

  it('leaves a body without dueDate untouched', () => {
    const body: Record<string, unknown> = { text: 'x' };
    normalizeDueDateInBody(body);
    expect('dueDate' in body).toBe(false);
    expect('withTime' in body).toBe(false);
  });
});

describe('isCompletableDate', () => {
  const now = new Date(2026, 5, 19, 10, 0); // 2026-06-19 local
  it('accepts today and yesterday', () => {
    expect(isCompletableDate('2026-06-19', now)).toBe(true);
    expect(isCompletableDate('2026-06-19 09:00', now)).toBe(true);
    expect(isCompletableDate('2026-06-18', now)).toBe(true);
  });

  it('rejects tomorrow and older-than-yesterday', () => {
    expect(isCompletableDate('2026-06-20', now)).toBe(false);
    expect(isCompletableDate('2026-06-17', now)).toBe(false);
  });
});
