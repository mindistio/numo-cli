import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set before the imports below, and in its own file: api-base.ts resolves NUMO_API_URL
// when the module loads. Assigning it inside a test arrives after that, leaving the
// default host under test instead of this one — the guard then has nothing to refuse and
// the test passes for the wrong reason.
process.env.NUMO_API_URL = 'https://evilnumo.ai';
delete process.env.NUMO_ALLOW_CUSTOM_HOST;

vi.mock('../http', () => ({
  http: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
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

  it('refuses an untrusted NUMO_API_URL before requesting anything or reading the token', async () => {
    const { api } = await import('../api-client');

    await expect(api.get('/api/tasks')).rejects.toMatchObject({ kind: 'CONFIG_ERROR' });

    expect(http.get).not.toHaveBeenCalled();
    expect(getIdToken).not.toHaveBeenCalled();
  });

  it('applies to writes as well as reads', async () => {
    const { api } = await import('../api-client');

    await expect(api.post('/api/tasks', { text: 'x' })).rejects.toMatchObject({ kind: 'CONFIG_ERROR' });

    expect(http.post).not.toHaveBeenCalled();
    expect(getIdToken).not.toHaveBeenCalled();
  });
});
