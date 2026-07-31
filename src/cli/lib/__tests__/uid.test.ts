import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireAuth } from '../uid';

vi.mock('../../auth/credentials', () => ({
  loadCredentials: vi.fn(),
}));

describe('requireAuth', () => {
  let loadCredentials: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.NUMO_TOKEN;
    const mod = await import('../../auth/credentials');
    loadCredentials = vi.mocked(mod.loadCredentials);
  });

  it('does not throw when logged in (credentials present)', () => {
    loadCredentials.mockReturnValue({ uid: 'some-uid', email: 'a@b.com' });
    expect(() => requireAuth()).not.toThrow();
  });

  it('throws when not logged in (no token, no creds)', () => {
    loadCredentials.mockReturnValue(null);
    expect(() => requireAuth()).toThrow('Not logged in');
  });

  it('does not throw when NUMO_TOKEN is set, even without a credentials file (agents/CI)', () => {
    loadCredentials.mockReturnValue(null);
    // Identity comes from the token; the API validates it — the CLI does not decode it.
    process.env.NUMO_TOKEN = 'any-token';
    expect(() => requireAuth()).not.toThrow();
  });
});
