import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../tty', () => ({ isInteractive: vi.fn(() => false), isUnicodeSupported: false }));
vi.mock('@clack/prompts', () => ({
  text: vi.fn(async () => 'typed'),
  password: vi.fn(async () => 'secret'),
  select: vi.fn(async () => 'picked'),
  confirm: vi.fn(async () => true),
  multiselect: vi.fn(async () => ['picked']),
  isCancel: vi.fn(() => false),
}));

import {
  promptText, promptPassword, promptSelect, promptConfirm, promptMultiSelect, promptForMissing,
} from '../prompts';
import { isInteractive } from '../tty';
import * as clack from '@clack/prompts';

const OPTIONS = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }];

// promptConfirm is deliberately absent: a confirm has a safe answer to give without
// asking, and gives it. See the case below.
const ASKING_PROMPTS: [string, () => Promise<unknown>][] = [
  ['promptText', () => promptText({ message: 'Task text' })],
  ['promptPassword', () => promptPassword({ message: 'Password' })],
  ['promptSelect', () => promptSelect({ message: 'Visibility', options: OPTIONS })],
  ['promptMultiSelect', () => promptMultiSelect({ message: 'Tags', options: OPTIONS })],
];

const EVERY_PROMPT: [string, () => Promise<unknown>][] = [
  ...ASKING_PROMPTS,
  ['promptConfirm', () => promptConfirm({ message: 'Sure?' })],
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isInteractive).mockReturnValue(false);
});

describe('prompts without a terminal', () => {
  // Invariant: no prompt ever waits for input that cannot arrive. A CI job or an agent has
  // no one at the keyboard, so a prompt that opened there would hang until the job is
  // killed — the failure mode a timeout hides rather than explains. Asserted over every
  // prompt that needs an answer, because one unguarded entry point is enough to hang.
  it.each(ASKING_PROMPTS)('%s refuses instead of waiting', async (_name, call) => {
    await expect(call()).rejects.toMatchObject({
      kind: 'MISSING_ARGUMENT',
      exitCode: 2,
    });
  });

  // Contract: a confirm answers itself, and answers with the default it declared. The
  // direction is the point — falling through to "yes" would turn every unattended run
  // into consent nobody gave.
  it('promptConfirm answers with its declared default, never with yes by omission', async () => {
    await expect(promptConfirm({ message: 'Sure?' })).resolves.toBe(false);
    await expect(promptConfirm({ message: 'Sure?', initialValue: false })).resolves.toBe(false);
    await expect(promptConfirm({ message: 'Sure?', initialValue: true })).resolves.toBe(true);
    expect(clack.confirm).not.toHaveBeenCalled();
  });

  // Nothing separately asserts that no prompt was opened: the guard throws before the
  // dynamic import, so any prompt that reached @clack would resolve a value and fail the
  // refusal above. The confirm case, which does not throw, asserts it directly below.

  // Liveness: with a terminal the prompts do open, or the refusals above would be
  // satisfied by prompts that never work at all.
  it.each(EVERY_PROMPT)('%s does open one when a terminal is present', async (_name, call) => {
    vi.mocked(isInteractive).mockReturnValue(true);

    await expect(call()).resolves.toBeDefined();
  });
});

describe('promptForMissing', () => {
  // Contract: a value already supplied by a flag is used as-is. Prompting over it would
  // ask the user to retype what they just passed, and in a non-interactive run it would
  // turn a complete command into the refusal above.
  it('returns a supplied value without opening a prompt', async () => {
    await expect(promptForMissing({ value: 'Buy milk', message: 'Task text' })).resolves.toBe('Buy milk');
    expect(clack.text).not.toHaveBeenCalled();
  });

  // An empty string is an absent value, not a supplied one: `--text ""` is not a task.
  it('prompts when the value is absent or empty', async () => {
    vi.mocked(isInteractive).mockReturnValue(true);

    await expect(promptForMissing({ value: undefined, message: 'Task text' })).resolves.toBe('typed');
    await expect(promptForMissing({ value: '', message: 'Task text' })).resolves.toBe('typed');
    expect(clack.text).toHaveBeenCalledTimes(2);
  });
});
