import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/http', () => ({ http: { post: vi.fn() } }));
vi.mock('../../lib/api-base', () => ({ assertSafeApiBase: vi.fn() }));
vi.mock('../../lib/api-client', () => ({ API_BASE: 'http://localhost:3000' }));
vi.mock('../credentials', () => ({ saveCredentials: vi.fn() }));
vi.mock('../login', () => ({ postLogin: vi.fn(), printSuccess: vi.fn() }));
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(), outro: vi.fn(),
  log: { info: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { register } from '../register';
import { http } from '../../lib/http';
import { postLogin } from '../login';
import { saveCredentials } from '../credentials';
import { ExitCode } from '../../lib/errors';

const authResult = {
  refreshToken: 'rt', uid: 'u1', displayName: 'a@b.com', idToken: 'id', idTokenExpiry: 123,
};

const verifiedToken = () =>
  `h.${Buffer.from(JSON.stringify({ email_verified: true })).toString('base64url')}.s`;

// The shape `http` actually throws (see lib/http.ts — it attaches `response` with the
// status). A bare Error is what a *network* failure looks like, so mocking a taken
// address with one asserts nothing about the distinction the code has to make.
const httpError = (status: number, message = 'nope') =>
  Object.assign(new Error(message), { response: { status, headers: {}, data: {} } });

const authRefusal = () => httpError(401, 'Invalid email or password');

let stdout: string[];
let exitCode: number | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  stdout = [];
  exitCode = undefined;
  process.env.NUMO_LOGIN_EMAIL = 'a@b.com';
  process.env.NUMO_LOGIN_PASSWORD = 'pw123456';
  vi.spyOn(console, 'log').mockImplementation((s) => { stdout.push(String(s)); });
  vi.spyOn(console, 'error').mockImplementation((s) => { stdout.push(String(s)); });
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCode = code;
    throw new Error('__exit__');
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.NUMO_LOGIN_EMAIL;
  delete process.env.NUMO_LOGIN_PASSWORD;
});

const run = () => register({ json: true }).catch((e) => { if (e.message !== '__exit__') throw e; });
const output = () => JSON.parse(stdout.join('\n'));

