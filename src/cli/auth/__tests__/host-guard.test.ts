import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// The guard is the thing under test, so it is the one mock that behaves like the real
// one: it throws for an untrusted base. Every other auth test mocks it to a no-op, which
// is right for isolating those flows and is exactly why none of them can see it removed.
vi.mock('../../lib/api-base', () => ({
  assertSafeApiBase: vi.fn(() => {
    throw new CliError(ErrorKind.CONFIG_ERROR, 'Refusing to send credentials to untrusted host', ExitCode.CONFIG);
  }),
}));
vi.mock('../../lib/http', () => ({ http: { post: vi.fn(), get: vi.fn() } }));
vi.mock('../../lib/api-client', () => ({ API_BASE: 'https://evilnumo.ai' }));
vi.mock('../../lib/prompts', () => ({ promptText: vi.fn(async () => '+380501234567') }));
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(), outro: vi.fn(), log: { info: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock('open', () => ({ default: vi.fn(async () => ({ unref: vi.fn() })) }));

import { CliError, ErrorKind, ExitCode } from '../../lib/errors';
import { http } from '../../lib/http';
import { assertSafeApiBase } from '../../lib/api-base';

const spinner = { start: vi.fn(), stop: vi.fn() };

let tmp: string;
const env = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'numo-guard-'));
  process.env.NUMO_CONFIG_DIR = path.join(tmp, 'cfg');
  delete process.env.NUMO_TOKEN;
  process.env.NUMO_LOGIN_EMAIL = 'a@b.com';
  process.env.NUMO_LOGIN_PASSWORD = 'pw123456';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw Object.assign(new Error('__exit__'), { exitCode: code });
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...env };
  fs.rmSync(tmp, { recursive: true, force: true });
  vi.resetModules();
});

/** A stored profile whose cached token has expired, so any use of it must refresh. */
function storedCredentials() {
  const dir = path.join(tmp, 'cfg');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'credentials.json'),
    JSON.stringify({ refreshToken: 'rt', uid: 'u1', email: 'a@b.com', idToken: 'stale', idTokenExpiry: Date.now() - 1000 }),
    { mode: 0o600 },
  );
}

// Invariant: nothing that carries a credential leaves the process before the configured
// host has been classified as safe to send one to. Every entry point below reaches the
// network with a password, a refresh token or a phone number attached, and the guard is
// the only thing standing between that and a host an attacker chose via NUMO_API_URL.
//
// Covered per entry point rather than once: the guard is a separate call in each, and the
// classifier next door being well tested is what made all four look covered when none was.
describe('credential paths refuse an untrusted host', () => {
  // `register` reports the refusal itself and exits instead of propagating, so what is
  // observable there is that it exited at all. The others let the error reach their caller,
  // where the kind is what a caller branches on. Its kind is not compared here because
  // each entry point is imported after a module reset and so carries its own CliError
  // class — an instanceof across that boundary is false for reasons unrelated to the rule.
  const ENTRY_POINTS: [string, () => Promise<unknown>, (err: unknown) => void][] = [
    ['postLogin', async () => {
      const { postLogin } = await import('../login');
      return postLogin('a@b.com', 'pw123456');
    }, (err) => expect(err).toMatchObject({ kind: 'CONFIG_ERROR', exitCode: ExitCode.CONFIG })],
    ['register', async () => {
      const { register } = await import('../register');
      return register({ json: true });
    }, (err) => expect((err as Error).message).toBe('__exit__')],
    ['authenticateWithPhone', async () => {
      const { authenticateWithPhone } = await import('../phone-login');
      return authenticateWithPhone(spinner);
    }, (err) => expect(err).toMatchObject({ kind: 'CONFIG_ERROR', exitCode: ExitCode.CONFIG })],
    ['token refresh', async () => {
      storedCredentials();
      const { getIdToken } = await import('../credentials');
      return getIdToken();
    }, (err) => expect(err).toMatchObject({ kind: 'CONFIG_ERROR', exitCode: ExitCode.CONFIG })],
  ];

  it.each(ENTRY_POINTS)('%s asks the guard and sends nothing when it refuses', async (_name, call, expectFailure) => {
    let thrown: unknown;
    await call().then(
      () => { throw new Error('resolved instead of refusing an untrusted host'); },
      (err) => { thrown = err; },
    );
    expectFailure(thrown);

    expect(assertSafeApiBase).toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
    expect(http.get).not.toHaveBeenCalled();
  });
});
