import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set before the imports below, and in its own file: api-base.ts resolves NUMO_API_URL
// when the module loads. Assigning it inside a test arrives after that, leaving the
// default host under test instead of this one — the guard then has nothing to refuse and
// the test passes for the wrong reason.
process.env.NUMO_API_URL = 'https://evilnumo.ai';
delete process.env.NUMO_ALLOW_CUSTOM_HOST;

// Mirrors the real module: the client's `del` reaches for `http.delete`, so a mock
// spelling it `del` would silently provide nothing for the verb under test.
vi.mock('../http', () => ({
  http: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../../auth/credentials', () => ({ getIdToken: vi.fn(async () => 'id-token') }));

import { http } from '../http';
import { getIdToken } from '../../auth/credentials';

// Contract: nothing leaves the process, and the stored token is not even read, until the
// configured host has been classified as safe to receive credentials. `classifyApiBase`
// is unit-tested next door — this covers the part that has to be wired to it, which a
// test of the classifier alone cannot see.
describe('api client host guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Every verb, not the first one. The guard lives in the shared header builder today,
  // but that is an implementation detail one refactor away — a verb that stops going
  // through it sends a bearer token to whatever host was configured, and a test covering
  // only get and post stays green while it happens.
  const EVERY_VERB: [string, (api: any) => Promise<unknown>][] = [
    ['get', (api) => api.get('/api/tasks')],
    ['post', (api) => api.post('/api/tasks', { text: 'x' })],
    ['patch', (api) => api.patch('/api/tasks/t1', { text: 'x' })],
    ['del', (api) => api.del('/api/tasks/t1')],
  ];

  it.each(EVERY_VERB)('refuses an untrusted host on %s, sending nothing and reading no token', async (verb, call) => {
    const { api } = await import('../api-client');

    await expect(call(api)).rejects.toMatchObject({ kind: 'CONFIG_ERROR' });

    expect(http[verb === 'del' ? 'delete' : (verb as 'get' | 'post' | 'patch')]).not.toHaveBeenCalled();
    expect(getIdToken).not.toHaveBeenCalled();
  });
});
