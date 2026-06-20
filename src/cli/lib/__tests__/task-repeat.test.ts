import { describe, it, expect } from 'vitest';
import { normalizeWeekday, buildRepeatConfig } from '../task-repeat';

describe('normalizeWeekday', () => {
  it('normalizes short/long/mixed-case names to API tokens', () => {
    expect(normalizeWeekday('mon')).toBe('Mon');
    expect(normalizeWeekday('Monday')).toBe('Mon');
    expect(normalizeWeekday(' TUE ')).toBe('Tue');
    expect(normalizeWeekday('sunday')).toBe('Sun');
  });

  it('throws on an invalid weekday', () => {
    expect(() => normalizeWeekday('funday')).toThrow();
  });
});

describe('buildRepeatConfig', () => {
  it('returns undefined when --repeat is not given', () => {
    expect(buildRepeatConfig({})).toBeUndefined();
  });

  it('builds a daily config with defaults', () => {
    expect(buildRepeatConfig({ repeat: 'daily' })).toEqual({
      type: 'daily', every: 1, custom: false, monthDays: null, weekDays: null,
    });
  });

  it('honors --every', () => {
    expect(buildRepeatConfig({ repeat: 'daily', every: '3' })).toMatchObject({ type: 'daily', every: 3 });
  });

  it('parses weekly --weekdays into API tokens', () => {
    expect(buildRepeatConfig({ repeat: 'weekly', weekdays: 'Mon,wed,FRI' })).toMatchObject({
      type: 'weekly', weekDays: ['Mon', 'Wed', 'Fri'], monthDays: null,
    });
  });

  it('parses monthly --month-days into numbers', () => {
    expect(buildRepeatConfig({ repeat: 'monthly', monthDays: '1, 15 ,28' })).toMatchObject({
      type: 'monthly', monthDays: [1, 15, 28], weekDays: null,
    });
  });

  it('supports type none (clears recurrence on update)', () => {
    expect(buildRepeatConfig({ repeat: 'none' })).toMatchObject({ type: 'none' });
  });

  it('rejects an invalid repeat type', () => {
    expect(() => buildRepeatConfig({ repeat: 'hourly' })).toThrow();
  });

  it('rejects out-of-range --every', () => {
    expect(() => buildRepeatConfig({ repeat: 'daily', every: '0' })).toThrow();
    expect(() => buildRepeatConfig({ repeat: 'daily', every: '999' })).toThrow();
  });

  it('rejects an out-of-range month day', () => {
    expect(() => buildRepeatConfig({ repeat: 'monthly', monthDays: '0,40' })).toThrow();
  });
});
