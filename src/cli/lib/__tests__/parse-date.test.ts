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

  // Contract: a time appears in the output exactly when the text named one — and a
  // casual band ("tonight", "tomorrow morning") names one. chrono files a band's hour
  // under *implied*, the same bucket as the reference clock it copies into "tomorrow",
  // so a rule keeping only `isCertain('hour')` threw both away and `--due tonight`
  // booked 00:00 — 22 hours before the user asked, silently. The server cannot catch
  // it either: normalizeDueDate pads a bare date to 00:00 as well.
  //
  // Both directions live in one table on purpose. Split apart, the "keeps the time"
  // half would still pass on a rule that kept every hour chrono hands back, and the
  // "date alone" half would still pass on the rule that lost tonight. Neither half is
  // a claim about the band list; together they are.
  //
  // "next monday" is not filler: chrono defaults it to 12:00 rather than to the
  // reference clock, so a rule that asked "is the hour just the clock we passed in?"
  // would keep midday for it and call that a named time.
  it.each([
    // the text named a band → the time survives
    ['tonight', '2026-08-14 22:00'],
    ['this evening', '2026-08-14 20:00'],
    ['this afternoon', '2026-08-14 15:00'],
    ['tomorrow morning', '2026-08-15 06:00'],
    ['tomorrow evening', '2026-08-15 20:00'],
    ['saturday night', '2026-08-15 20:00'],
    // the text named no time → date alone, though chrono still hands back an hour
    ['tomorrow', '2026-08-15'],
    ['in 3 days', '2026-08-17'],
    ['next monday', '2026-08-17'],
    ['next week', '2026-08-21'],
  ])('%s → %s', (input, expected) => {
    expect(parseHumanDate(input)).toBe(expected);
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

  it('keeps ISO-shaped input in the shape it is already in', () => {
    expect(parseHumanDate('2026-03-27')).toBe('2026-03-27');
    expect(parseHumanDate('2026-03-27 14:30')).toBe('2026-03-27 14:30');
  });

  // Contract: the output is 'YYYY-MM-DD' or 'YYYY-MM-DD HH:mm' whatever the input looked
  // like. A T or trailing seconds used to survive as far as the request, which then failed
  // on a value the caller had written correctly for a different format.
  it('normalises the ISO variants an agent is likely to compute', () => {
    expect(parseHumanDate('2026-03-27T14:30')).toBe('2026-03-27 14:30');
    expect(parseHumanDate('2026-03-27 14:30:59')).toBe('2026-03-27 14:30');
  });

  // Contract: an instant carrying its own offset is converted, not stripped. Keeping the
  // digits would move the task by the whole offset — 14:30Z is 10:30 here.
  it('converts an explicit offset to the local clock', () => {
    expect(parseHumanDate('2026-03-27T14:30:00Z')).toBe('2026-03-27 10:30');
    expect(parseHumanDate('2026-03-27T14:30:00+00:00')).toBe('2026-03-27 10:30');
    // Same instant named from the local offset: the clock is unchanged, so nothing moves.
    expect(parseHumanDate('2026-03-27T14:30:00-04:00')).toBe('2026-03-27 14:30');
  });

  // Contract: an impossible date is refused here, where the message can name the input,
  // rather than forwarded for the request to fail on.
  it('refuses a date the calendar does not have', () => {
    expect(parseHumanDate('2026-13-45')).toBeNull();
    expect(parseHumanDate('2026-02-30')).toBeNull();
    expect(parseHumanDate('2026-03-27 25:00')).toBeNull();
    // Liveness: the values just inside the boundary stay acceptable, or a rule that
    // rejects everything ISO-shaped would pass the three above. 2028 is a leap year, so
    // the 29th is a real day and a check that just counted to 28 would fail here.
    expect(parseHumanDate('2028-02-29')).toBe('2028-02-29');
    expect(parseHumanDate('2026-03-27 23:59')).toBe('2026-03-27 23:59');
  });

  // Contract: an ISO date with a tail that is not a clock is refused, not narrowed to the
  // day. This is the whole reason the ISO branch survives at all — chrono reproduces every
  // well-formed case exactly, but handed a broken clock it drops it and answers with the
  // bare date, which books the task up to a full day early and reports nothing.
  //
  // `2026-08-14:15` was accepted as `2026-08-14` until this commit: the old pattern read
  // the `:15` as the seconds of a time it had never matched.
  it.each(['2026-08-14:15', '2026-08-14garbage', '2026-03-27 24:00', '2026-03-27 12:60'])(
    'refuses %s rather than keeping the day and dropping the rest',
    (input) => {
      expect(parseHumanDate(input)).toBeNull();
    }
  );

  // Liveness for the rule above already exists: 'keeps ISO-shaped input in the shape it
  // is already in' and 'converts an explicit offset to the local clock' pin every
  // well-formed tail between them, so widening the junk guard to refuse everything is
  // killed there rather than by a third copy of the same three inputs.

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
