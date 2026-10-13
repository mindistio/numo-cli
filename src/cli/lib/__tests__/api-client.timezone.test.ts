import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../http', () => ({
  http: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('../../auth/credentials', () => ({ getIdToken: vi.fn(async () => 'id-token') }));

import { http } from '../http';
import { api } from '../api-client';

// Contract: every request names the user's time zone, so the server works out "today" and
// reminder times on the user's clock. The zone comes from the process, so a user who sets TZ
// gets that zone. Every verb, for the same reason the host guard covers every verb: the
// header lives in the shared builder, one refactor away from a verb that skips it.
describe('api client time zone header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TZ', 'America/Los_Angeles');
    for (const m of Object.values(http)) vi.mocked(m).mockResolvedValue({ status: 200, data: {} } as never);
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['get', () => api.get('/api/tasks'), http.get, 1],
    ['post', () => api.post('/api/tasks', { text: 'x' }), http.post, 2],
    ['patch', () => api.patch('/api/tasks/t1', { text: 'x' }), http.patch, 2],
    ['del', () => api.del('/api/tasks/t1'), http.delete, 1],
  ] as const)('sends X-Numo-Timezone on %s', async (_verb, call, fn, optsArg) => {
    await call();

    const opts = vi.mocked(fn).mock.calls[0][optsArg] as { headers: Record<string, string> };
    expect(opts.headers['X-Numo-Timezone']).toBe('America/Los_Angeles');
  });
});