describe('numo register', () => {
  it('registers, then signs in with the same credentials', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { status: 'ok' } } as never);
    vi.mocked(postLogin).mockResolvedValue(authResult);

    await run();

    // Over every call, not the first one: the password is in this body, so a second
    // request carrying it — a retry, a duplicated call — is the thing worth ruling out.
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/register'),
      { email: 'a@b.com', password: 'pw123456' },
    );
    expect(postLogin).toHaveBeenCalledWith('a@b.com', 'pw123456');
  });

  // Contract: a successful register leaves the caller authenticated. Without this
  // the next command would ask them to log in again, seconds after signing up.
  it('stores the credentials so the next command is already authenticated', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { status: 'ok' } } as never);
    vi.mocked(postLogin).mockResolvedValue(authResult);

    await run();
    expect(saveCredentials).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: 'rt', uid: 'u1' }));
  });

  // Contract: a new account cannot be verified yet, and saying so up front is what
  // stops the first `tasks create` from being a surprise.
  it('reports emailVerified false rather than omitting it', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { status: 'ok' } } as never);
    vi.mocked(postLogin).mockResolvedValue(authResult);

    await run();
    expect(output()).toMatchObject({ ok: true, uid: 'u1', emailVerified: false });
  });

  // ...but it is read, not assumed. Registering an address that already exists,
  // with its own password, signs into an account that may be verified already —
  // reporting a hardcoded false there would be a plain untruth.
  it('reports emailVerified true when the account it signed into is verified', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { status: 'ok' } } as never);
    vi.mocked(postLogin).mockResolvedValue({ ...authResult, idToken: verifiedToken() });

    await run();
    expect(output()).toMatchObject({ emailVerified: true });
  });

  // The server answers register identically whether or not the address was free —
  // it has to, or it becomes a way to test which addresses exist. So a failed
  // sign-in afterwards is the only signal that the address was already taken.
  it('reports a taken address as CONFLICT, not as a failed login', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { status: 'ok' } } as never);
    vi.mocked(postLogin).mockRejectedValue(authRefusal());

    await run();

    expect(exitCode).toBe(ExitCode.CONFLICT);
    expect(output().error).toMatchObject({ kind: 'CONFLICT', code: ExitCode.CONFLICT });
  });

  // Contract: the refusal names a recovery the reader can reach, and points at no
  // inbox. numo-api mails nothing on this path (services/registration.ts — an
  // unrequested reset link in a stranger's inbox is the habit reset-phishing
  // depends on), so any wording that leaves the reader watching for mail sends
  // them to wait for something that is never coming.
  //
  // The previous version of this test asserted the exact hedge then in use
  // ("may have been sent"), which pinned the wording rather than the rule and went
  // red the moment the rule was satisfied more strongly.
  //
  // Liveness: the positive half proves the assertion reads a real hint, so the
  // refusal below is a refusal and not an empty string matching everything.
  it('points at a reachable reset instead of an inbox', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { status: 'ok' } } as never);
    vi.mocked(postLogin).mockRejectedValue(authRefusal());

    await run();
    const { message, hint } = output().error;
    const said = `${message} ${hint}`;
    expect(said).toMatch(/numo\.ai/);
    expect(said).not.toMatch(/sent|inbox|spam|check your (mail|email)/i);
  });

  it('does not store credentials when the address was taken', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { status: 'ok' } } as never);
    vi.mocked(postLogin).mockRejectedValue(authRefusal());

    await run();
    expect(saveCredentials).not.toHaveBeenCalled();
  });

  // Contract: only a *refused* sign-in means the address was taken. Everything else
  // that can fail between "account created" and "signed in" — the login limiter (10/min
  // against register's 5), a 5xx, a dropped connection — is reported as itself.
  //
  // This is the boundary the previous tests had inverted: they mocked a bare Error,
  // which is what the network case looks like, and asserted it WAS CONFLICT. So the
  // suite pinned the defect — someone whose account had just been created was told it
  // already existed, given exit 101, and had their credentials discarded.
  // 400 is in the table on purpose: it is the neighbour of the one status that DOES
  // mean "taken". numo-api answers every credential refusal with 401; its only 400 from
  // login is INVALID_EMAIL — the address is malformed, not held by someone else.
  it.each([
    [400, 'INVALID_INPUT', ExitCode.USAGE],
    [429, 'RATE_LIMITED', ExitCode.TEMP_FAIL],
    [503, 'SERVICE_UNAVAILABLE', ExitCode.UNAVAILABLE],
  ])('reports a %i between register and sign-in as itself', async (status, kind, code) => {
    vi.mocked(http.post).mockResolvedValue({ data: { status: 'ok' } } as never);
    vi.mocked(postLogin).mockRejectedValue(httpError(status as number));

    await run();

    expect(output().error).toMatchObject({ kind, code });
    expect(exitCode).toBe(code);
  });

  // Contract: reporting the failure as itself is not enough — the account exists by
  // then, and the caller has to be told, or they sign up again for an address that is
  // now taken by themselves. `numo login` is the command that actually works.
  it('says the account exists when only the sign-in failed', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { status: 'ok' } } as never);
    vi.mocked(postLogin).mockRejectedValue(httpError(429));

    await run();

    const { suggestion, hint } = output().error;
    expect(suggestion).toBe('numo login');
    expect(hint).toMatch(/account was created/i);
  });

  // ...and not when the address really was someone else's, where "the account was
  // created" would be exactly backwards.
  it('does not claim an account was created when the address was taken', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { status: 'ok' } } as never);
    vi.mocked(postLogin).mockRejectedValue(authRefusal());

    await run();
    expect(`${output().error.hint}`).not.toMatch(/account was created/i);
  });

  // Liveness for the pair above: the register call itself can still fail, and then
  // nothing was created and there is no session to go and get.
  it('does not claim an account was created when register itself failed', async () => {
    vi.mocked(http.post).mockRejectedValue(httpError(429));

    await run();

    expect(postLogin).not.toHaveBeenCalled();
    expect(`${output().error.hint}`).not.toMatch(/account was created/i);
  });

  // No status at all — a connection dropped after the account was created. This is the
  // exact value the removed assertions used to stand in for a taken address.
  it('reports a dropped connection as itself, not as a taken address', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { status: 'ok' } } as never);
    vi.mocked(postLogin).mockRejectedValue(new Error('socket hang up'));

    await run();

    expect(output().error.kind).not.toBe('CONFLICT');
    expect(exitCode).not.toBe(ExitCode.CONFLICT);
  });

  it('refuses non-interactively without credentials in the environment', async () => {
    delete process.env.NUMO_LOGIN_EMAIL;
    delete process.env.NUMO_LOGIN_PASSWORD;

    await run();

    expect(exitCode).toBe(ExitCode.CONFIG);
    expect(http.post).not.toHaveBeenCalled();
  });
});
