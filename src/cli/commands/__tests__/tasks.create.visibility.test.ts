import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

vi.mock('../../services/tasks', () => ({
  listTasks: vi.fn(), getTask: vi.fn(), createTask: vi.fn(), updateTask: vi.fn(),
  deleteTask: vi.fn(), completeTask: vi.fn(), uncompleteTask: vi.fn(),
}));
vi.mock('../../lib/uid', () => ({ requireAuth: vi.fn() }));
vi.mock('../../lib/tty', () => ({ isInteractive: vi.fn(() => false), isUnicodeSupported: false }));
vi.mock('../../lib/prompts', () => ({
  promptText: vi.fn(), promptPassword: vi.fn(), promptSelect: vi.fn(),
  promptConfirm: vi.fn(), promptMultiSelect: vi.fn(), promptForMissing: vi.fn(),
}));

import { registerTasksCommands } from '../tasks';
import { createTask } from '../../services/tasks';
import { isInteractive } from '../../lib/tty';
import { promptText, promptSelect, promptConfirm, promptMultiSelect, promptForMissing } from '../../lib/prompts';

const mockCreate = vi.mocked(createTask);

function run(args: string[]) {
  const program = new Command();
  program.exitOverride().option('--json [fields]').option('-q, --quiet');
  registerTasksCommands(program);
  return program.parseAsync(['tasks', 'create', ...args], { from: 'user' });
}

/** The body handed to the API on the nth create. */
function sent(nth = 0): Record<string, unknown> {
  return mockCreate.mock.calls[nth][0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue({ task: { id: 't1', text: 'x' }, karma: 0 } as never);
});

// The cost of a regression here is not a failed command. It is a task the user believed
// was private appearing in the public community feed, which the CLI cannot take back.
describe('numo tasks create — visibility', () => {
  describe('non-interactive (agents, scripts, CI)', () => {
    // Contract (W-121): private unless --public is passed.
    it('sends isPublic: false when --public is absent', async () => {
      await run(['Buy milk', '--json']);
      expect(sent()).toMatchObject({ isPublic: false });
    });

    // Liveness for the rule above. A build that hard-codes private satisfies it too, and
    // is a different bug — the flag has to actually reach the wire.
    it('sends isPublic: true when --public is passed', async () => {
      await run(['Buy milk', '--public', '--json']);
      expect(sent()).toMatchObject({ isPublic: true });
    });

    // Invariant: every shape of create states the visibility, and states it private.
    // Asserting only that the field is a boolean was satisfied by `true` — a build where
    // `--backlog` created public tasks passed this file, which is the guarantee itself
    // going unheld. The value is the rule; the presence is the weaker half of it.
    it('sends isPublic: false on every create shape that does not ask for public', async () => {
      const variants = [
        ['a', '--json'],
        ['b', '--backlog', '--json'],
        ['c', '--due', '2026-03-27', '--json'],
        ['d', '--tags', 'Work', '--json'],
        ['e', '--repeat', 'daily', '--json'],
        ['f', '--private', '--json'],
      ];
      for (const args of variants) await run(args);

      expect(mockCreate.mock.calls.length).toBe(variants.length);
      for (const [body] of mockCreate.mock.calls) {
        expect(body).toMatchObject({ isPublic: false });
      }
    });

    // Contract (AGENTS.md): new tasks land at the top of the list, not wherever the
    // server would otherwise put them.
    it('always asks for the top of the list', async () => {
      await run(['Buy milk', '--json']);
      expect(sent()).toMatchObject({ listPosition: 'top' });
    });
  });

  describe('interactive wizard', () => {
    // The wizard has no --public to read: its default is the *order* of the options it
    // offers, since the cursor starts on the first one. Reordering them is a one-line
    // change with the same consequence as inverting the flag, so the mock answers every
    // select with its first option and the assertion is what that produces.
    beforeEach(() => {
      vi.mocked(isInteractive).mockReturnValue(true);
      vi.mocked(promptForMissing).mockResolvedValue('Wizard task');
      vi.mocked(promptText).mockResolvedValue('Wizard task');
      vi.mocked(promptConfirm).mockResolvedValue(false);
      vi.mocked(promptMultiSelect).mockResolvedValue([]);
      vi.mocked(promptSelect).mockImplementation(async (opts: any) => opts.options[0].value);
    });

    it('offers private first, so an untouched cursor creates a private task', async () => {
      await run(['-q']);
      expect(sent()).toMatchObject({ isPublic: false });

      const visibility = vi.mocked(promptSelect).mock.calls
        .map(([opts]) => opts as any)
        .find((opts) => opts.message === 'Visibility');
      expect(visibility?.options[0].value).toBe('private');
    });

    // Liveness: picking Public has to produce a public task, or the assertion above holds
    // on a wizard whose visibility answer is ignored entirely.
    it('creates a public task when Public is chosen', async () => {
      vi.mocked(promptSelect).mockImplementation(async (opts: any) =>
        opts.message === 'Visibility' ? 'public' : opts.options[0].value,
      );
      await run(['-q']);
      expect(sent()).toMatchObject({ isPublic: true });
    });
  });
});
