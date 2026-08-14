// The defect this file was written for is a timezone defect, so the timezone is part of
// the setup, not an accident of whoever runs it. America/New_York is UTC-4 in August:
// the offset at which an evening local time already belongs to tomorrow in UTC. Set
// before the imports, because a Date read later sees whatever was in effect at load.
process.env.TZ = 'America/New_York';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { parseHumanDate, parseHumanDateOnly } from '../parse-date';

// Fri 14 Aug 2026, 08:00 EDT.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-14T12:00:00Z'));
});

afterAll(() => {
  vi.useRealTimers();
});

describe('parseHumanDate', () => {
  // Contract: the date and the time describe the same local moment. Reading the date off
  // toISOString() and the clock off getHours() mixes UTC with local, and every user west
  // of UTC then gets a task dated a day late whenever they name an evening time.
  it('keeps an evening local time on the local calendar day', () => {
    expect(parseHumanDate('tomorrow 21:00')).toBe('2026-08-15 21:00');
  });

  it('resolves a weekday to the same day the user would name', () => {
    expect(parseHumanDate('next monday 20:30')).toBe('2026-08-17 20:30');
  });

  // Contract: a time appears in the output only when the text named one. Otherwise the
  // due date silently carries the moment the command happened to run.
  it('returns the date alone when no time was named', () => {
    expect(parseHumanDate('tomorrow')).toBe('2026-08-15');
    expect(parseHumanDate('in 3 days')).toBe('2026-08-17');
  });

  // These two differ only by the number in them. Deciding "was a time mentioned" by
  // looking for digits made one of them mean noon and the other mean no time at all.
  it('treats two bare dates alike regardless of the digits in them', () => {
    expect(parseHumanDate('December 11')).toBe('2026-12-11');
    expect(parseHumanDate('December 12')).toBe('2026-12-12');
  });

  it('keeps a time the text named in words', () => {
    expect(parseHumanDate('noon tomorrow')).toBe('2026-08-15 12:00');
  });

  it('passes ISO-shaped input through untouched', () => {
    expect(parseHumanDate('2026-03-27')).toBe('2026-03-27');
    expect(parseHumanDate('2026-03-27 14:30')).toBe('2026-03-27 14:30');
  });

  it('returns null rather than a guess for empty or unparseable input', () => {
    expect(parseHumanDate('')).toBeNull();
    expect(parseHumanDate('   ')).toBeNull();
    expect(parseHumanDate('zzzz')).toBeNull();
  });
});

describe('parseHumanDateOnly', () => {
  it('drops a named time, keeping the local day', () => {
    expect(parseHumanDateOnly('tomorrow 21:00')).toBe('2026-08-15');
  });
});
