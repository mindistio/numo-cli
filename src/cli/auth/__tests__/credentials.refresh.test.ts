import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('../../lib/http', () => ({ http: { post: vi.fn() } }));

import { http } from '../../lib/http';

const env = { ...process.env };
let tmp: string;

function storedCredentials(idTokenExpiry: number) {
  const dir = path.join(tmp, 'cfg');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'credentials.json'),
    JSON.stringify({ refreshToken: 'rt-1', uid: 'u1', email: 'a@b.com', idToken: 'cached', idTokenExpiry }),
    { mode: 0o600 },
  );
}

function savedCredentials() {
  return JSON.parse(fs.readFileSync(path.join(tmp, 'cfg', 'credentials.json'), 'utf8'));
}

describe('getIdToken — refresh', () => {
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'numo-refresh-'));
    process.env.NUMO_CONFIG_DIR = path.join(tmp, 'cfg');
    delete process.env.NUMO_TOKEN;
    vi.mocked(http.post).mockReset();
    vi.mocked(http.post).mockResolvedValue({
      data: { idToken: 'fresh', refreshToken: 'rt-2', expiresIn: 3600 },
    } as never);
  });

  afterEach(() => {
    process.env = { ...env };
    fs.rmSync(tmp, { recursive: true, force: true });
    vi.resetModules();
  });

  // Contract: concurrent callers share a single refresh. A refresh can come back with a
  // replacement token, which this code then stores — so a second refresh in flight is
  // sending one that has already been superseded, and whoever loses that race is signed
  // out without touching anything. Asserting exactly one call is also the liveness check:
  // "never refreshes" would satisfy "refreshes at most once".
  it('refreshes once for concurrent callers and hands all of them the same token', async () => {
    storedCredentials(Date.now() - 1000);
    const { getIdToken } = await import('../credentials');

    const tokens = await Promise.all([getIdToken(), getIdToken(), getIdToken()]);

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(tokens).toEqual(['fresh', 'fresh', 'fresh']);
  });

  // Contract: a replacement token reaches disk. Keeping the superseded one leaves a
  // profile that cannot refresh again — the failure shows up on the next run, not this one.
  it('persists a replacement refresh token when one comes back', async () => {
    storedCredentials(Date.now() - 1000);
    const { getIdToken } = await import('../credentials');

    await getIdToken();

    expect(savedCredentials()).toMatchObject({ refreshToken: 'rt-2', idToken: 'fresh' });
  });

  it('uses the cached token while it is still good', async () => {
    storedCredentials(Date.now() + 3_600_000);
    const { getIdToken } = await import('../credentials');

    expect(await getIdToken()).toBe('cached');
    expect(http.post).not.toHaveBeenCalled();
  });

  // Contract: the cache is trusted only with room to spare. A token expiring inside the
  // next minute is treated as already gone, because it will be by the time a request
  // built with it reaches the server.
  it('refreshes a token that is within a minute of expiring', async () => {
    storedCredentials(Date.now() + 30_000);
    const { getIdToken } = await import('../credentials');

    expect(await getIdToken()).toBe('fresh');
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  // NUMO_TOKEN is what an agent or CI job supplies, and there is nothing to refresh it
  // with — reading the file instead would silently use a different identity.
  it('returns NUMO_TOKEN untouched, without refreshing or rewriting the stored file', async () => {
    storedCredentials(Date.now() - 1000);
    process.env.NUMO_TOKEN = 'env-token';
    const { getIdToken } = await import('../credentials');

    expect(await getIdToken()).toBe('env-token');
    expect(http.post).not.toHaveBeenCalled();
    expect(savedCredentials().idToken).toBe('cached');
  });
});
