import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireUid } from '../uid';

vi.mock('../../auth/credentials', () => ({
  loadCredentials: vi.fn(),
}));

describe('requireUid', () => {
  let loadCredentials: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env.NUMO_TOKEN;
    const mod = await import('../../auth/credentials');
    loadCredentials = vi.mocked(mod.loadCredentials);
  });

  it('returns uid when logged in', () => {
    loadCredentials.mockReturnValue({ uid: 'some-uid', email: 'a@b.com' });
    expect(requireUid()).toBe('some-uid');
  });

  it('throws when not logged in (no token, no creds)', () => {
    loadCredentials.mockReturnValue(null);
    expect(() => requireUid()).toThrow('Not logged in');
  });

  it('honors NUMO_TOKEN without a credentials file (agents/CI)', () => {
    loadCredentials.mockReturnValue(null);
    const payload = Buffer.from(JSON.stringify({ user_id: 'agent-123' })).toString('base64');
    process.env.NUMO_TOKEN = `eyJhbGciOiJ.${payload}.sig`;
    expect(requireUid()).toBe('agent-123');
  });

  it('does not throw for a malformed NUMO_TOKEN (lets the API reject it)', () => {
    loadCredentials.mockReturnValue(null);
    process.env.NUMO_TOKEN = 'not-a-jwt';
    expect(requireUid()).toBe('');
  });
});
