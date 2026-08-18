import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../credentials', () => ({ saveCredentials: vi.fn() }));
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  log: { info: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { readEnvCredentials, saveAuthResult, reportAuthFailure } from '../login';
import { saveCredentials } from '../credentials';
import { CliError, ErrorKind, ExitCode } from '../../lib/errors';

// The plumbing both `numo login` and `numo register` run. It was written twice before
// it was named once, and these rules were held by neither copy.

describe('readEnvCredentials', () => {
  beforeEach(() => {
    delete process.env.NUMO_LOGIN_EMAIL;
    delete process.env.NUMO_LOGIN_PASSWORD;
  });
  afterEach(() => {
    delete process.env.NUMO_LOGIN_EMAIL;
    delete process.env.NUMO_LOGIN_PASSWORD;
  });

  // Contract: both halves or neither. One alone is a half-configured CI job, and the
  // answer has to be "not configured" — otherwise the flow proceeds as if it had
  // credentials and attempts a sign-in with an empty password, whose refusal reads as
  // "wrong password" rather than as the missing variable it is. In an interactive
  // terminal the other direction is worse: it prompts into a pipe that never answers.
  it.each([
    ['neither', {}],
    ['only the email', { NUMO_LOGIN_EMAIL: 'a@b.com' }],
    ['only the password', { NUMO_LOGIN_PASSWORD: 'pw123456' }],
  ])('reports nothing configured when %s is set', (_label, env) => {
    Object.assign(process.env, env);

    expect(readEnvCredentials()).toBeNull();
  });

  // Liveness: the pair is read when it really is a pair, or the rule above would be
  // "never configured" and non-interactive login would be impossible.
  it('reads the pair when both are set', () => {
    process.env.NUMO_LOGIN_EMAIL = 'a@b.com';
    process.env.NUMO_LOGIN_PASSWORD = 'pw123456';

    expect(readEnvCredentials()).toEqual({ email: 'a@b.com', password: 'pw123456' });
  });
});

describe('saveAuthResult', () => {
  beforeEach(() => vi.clearAllMocks());

  // Contract: `displayName` is stored as `email`. The rename is the whole reason this
  // has a name — both flows did it by hand, and a field landing in the wrong slot is
  // invisible until the next command greets the user as `undefined`.
  it('stores the handshake under the field names the credentials file uses', () => {
    saveAuthResult({
      refreshToken: 'rt',
      uid: 'u1',
      displayName: 'a@b.com',
      idToken: 'id',
      idTokenExpiry: 123,
    });

    expect(saveCredentials).toHaveBeenCalledWith({
      refreshToken: 'rt',
      uid: 'u1',
      email: 'a@b.com',
      idToken: 'id',
      idTokenExpiry: 123,
    });
  });
});

describe('reportAuthFailure', () => {
  let exited: number | undefined;
  let out: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    exited = undefined;
    out = [];
    vi.spyOn(console, 'log').mockImplementation((s) => void out.push(String(s)));
    vi.spyOn(console, 'error').mockImplementation((s) => void out.push(String(s)));
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      exited = code;
      throw new Error('__exit__');
    }) as never);
  });
  afterEach(() => vi.restoreAllMocks());

  const spinner = () => ({ start: vi.fn(), stop: vi.fn() });
  const run = (err: CliError, quietMode: boolean, s = spinner()) =>
    reportAuthFailure(err, { spinner: s, quietMode, stopMessage: 'Login failed' }).catch((e) => {
      if ((e as Error).message !== '__exit__') throw e;
    });

  const conflict = () =>
    new CliError(ErrorKind.CONFLICT, 'Already registered', ExitCode.CONFLICT, {
      suggestion: 'numo login',
    });

  // Contract: the process exits with the code that belongs to the kind, on BOTH paths.
  //
  // The interactive one had no test at all. In JSON mode the exit happens inside
  // `outputError`, so the trailing `process.exit` in this function is only ever reached
  // without `--json` — and a mutant that changed it to `exit(0)` left all 351 tests
  // green. An auth failure exiting 0 is the failure a shell `if` reads as success.
  it.each([
    ['in JSON mode', true],
    ['interactively', false],
  ])('exits with the kind exit code %s', async (_label, quietMode) => {
    await run(conflict(), quietMode);

    expect(exited).toBe(ExitCode.CONFLICT);
  });

  // Contract: JSON mode gets the parseable envelope on stderr; interactive mode does
  // not print one, or a human reads a blob and a script reading stdout gets nothing.
  it('writes the envelope only when one was asked for', async () => {
    await run(conflict(), true);
    expect(JSON.parse(out.join('\n')).error).toMatchObject({ kind: 'CONFLICT' });

    out = [];
    await run(conflict(), false);
    expect(() => JSON.parse(out.join('\n'))).toThrow();
  });

  // Contract: the spinner is stopped before anything is printed. A live spinner
  // repaints over the error, and in a pipe it interleaves with the output.
  it('stops the spinner with the caller message', async () => {
    const s = spinner();

    await run(conflict(), false, s);

    expect(s.stop).toHaveBeenCalledTimes(1);
    expect(String(s.stop.mock.calls[0]?.[0])).toContain('Login failed');
  });
});
