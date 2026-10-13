import { describe, it, expect } from 'vitest';
import { parseIntOption } from '../tasks';

describe('parseIntOption', () => {
  it('passes whole non-negative numbers through', () => {
    expect(parseIntOption('--duration', '15')).toBe(15);
    expect(parseIntOption('--difficulty', '0')).toBe(0);
  });

  // Contract: a value the API would get as null (NaN) or reject never leaves the CLI,
  // and the error names the option the user typed.
  it('rejects non-numbers, fractions and negatives, naming the option', () => {
    for (const v of ['abc', '1.5', '-3', '']) {
      expect(() => parseIntOption('--duration', v)).toThrow(/--duration/);
    }
  });
});
