import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { isQuietMode, makeClackSpinner } from '../quiet';
import * as clack from '@clack/prompts';

vi.mock('../tty', () => ({
  isInteractive: vi.fn().mockReturnValue(true),
  isUnicodeSupported: false,
}));
vi.mock('@clack/prompts', () => ({
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
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

  // No zero-argument case: every one of the fifteen call sites passes an options object,
  // and the default parameter makes it identical to the {} case asserted above.
});

describe('makeClackSpinner', () => {
  beforeEach(() => {
    vi.mocked(clack.spinner).mockClear();
  });

  // Contract: in quiet mode no spinner is constructed at all. Asserting the returned
  // object has start/stop cannot hold this — a real spinner has them too, so both a
  // spinner that writes frames into a --json payload and one that never appears in any
  // mode satisfied the previous version of these tests. What distinguishes them is
  // whether @clack was reached, so that is what is asserted.
  it('constructs no spinner in quiet mode', async () => {
    const spinner = await makeClackSpinner(true);
    spinner.start('working');
    spinner.stop('done');

    expect(clack.spinner).not.toHaveBeenCalled();
  });

  it('constructs one in interactive mode', async () => {
    await makeClackSpinner(false);

    expect(clack.spinner).toHaveBeenCalled();
  });
});
