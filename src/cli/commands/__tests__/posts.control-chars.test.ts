import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

vi.mock('../../lib/api-client', () => ({
  API_BASE: 'http://localhost:3000',
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));
vi.mock('../../lib/uid', () => ({ requireAuth: vi.fn() }));
vi.mock('../../lib/tty', async (orig) => ({ ...(await orig<object>()), isInteractive: () => true }));

import { registerPostsCommands } from '../posts';
import { api } from '../../lib/api-client';
import { sanitizeErrorMessage } from '../../lib/errors';

const EVIL = 'hi\x1b]52;c;ZXZpbA==\x07\x1b[2J\x9b31m there';
const post = { id: 'p1', title: EVIL, body: EVIL, authorName: EVIL, tag: 't', createdAt: 0 };

let out = '';
beforeEach(() => {
  out = '';
  vi.spyOn(console, 'log').mockImplementation((...a) => { out += a.join(' ') + '\n'; });
  vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out += String(s); return true; });
  vi.mocked(api.get).mockResolvedValue(post as never);
});
afterEach(() => vi.restoreAllMocks());

function run(args: string[]) {
  const program = new Command();
  program.exitOverride().option('--json [fields]').option('-q, --quiet');
  registerPostsCommands(program);
  return program.parseAsync(args, { from: 'user' });
}

describe('server text is stripped of control chars in human output', () => {
  it('posts get: no attacker ESC/BEL/C1 bytes survive', async () => {
    await run(['posts', 'get', 'p1']);
    expect(out).toContain('there');
    expect(out).not.toMatch(/[\x07\x9b]/);
    // picocolors may emit its own SGR codes; the attacker's OSC/erase must not appear.
    expect(out).not.toContain('\x1b]');
    expect(out).not.toContain('\x1b[2J');
  });

  it('posts comments: text stripped', async () => {
    vi.mocked(api.get).mockResolvedValue({ comments: [{ id: 'c', text: EVIL, authorName: EVIL }] } as never);
    await run(['posts', 'comments', 'p1']);
    expect(out).not.toMatch(/[\x07\x9b]/);
    expect(out).not.toContain('\x1b]');
    expect(out).not.toContain('\x1b[2J');
  });

  it('--json is unchanged (JSON.stringify escapes control chars)', async () => {
    await run(['posts', 'get', 'p1', '--json']);
    expect(out).not.toMatch(/[\x00-\x08\x0b-\x1f]/); // JSON.stringify escapes C0 (not C1/DEL; left as-is by design)
    expect(JSON.parse(out).title).toBe(EVIL);
  });

  it('sanitizeErrorMessage strips control chars', () => {
    expect(sanitizeErrorMessage(EVIL)).toBe('hi]52;c;ZXZpbA==[2J31m there');
  });
});
