import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

vi.mock('../../services/tasks', () => ({
  listTasks: vi.fn(), getTask: vi.fn(), createTask: vi.fn(), updateTask: vi.fn(),
  deleteTask: vi.fn(), completeTask: vi.fn(), uncompleteTask: vi.fn(),
  uncompleteOccurrence: vi.fn(), restoreTask: vi.fn(), skipOccurrence: vi.fn(), unskipOccurrence: vi.fn(),
}));
vi.mock('../../lib/uid', () => ({ requireAuth: vi.fn() }));
vi.mock('../../lib/stdin', () => ({ readStdinLines: vi.fn(() => []) }));
vi.mock('../../lib/tty', () => ({ isInteractive: vi.fn(() => false), isUnicodeSupported: false }));
vi.mock('../../lib/prompts', () => ({
  promptText: vi.fn(), promptPassword: vi.fn(), promptSelect: vi.fn(),
  promptConfirm: vi.fn(), promptMultiSelect: vi.fn(),
  promptForMissing: vi.fn(async ({ value }: { value?: string }) => value),
}));

import { registerTasksCommands } from '../tasks';
import { createTask, uncompleteTask, uncompleteOccurrence, restoreTask, skipOccurrence, unskipOccurrence } from '../../services/tasks';
import { readStdinLines } from '../../lib/stdin';
import { localDateOnly } from '../../lib/task-dates';

function run(args: string[]) {
  const program = new Command();
  program.exitOverride().option('--json [fields]').option('-q, --quiet');
  registerTasksCommands(program);
  return program.parseAsync(['tasks', ...args], { from: 'user' });
}

const task = { id: 'r1', text: 'Walk' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.mocked(createTask).mockResolvedValue({ task, karma: 0 } as never);
  vi.mocked(uncompleteTask).mockResolvedValue({ uncompleted: true, task, karmaReverted: false } as never);
  vi.mocked(uncompleteOccurrence).mockResolvedValue({ uncompleted: true, task, karmaReverted: false } as never);
  vi.mocked(skipOccurrence).mockResolvedValue({ skipped: true, task } as never);
  vi.mocked(unskipOccurrence).mockResolvedValue({ unskipped: true, task } as never);
  vi.mocked(restoreTask).mockResolvedValue({ restored: true, task, isHistoryTask: false } as never);
});

// Contract: a task created from the CLI is recorded as created from the CLI.
it('tasks create sends source: cli', async () => {
  await run(['create', 'Buy milk', '--json']);
  expect(vi.mocked(createTask).mock.calls[0][0]).toMatchObject({ source: 'cli' });
});

describe('tasks skip / unskip', () => {
  it('acts on today in the local zone when --date is absent', async () => {
    const today = localDateOnly();
    await run(['skip', 'r1', '--json']);
    await run(['unskip', 'r1', '--json']);
    expect(skipOccurrence).toHaveBeenCalledWith('r1', today);
    expect(unskipOccurrence).toHaveBeenCalledWith('r1', today);
  });

  it('passes --date through as a calendar day', async () => {
    await run(['skip', 'r1', '--date', '2026-03-26', '--json']);
    expect(skipOccurrence).toHaveBeenCalledWith('r1', '2026-03-26');
  });

  it('rejects a date it cannot parse before calling the API', async () => {
    await expect(run(['skip', 'r1', '--date', 'not a date', '--json'])).rejects.toThrow(/Cannot parse date/);
    expect(skipOccurrence).not.toHaveBeenCalled();
  });
});

// Both forms stay: a completion-record id without --date, a routine id plus the day with it.
describe('tasks uncomplete', () => {
  it('without --date reopens by completion-record id', async () => {
    await run(['uncomplete', 'h1', '--json']);
    expect(uncompleteTask).toHaveBeenCalledWith('h1');
    expect(uncompleteOccurrence).not.toHaveBeenCalled();
  });

  it('with --date reopens that day of the routine', async () => {
    await run(['uncomplete', 'r1', '--date', '2026-03-26', '--json']);
    expect(uncompleteOccurrence).toHaveBeenCalledWith('r1', '2026-03-26');
    expect(uncompleteTask).not.toHaveBeenCalled();
  });

  it('with --date and --stdin reopens that day for every id', async () => {
    vi.mocked(readStdinLines).mockReturnValue(['r1', 'r2']);
    await run(['uncomplete', '--stdin', '--date', '2026-03-26']);
    expect(uncompleteOccurrence).toHaveBeenCalledTimes(2);
    expect(uncompleteOccurrence).toHaveBeenNthCalledWith(1, 'r1', '2026-03-26');
    expect(uncompleteOccurrence).toHaveBeenNthCalledWith(2, 'r2', '2026-03-26');
    expect(uncompleteTask).not.toHaveBeenCalled();
  });
});

describe('tasks restore', () => {
  it('restores the given id', async () => {
    await run(['restore', 'abc', '--json']);
    expect(restoreTask).toHaveBeenCalledWith('abc');
  });

  it('restores every id from --stdin', async () => {
    vi.mocked(readStdinLines).mockReturnValue(['a', 'b']);
    await run(['restore', '--stdin']);
    expect(restoreTask).toHaveBeenCalledTimes(2);
    expect(restoreTask).toHaveBeenNthCalledWith(2, 'b');
  });
});
