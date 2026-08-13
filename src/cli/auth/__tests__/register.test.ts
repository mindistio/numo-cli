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

    expect(vi.mocked(http.post).mock.calls[0][0]).toContain('/api/auth/register');
    expect(vi.mocked(http.post).mock.calls[0][1]).toEqual({ email: 'a@b.com', password: 'pw123456' });
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
    vi.mocked(postLogin).mockRejectedValue(new Error('Invalid email or password'));

    await run();

    expect(exitCode).toBe(ExitCode.CONFLICT);
    expect(output().error).toMatchObject({ kind: 'CONFLICT', code: ExitCode.CONFLICT });
  });

  // The CLI never observes whether mail was sent, so it must not say that it was.
  // Asserting a send it cannot see is the same class of untruth this release removes.
  it('does not claim a reset email was sent', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { status: 'ok' } } as never);
    vi.mocked(postLogin).mockRejectedValue(new Error('Invalid email or password'));

    await run();
    const { message, hint } = output().error;
    expect(`${message} ${hint}`).toMatch(/may have been sent/i);
    expect(`${message} ${hint}`).not.toMatch(/we (have )?sent|email sent/i);
  });

  it('does not store credentials when the address was taken', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: { status: 'ok' } } as never);
    vi.mocked(postLogin).mockRejectedValue(new Error('Invalid email or password'));

    await run();
    expect(saveCredentials).not.toHaveBeenCalled();
  });

  it('refuses non-interactively without credentials in the environment', async () => {
    delete process.env.NUMO_LOGIN_EMAIL;
    delete process.env.NUMO_LOGIN_PASSWORD;

    await run();

    expect(exitCode).toBe(ExitCode.CONFIG);
    expect(http.post).not.toHaveBeenCalled();
  });
});
