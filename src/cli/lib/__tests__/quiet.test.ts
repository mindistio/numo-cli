import { describe, it, expect, vi, afterEach } from 'vitest';
import { isQuietMode, makeClackSpinner } from '../quiet';

vi.mock('../tty', () => ({
  isInteractive: vi.fn().mockReturnValue(true),
  isUnicodeSupported: false,
}));

describe('isQuietMode', () => {
  afterEach(async () => {
    const { isInteractive } = await import('../tty');
    vi.mocked(isInteractive).mockReturnValue(true);
  });

  it('returns true when opts.quiet is set', () => {
    expect(isQuietMode({ quiet: true })).toBe(true);
  });

  it('returns true when opts.json is true (boolean)', () => {
    expect(isQuietMode({ json: true })).toBe(true);
  });

  it('returns true when opts.json is a field list (string)', () => {
    expect(isQuietMode({ json: 'id,text' })).toBe(true);
  });

  it('returns true when non-interactive even without flags', async () => {
    const { isInteractive } = await import('../tty');
    vi.mocked(isInteractive).mockReturnValue(false);
    expect(isQuietMode({})).toBe(true);
  });

  it('returns false in interactive TTY with no flags', () => {
    expect(isQuietMode({})).toBe(false);
  });

  it('returns false when called with no args', () => {
    expect(isQuietMode()).toBe(false);
  });
});

describe('makeClackSpinner', () => {
  it('returns a no-op spinner in quiet mode', async () => {
    const s = await makeClackSpinner(true);
    expect(typeof s.start).toBe('function');
    expect(typeof s.stop).toBe('function');
    // No-op calls should not throw
    expect(() => s.start('hello')).not.toThrow();
    expect(() => s.stop('done')).not.toThrow();
  });

  it('returns a real spinner in interactive mode', async () => {
    const s = await makeClackSpinner(false);
    expect(typeof s.start).toBe('function');
    expect(typeof s.stop).toBe('function');
  });
});
