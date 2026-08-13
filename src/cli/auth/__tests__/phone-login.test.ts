import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Phone auth is a two-step capability handshake: /phone/start hands the CLI a
// pollSecret; /phone/poll rejects the request without it. This locks that the CLI
// carries the secret back, and that it never travels in the URL.

vi.mock('../../lib/http', () => ({ http: { post: vi.fn(), get: vi.fn() } }));
vi.mock('../../lib/prompts', () => ({ promptText: vi.fn().mockResolvedValue('+380501234567') }));
vi.mock('../../lib/api-base', () => ({ assertSafeApiBase: vi.fn() }));
vi.mock('../../lib/api-client', () => ({ API_BASE: 'http://localhost:3000' }));
vi.mock('@clack/prompts', () => ({ log: { info: vi.fn() } }));
vi.mock('open', () => ({ default: vi.fn().mockResolvedValue({ unref: vi.fn() }) }));

describe('authenticateWithPhone', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it('polls with the session id in the URL and the pollSecret in a header', async () => {
    const { http } = await import('../../lib/http');
    vi.mocked(http.post).mockResolvedValueOnce({
      data: { sessionId: 'sess-1', pollSecret: 'secret-xyz', userCode: 'PAIR42', verifyUrl: 'http://localhost:3000/auth/phone/verify?session=sess-1' },
    } as never);
    vi.mocked(http.get).mockResolvedValueOnce({
      status: 200,
      data: { idToken: 'tok', refreshToken: 'rt', uid: 'u1', expiresIn: 3600 },
    } as never);

    const { authenticateWithPhone } = await import('../phone-login');

    vi.useFakeTimers();
    const promise = authenticateWithPhone({ start: vi.fn(), stop: vi.fn() });
    await vi.advanceTimersByTimeAsync(2000); // first poll fires after POLL_INTERVAL
    const result = await promise;

    expect(result).toMatchObject({ idToken: 'tok', uid: 'u1', refreshToken: 'rt' });
    const [polledUrl, pollOpts] = vi.mocked(http.get).mock.calls[0];
    expect(polledUrl).toContain('session=sess-1');
    // Contract: the secret reaches the server. Invariant: never through the URL,
    // which proxies, access logs and shell history all retain.
    expect(pollOpts?.headers).toMatchObject({ 'x-poll-secret': 'secret-xyz' });
    expect(polledUrl).not.toContain('secret-xyz');

    // The device-grant userCode must be shown to the user — the verify page
    // 400s without it, and this terminal is the ONLY place it appears.
    const p = await import('@clack/prompts');
    const shownCode = vi.mocked(p.log.info).mock.calls.some(([msg]) => String(msg).includes('PAIR42'));
    expect(shownCode).toBe(true);
  });
});
