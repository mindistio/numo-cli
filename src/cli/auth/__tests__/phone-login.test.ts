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

  // I-8: no request the CLI makes carries the pollSecret in a URL — not the first poll,
  // any of them. Checking only call[0] leaves every retry unchecked, and a retry is the
  // normal case: the user is walking to their phone while the loop keeps going. A URL is
  // the one place a secret is retained by proxies, access logs and shell history alike.
  it('I-8 — never puts the pollSecret in a URL, across every request it makes', async () => {
    const { http } = await import('../../lib/http');
    vi.mocked(http.post).mockResolvedValueOnce({
      data: { sessionId: 'sess-2', pollSecret: 'secret-abc', userCode: 'PAIR99', verifyUrl: 'http://localhost:3000/auth/phone/verify?session=sess-2' },
    } as never);
    vi.mocked(http.get)
      .mockResolvedValueOnce({ status: 202, data: { status: 'pending' } } as never)
      .mockResolvedValueOnce({ status: 202, data: { status: 'pending' } } as never)
      .mockResolvedValueOnce({ status: 200, data: { idToken: 'tok', refreshToken: 'rt', uid: 'u1', expiresIn: 3600 } } as never);

    const { authenticateWithPhone } = await import('../phone-login');

    vi.useFakeTimers();
    const promise = authenticateWithPhone({ start: vi.fn(), stop: vi.fn() });
    await vi.advanceTimersByTimeAsync(6000);
    await promise;

    const urls = [
      ...vi.mocked(http.get).mock.calls.map(([url]) => String(url)),
      ...vi.mocked(http.post).mock.calls.map(([url]) => String(url)),
    ];
    expect(urls.length).toBeGreaterThan(3); // the retries actually happened
    for (const url of urls) expect(url).not.toContain('secret-abc');
  });

  // Contract: the intent reaches the server. Without it numo-api takes its legacy
  // no-gate path, where a login with an unregistered number silently CREATES an
  // account — so a mistyped digit signed the user into a new empty account with
  // nothing to read that said so.
  it.each([
    ['login', undefined],
    ['login', 'login' as const],
    ['signup', 'signup' as const],
  ])('sends intent %s to /phone/start', async (expected, passed) => {
    const { http } = await import('../../lib/http');
    vi.mocked(http.post).mockResolvedValueOnce({
      data: { sessionId: 's', pollSecret: 'ps', userCode: 'PAIR11', verifyUrl: 'http://localhost:3000/v' },
    } as never);
    vi.mocked(http.get).mockResolvedValueOnce({
      status: 200, data: { idToken: 't', refreshToken: 'r', uid: 'u', expiresIn: 3600 },
    } as never);

    const { authenticateWithPhone } = await import('../phone-login');

    vi.useFakeTimers();
    const promise = passed === undefined
      ? authenticateWithPhone({ start: vi.fn(), stop: vi.fn() })
      : authenticateWithPhone({ start: vi.fn(), stop: vi.fn() }, passed);
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    const [, body] = vi.mocked(http.post).mock.calls[0];
    expect(body).toMatchObject({ intent: expected });
  });

  // Contract: the gate's two refusals are reported as themselves, each naming the
  // command that would have worked. They are the only reason to send an intent at all;
  // rendered as a generic 403/404 the user learns nothing they can act on.
  it.each([
    [409, 'signup' as const, /already exists/i, 'numo login --phone'],
    [404, 'login' as const, /no account/i, 'numo register --phone'],
  ])('maps a %i from the gate to a suggestion', async (status, intent, message, suggestion) => {
    const { http } = await import('../../lib/http');
    vi.mocked(http.post).mockRejectedValueOnce(Object.assign(new Error('gate'), { response: { status } }));

    const { authenticateWithPhone } = await import('../phone-login');

    await expect(authenticateWithPhone({ start: vi.fn(), stop: vi.fn() }, intent)).rejects.toMatchObject({
      message: expect.stringMatching(message),
      options: expect.objectContaining({ suggestion }),
    });
  });

  // Contract: those two mappings belong to the intent that was sent, and to nothing
  // else. numo-api throws 409 only for `signup` and 404 only for `login`
  // (routes/auth.ts), so the mismatched pairs below cannot have come from the gate — a
  // proxy, or a mistyped path in NUMO_API_URL, produces them. Read as the gate anyway,
  // the CLI answered "already exists, try `numo login --phone`" to someone who had
  // just run `numo login --phone`, and did so forever.
  //
  // The rows above are the liveness partner: the matched pairs still get their
  // suggestion, so this is about the mismatch, not about the mapping having gone.
  it.each([
    [409, 'login' as const],
    [404, 'signup' as const],
  ])('does not read a %i under intent %s as the gate', async (status, intent) => {
    const { http } = await import('../../lib/http');
    vi.mocked(http.post).mockRejectedValueOnce(
      Object.assign(new Error('not the gate'), { response: { status } })
    );

    const { authenticateWithPhone } = await import('../phone-login');

    const err = await authenticateWithPhone({ start: vi.fn(), stop: vi.fn() }, intent).catch(
      (e) => e
    );
    // However it is reported, it must not name the command the user just ran.
    expect(err?.options?.suggestion).not.toBe(
      intent === 'signup' ? 'numo register --phone' : 'numo login --phone'
    );
  });

  // Contract: an expired session sends the user back to the command they were running.
  // Hardcoding login sent a first-time `numo register --phone` user — whose session had
  // merely timed out, so no account exists — to a login the gate then refuses, which
  // suggests register, which brings them back here.
  it('names the command that was running when the session expired', async () => {
    const { http } = await import('../../lib/http');
    vi.mocked(http.post).mockResolvedValueOnce({
      data: {
        sessionId: 's',
        pollSecret: 's',
        userCode: 'PAIR00',
        verifyUrl: 'http://localhost:3000/v',
      },
    } as never);
    vi.mocked(http.get).mockRejectedValue(
      Object.assign(new Error('gone'), { response: { status: 404 } })
    );

    const { authenticateWithPhone } = await import('../phone-login');

    vi.useFakeTimers();
    const promise = authenticateWithPhone({ start: vi.fn(), stop: vi.fn() }, 'signup').catch(
      (e) => e
    );
    await vi.advanceTimersByTimeAsync(2000);

    expect((await promise)?.options?.suggestion).toBe('numo register --phone');
  });

  // Contract: the number is checked here, before it is sent. A malformed one would
  // otherwise start a session that can never be confirmed, and the user waits out the
  // full poll window to find that out.
  it('refuses a number that is not E.164 without starting a session', async () => {
    const { promptText } = await import('../../lib/prompts');
    const { http } = await import('../../lib/http');
    vi.mocked(promptText).mockResolvedValueOnce('0501234567');

    const { authenticateWithPhone } = await import('../phone-login');

    await expect(authenticateWithPhone({ start: vi.fn(), stop: vi.fn() }))
      .rejects.toMatchObject({ kind: 'INVALID_INPUT' });
    expect(http.post).not.toHaveBeenCalled();
  });

  // Contract: a session the server no longer has is reported, not waited on. Treating it
  // like any other poll error means polling a dead session for the rest of the window and
  // then reporting a timeout, which points the user at the wrong problem.
  it('stops as soon as the session is gone rather than polling out the window', async () => {
    const { http } = await import('../../lib/http');
    vi.mocked(http.post).mockResolvedValueOnce({
      data: { sessionId: 'sess-3', pollSecret: 's', userCode: 'PAIR00', verifyUrl: 'http://localhost:3000/v' },
    } as never);
    vi.mocked(http.get).mockRejectedValue(Object.assign(new Error('gone'), { response: { status: 404 } }));

    const { authenticateWithPhone } = await import('../phone-login');

    vi.useFakeTimers();
    const promise = authenticateWithPhone({ start: vi.fn(), stop: vi.fn() });
    const outcome = expect(promise).rejects.toThrow(/session expired/i);
    await vi.advanceTimersByTimeAsync(6000);
    await outcome;

    // One poll, not a window's worth: the point is that it stopped.
    expect(vi.mocked(http.get).mock.calls.length).toBe(1);
  });

  // Contract: 404 is not the only settled answer. Any other 4xx — a poll secret the
  // server rejects, a malformed request — cannot become a success by asking again, and
  // waiting the window out reports it as NETWORK_ERROR with retryable: true, which
  // names the wrong problem and invites the same five minutes over.
  it.each([
    [401, 'AUTH_REQUIRED'],
    [403, 'AUTH_FORBIDDEN'],
    [400, 'INVALID_INPUT'],
  ])('stops on a %i instead of polling out the window', async (status, kind) => {
    const { http } = await import('../../lib/http');
    vi.mocked(http.post).mockResolvedValueOnce({
      data: { sessionId: 'sess-4', pollSecret: 's', userCode: 'PAIR11', verifyUrl: 'http://localhost:3000/v' },
    } as never);
    vi.mocked(http.get).mockRejectedValue(
      Object.assign(new Error('refused'), { response: { status, headers: {}, data: {} } }),
    );

    const { authenticateWithPhone } = await import('../phone-login');

    vi.useFakeTimers();
    const promise = authenticateWithPhone({ start: vi.fn(), stop: vi.fn() });
    const outcome = expect(promise).rejects.toMatchObject({ kind });
    await vi.advanceTimersByTimeAsync(6000);
    await outcome;

    expect(vi.mocked(http.get).mock.calls.length).toBe(1);
  });

  // ...and the two 4xx that mean "later" keep the loop alive, or the rule above would
  // turn a rate-limited poll into a dead session. Liveness for that rule: the loop must
  // still be able to succeed after a refusal, not merely stop on the ones listed.
  it.each([[408], [429]])('keeps polling through a %i', async (status) => {
    const { http } = await import('../../lib/http');
    vi.mocked(http.post).mockResolvedValueOnce({
      data: { sessionId: 'sess-5', pollSecret: 's', userCode: 'PAIR22', verifyUrl: 'http://localhost:3000/v' },
    } as never);
    vi.mocked(http.get)
      .mockRejectedValueOnce(
        Object.assign(new Error('later'), { response: { status, headers: {}, data: {} } }),
      )
      .mockResolvedValueOnce({
        status: 200,
        data: { idToken: 'tok', refreshToken: 'rt', uid: 'u9', expiresIn: 3600 },
      } as never);

    const { authenticateWithPhone } = await import('../phone-login');

    vi.useFakeTimers();
    const promise = authenticateWithPhone({ start: vi.fn(), stop: vi.fn() });
    await vi.advanceTimersByTimeAsync(6000);

    await expect(promise).resolves.toMatchObject({ uid: 'u9' });
    expect(vi.mocked(http.get).mock.calls.length).toBe(2);
  });
});
