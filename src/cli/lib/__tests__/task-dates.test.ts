import { describe, it, expect } from 'vitest';
import {
  localDateOnly,
  localDateOffset,
  toApiDueDate,
  dueDateHasTime,
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

  it('rolls across month boundaries', () => {
    expect(localDateOffset(1, new Date(2026, 5, 30, 12, 0))).toBe('2026-07-01');
    expect(localDateOffset(-1, new Date(2026, 6, 1, 12, 0))).toBe('2026-06-30');
  });
});

describe('toApiDueDate', () => {
  it("appends ' 00:00' to a bare date", () => {
    expect(toApiDueDate('2026-06-19')).toBe('2026-06-19 00:00');
  });

  it('passes through YYYY-MM-DD HH:mm unchanged', () => {
    expect(toApiDueDate('2026-06-19 14:30')).toBe('2026-06-19 14:30');
  });

  it('slices anything longer to minutes', () => {
    expect(toApiDueDate('2026-06-19 14:30:59')).toBe('2026-06-19 14:30');
  });
});

describe('dueDateHasTime', () => {
  it('is false for null/undefined/date-only/midnight', () => {
    expect(dueDateHasTime(null)).toBe(false);
    expect(dueDateHasTime(undefined)).toBe(false);
    expect(dueDateHasTime('2026-06-19')).toBe(false);
    expect(dueDateHasTime('2026-06-19 00:00')).toBe(false);
  });

  it('is true for a non-zero time', () => {
    expect(dueDateHasTime('2026-06-19 09:30')).toBe(true);
    expect(dueDateHasTime('2026-06-19 00:01')).toBe(true);
  });
});

describe('normalizeDueDateInBody', () => {
  it('canonicalizes a bare date and sets withTime=false', () => {
    const body: Record<string, unknown> = { text: 'x', dueDate: '2026-06-19' };
    normalizeDueDateInBody(body);
    expect(body.dueDate).toBe('2026-06-19 00:00');
    expect(body.withTime).toBe(false);
  });

  it('keeps a timed date and sets withTime=true', () => {
    const body: Record<string, unknown> = { text: 'x', dueDate: '2026-06-19 14:30' };
    normalizeDueDateInBody(body);
    expect(body.dueDate).toBe('2026-06-19 14:30');
    expect(body.withTime).toBe(true);
  });

  it('leaves a body without dueDate untouched (no withTime added)', () => {
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
