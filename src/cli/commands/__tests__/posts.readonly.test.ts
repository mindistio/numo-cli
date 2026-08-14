import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

vi.mock('../../lib/api-client', () => ({
  API_BASE: 'http://localhost:3000',
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));
vi.mock('../../lib/uid', () => ({ requireAuth: vi.fn() }));

import { registerPostsCommands } from '../posts';
import { api } from '../../lib/api-client';

const EVERY_COMMAND = [
  ['posts', 'list'],
  ['posts', 'get', 'p1'],
  ['posts', 'comments', 'p1'],
  ['posts', 'replies', 'p1', 'c1'],
];

function run(args: string[]) {
  const program = new Command();
  program.exitOverride().option('--json [fields]').option('-q, --quiet');
  registerPostsCommands(program);
  return program.parseAsync([...args, '--json'], { from: 'user' });
}

beforeEach(() => {
  vi.clearAllMocks();
  // One permissive shape for all four commands: which key each reads is not what is
  // under test here, only which HTTP verb it reaches for.
  vi.mocked(api.get).mockResolvedValue({
    posts: [], comments: [], replies: [], id: 'p1', nextCursor: null,
  } as never);
});

// Guarantee: the community surface is read-only. Nothing here writes, and the CLI is not
// where that changes quietly — a new `posts create` has to fail this first and be a
// decision someone made on purpose.
describe('numo posts — read-only', () => {
  it('reaches the API only through GET, on every command it offers', async () => {
    for (const args of EVERY_COMMAND) await run(args);

    // Liveness: without this, a build where none of the commands call anything at all
    // satisfies every expectation below.
    expect(api.get).toHaveBeenCalledTimes(EVERY_COMMAND.length);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.del).not.toHaveBeenCalled();
  });

  // Contract: an id goes into the path encoded. Ids arrive from a feed, so a value with a
  // slash in it must address one post and not walk to a different route.
  it('percent-encodes ids into the path', async () => {
    await run(['posts', 'get', 'a/b?c']);
    await run(['posts', 'replies', 'p/1', 'c/1']);

    const paths = vi.mocked(api.get).mock.calls.map(([path]) => path);
    expect(paths).toEqual([
      '/api/posts/a%2Fb%3Fc',
      '/api/posts/p%2F1/comments/c%2F1/replies',
    ]);
  });
});
