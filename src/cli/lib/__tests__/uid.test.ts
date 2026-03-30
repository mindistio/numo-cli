import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireUid } from '../uid';

vi.mock('../../auth/credentials', () => ({
  loadCredentials: vi.fn(),
}));

describe('requireUid', () => {
  let loadCredentials: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../auth/credentials');
    loadCredentials = vi.mocked(mod.loadCredentials);
  });

  it('returns uid when logged in', () => {
    loadCredentials.mockReturnValue({ uid: 'some-uid', email: 'a@b.com' });
    expect(requireUid()).toBe('some-uid');
  });

  it('throws when not logged in', () => {
    loadCredentials.mockReturnValue(null);
    expect(() => requireUid()).toThrow('Not logged in');
  });
});
