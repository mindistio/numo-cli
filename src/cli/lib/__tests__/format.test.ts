import { describe, it, expect } from 'vitest';
import { formatDifficulty, formatDuration, formatRepeat, truncate } from '../format';

describe('formatDifficulty', () => {
  it('returns empty string for null/undefined', () => {
    expect(formatDifficulty(null)).toBe('');
    expect(formatDifficulty(undefined)).toBe('');
  });

  it('maps numeric levels to S/M/L/XL', () => {
    expect(formatDifficulty(0)).toBe('S');
    expect(formatDifficulty(1)).toBe('M');
    expect(formatDifficulty(2)).toBe('L');
    expect(formatDifficulty(3)).toBe('XL');
  });

  it('returns raw value for unknown levels', () => {
    expect(formatDifficulty(5)).toBe('5');
  });
});

describe('formatDuration', () => {
  it('returns empty string for null/undefined', () => {
    expect(formatDuration(null)).toBe('');
    expect(formatDuration(undefined)).toBe('');
  });

  it('formats minutes under 60', () => {
    expect(formatDuration(30)).toBe('30min');
    expect(formatDuration(5)).toBe('5min');
  });

  it('formats exact hours', () => {
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(120)).toBe('2h');
  });

  it('formats hours + remaining minutes', () => {
    expect(formatDuration(90)).toBe('1h 30min');
    expect(formatDuration(150)).toBe('2h 30min');
  });
});

describe('formatRepeat', () => {
  it('returns empty string for null/undefined/none', () => {
    expect(formatRepeat(null)).toBe('');
    expect(formatRepeat(undefined)).toBe('');
    expect(formatRepeat({ type: 'none' })).toBe('');
  });

  it('formats daily', () => {
    expect(formatRepeat({ type: 'daily', every: 1 })).toBe('daily');
    expect(formatRepeat({ type: 'daily', every: 3 })).toBe('every 3 days');
  });

  it('formats weekly', () => {
    expect(formatRepeat({ type: 'weekly', every: 1 })).toBe('weekly');
    expect(formatRepeat({ type: 'weekly', every: 2 })).toBe('every 2 weeks');
  });

  it('formats weekly with weekDays', () => {
    expect(formatRepeat({ type: 'weekly', every: 1, weekDays: ['Mon', 'Wed'] }))
      .toBe('weekly (Mon, Wed)');
  });

  it('formats monthly', () => {
    expect(formatRepeat({ type: 'monthly', every: 1 })).toBe('monthly');
    expect(formatRepeat({ type: 'monthly', every: 3 })).toBe('every 3 months');
  });

  it('defaults every to 1 when not provided', () => {
    expect(formatRepeat({ type: 'daily' })).toBe('daily');
    expect(formatRepeat({ type: 'weekly' })).toBe('weekly');
    expect(formatRepeat({ type: 'monthly' })).toBe('monthly');
  });
});

describe('truncate', () => {
  it('keeps short strings unchanged', () => {
    expect(truncate('hello', 10)).toBe('hello');
    expect(truncate('exact', 5)).toBe('exact');
  });

  it('truncates long strings with ellipsis', () => {
    const result = truncate('hello world foo bar', 10);
    expect(result).toBe('hello wor\u2026');
    expect(result.length).toBe(10);
  });

  it('handles edge case of max = 1', () => {
    expect(truncate('hello', 1)).toBe('\u2026');
  });

  it('handles empty string', () => {
    expect(truncate('', 10)).toBe('');
  });
});
