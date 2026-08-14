import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

vi.mock('../../lib/uid', () => ({ requireAuth: vi.fn() }));
vi.mock('../../lib/api-client', () => ({
  API_BASE: 'http://localhost:3000',
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));
vi.mock('../../lib/tty', () => ({ isInteractive: vi.fn(() => false), isUnicodeSupported: false }));

import { registerTasksCommands } from '../tasks';
import { registerPostsCommands } from '../posts';
import { requireAuth } from '../../lib/uid';
import { api } from '../../lib/api-client';

// Every command that reaches the API with the caller's identity attached. `posts list`
// is deliberately absent: it is the one command in these two groups that does not gate,
// and the case below pins that so the asymmetry is a decision rather than an oversight.
const GATED_COMMANDS = [
  ['tasks', 'list'],
  ['tasks', 'get', 't1'],
  ['tasks', 'create', 'Buy milk'],
  ['tasks', 'update', 't1', '--text', 'x'],
  ['tasks', 'delete', 't1', '--yes'],
  ['tasks', 'complete', 't1'],
  ['tasks', 'uncomplete', 't1'],
  ['posts', 'get', 'p1'],
  ['posts', 'comments', 'p1'],
  ['posts', 'replies', 'p1', 'c1'],
];

function run(args: string[]) {
  const program = new Command();
  program.exitOverride().option('--json [fields]').option('-q, --quiet');
  registerTasksCommands(program);
  registerPostsCommands(program);
  return program.parseAsync([...args, '--json'], { from: 'user' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue({ tasks: [], posts: [], comments: [], replies: [], id: 't1' } as never);
  vi.mocked(api.post).mockResolvedValue({ task: { id: 't1', text: 'x' } } as never);
  vi.mocked(api.patch).mockResolvedValue({ task: { id: 't1', text: 'x' } } as never);
  vi.mocked(api.del).mockResolvedValue({ deleted: true } as never);
});

// Invariant: a command that needs an identity refuses before it needs one. Reaching the
// API first turns "you are not logged in" into whatever the server says about a missing
// bearer token, and on a self-hosted or misconfigured host it is a request that should
// never have been made. Asserted per command because the gate is a separate call in each:
// the unit test on requireAuth itself establishes what it does, not that anyone calls it.
describe('commands that require an identity', () => {
  it.each(GATED_COMMANDS)('numo %s %s refuses before reaching the API', async (...args) => {
    vi.mocked(requireAuth).mockImplementationOnce(() => { throw new Error('not logged in'); });

    await expect(run(args)).rejects.toThrow('not logged in');

    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.del).not.toHaveBeenCalled();
  });

  // Liveness: with the gate satisfied the same commands do reach the API, or the
  // refusals above would be satisfied by commands that never call anything.
  it.each(GATED_COMMANDS)('numo %s %s proceeds once the gate passes', async (...args) => {
    await run(args);

    expect(requireAuth).toHaveBeenCalled();
    const reached = [api.get, api.post, api.patch, api.del].some((fn) => vi.mocked(fn).mock.calls.length > 0);
    expect(reached).toBe(true);
  });

  // `posts list` browses the public feed and does not gate. Recorded rather than assumed:
  // if it ever starts gating, that is a deliberate change and this is where it shows up.
  it('numo posts list does not gate', async () => {
    await run(['posts', 'list']);

    expect(requireAuth).not.toHaveBeenCalled();
    expect(api.get).toHaveBeenCalled();
  });
});
