import { describe, it, expect, afterEach } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length) fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function configDir(withCredentials = false, idToken?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'numo-cli-test-'));
  tempDirs.push(dir);
  if (withCredentials) {
    const creds = { refreshToken: 'rt', uid: 'file-uid', email: 'file@example.com', idToken };
    fs.writeFileSync(path.join(dir, 'credentials.json'), JSON.stringify(creds), { mode: 0o600 });
  }
  return dir;
}

function unexpiredToken(extraClaims: Record<string, unknown> = {}): string {
  const claims = {
    exp: Math.floor(Date.now() / 1000) + 3600,
    email: 'env@example.com',
    user_id: 'env-uid',
    ...extraClaims,
  };
  return `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`;
}

/**
 * Environment for the child CLI. FORCE_COLOR is removed rather than overridden: Node
 * writes a warning to stderr when it sees both it and NO_COLOR, and several cases here
 * parse stderr as JSON. A developer who exports FORCE_COLOR would otherwise see them fail
 * for a reason unrelated to whatever they changed.
 */
function childEnv(extraEnv?: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1', npm_config_loglevel: 'error', ...extraEnv };
  delete env.FORCE_COLOR;
  return env;
}

function run(args: string): string {
  return execSync(`npx tsx src/cli/cli.ts ${args}`, {
    encoding: 'utf8',
    timeout: 10000,
    env: childEnv(),
  });
}

function runMayFail(args: string, extraEnv?: Record<string, string>): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execSync(`npx tsx src/cli/cli.ts ${args}`, {
      encoding: 'utf8',
      timeout: 10000,
      env: childEnv(extraEnv),
    });
    return { stdout, stderr: '', status: 0 };
  } catch (err: any) {
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? '', status: err.status ?? 1 };
  }
}

// Help text is not tested here. Three cases used to assert that `Examples:` appears in
// `--help` output, at about half a second of subprocess each; none named a rule, and the
// last only proved Commander prints an option declared three lines away from it. What
// matters about --help — exit 0 and nothing on stderr — is held below.

describe('commands --json', () => {
  // Contract: the root envelope. Agents pin behaviour by branching on `schemaVersion`,
  // so it disappearing or changing meaning without a bump breaks them silently. The
  // literal is spelled out rather than imported so a bump cannot land without this diff.
  it('carries the versioned envelope agents branch on', () => {
    const data = JSON.parse(run('commands --json'));
    expect(data.schemaVersion).toBe('1');
    // Cross-checked against --version rather than hard-coded: the envelope has to report
    // the version the CLI actually is, not one that drifted from it.
    expect(data.cliVersion).toBe(run('--version').trim());
  });

  // Contract: every runnable command is listed — this is the whole discovery surface for
  // an agent. A count threshold passes on a truncated list, so the names are snapshotted:
  // adding or removing a command has to appear in this diff.
  it('lists every runnable command', () => {
    const { commands } = JSON.parse(run('commands --json'));
    expect(commands.map((c: any) => c.name)).toMatchSnapshot();
  });

  it('gives every command a name and a description', () => {
    const { commands } = JSON.parse(run('commands --json'));
    // Liveness first. The per-item check below holds nothing on an empty list, and an
    // empty list is exactly what a broken traversal produces. Completeness is the
    // snapshot above; this only has to rule out the vacuous pass.
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.filter((c: any) => !c.name?.trim() || !c.description?.trim())).toEqual([]);
  });
});

describe('schema', () => {
  // Deliberately a different literal from the commands payload above: the two are
  // versioned separately, and pinning both here is what keeps a shared bump from passing
  // unnoticed.
  it('reports schema version 2', () => {
    expect(JSON.parse(run('schema')).schemaVersion).toBe('2');
  });

  // Invariant: the two introspection surfaces describe the same command set. They are
  // separate traversals — `command-map.ts` and the walk in `cli.ts` — so one of them
  // going short surfaces as disagreement here instead of as a quietly shorter list.
  it('describes exactly the commands that `numo commands` lists', () => {
    const listed = JSON.parse(run('commands --json')).commands.map((c: any) => c.name).sort();
    const described = JSON.parse(run('schema')).commands.map((c: any) => c.name).sort();
    expect(described).toEqual(listed);
    expect(described.length).toBeGreaterThan(0);
  });

  it('schema tasks create has options', () => {
    const out = run('schema "tasks create"');
    const data = JSON.parse(out);
    expect(data.name).toBe('tasks create');
    expect(data.options).toBeDefined();
    expect(data.options.some((o: any) => o.flags.includes('--text'))).toBe(true);
  });

  // Contract: a failure here is the same JSON envelope as everywhere else. This asserted
  // the wording instead — the one thing an agent is told never to branch on — and so
  // ratified a path that printed bare text, where `JSON.parse(stderr)` threw for exactly
  // the caller the command exists to serve.
  it('reports an unknown command in the error envelope, exit 2', () => {
    const { stdout, stderr, status } = runMayFail('schema nonexistent --json');
    expect(status).toBe(2);
    expect(stdout).toBe('');
    expect(JSON.parse(stderr).error).toMatchObject({ kind: 'INVALID_INPUT', code: 2 });
  });
});

describe('completion', () => {
  // zsh reads `#compdef` only as the first line of the file, so its position is the
  // contract, not its presence.
  it('emits a zsh script whose first line is the compdef tag', () => {
    expect(run('completion zsh').split('\n')[0]).toBe('#compdef numo');
  });

  it('rejects an unsupported shell in the error envelope, exit 2', () => {
    const { status, stderr } = runMayFail('completion bash --json');
    expect(status).toBe(2);
    expect(JSON.parse(stderr).error).toMatchObject({ kind: 'INVALID_INPUT', code: 2 });
  });
});

describe('whoami (not logged in)', () => {
  it('exits with code 77', () => {
    // NUMO_TOKEN blanked explicitly: runMayFail inherits the real environment, so a
    // developer who happens to export one would see this pass for the wrong reason.
    const { status } = runMayFail('whoami', { HOME: '/tmp/numo-test-no-creds', NUMO_CONFIG_DIR: '/tmp/numo-test-no-creds', NUMO_TOKEN: '' });
    expect(status).toBe(77);
  });
});

describe('whoami', () => {
  // Contract: whoami describes the identity the API calls will actually use. NUMO_TOKEN
  // wins over the credentials file there, so it has to win here — otherwise whoami
  // vouches for an account the next request will not be made as.
  it('reports NUMO_TOKEN even when a credentials file is also present', () => {
    const { stdout } = runMayFail('whoami --json', {
      NUMO_CONFIG_DIR: configDir(true),
      NUMO_TOKEN: unexpiredToken(),
    });
    expect(JSON.parse(stdout)).toMatchObject({
      email: 'env@example.com',
      uid: 'env-uid',
      source: 'NUMO_TOKEN',
      autoRefresh: false,
    });
  });

  // Contract: the verification value never appears without the markers saying it
  // came from a stored token. An agent that treats it as authoritative will tell a
  // user who verified a minute ago that they are still blocked — the claim is
  // minted with the token and does not change until the token is replaced.
  it('marks emailVerified as a cached, stale reading', () => {
    const { stdout } = runMayFail('whoami --json', {
      NUMO_CONFIG_DIR: configDir(),
      NUMO_TOKEN: unexpiredToken({ email_verified: true }),
    });
    expect(JSON.parse(stdout)).toMatchObject({
      emailVerified: true,
      emailVerifiedSource: 'cached_token',
      emailVerifiedStale: true,
    });
  });

  it('reads the claim from the credentials file too, not only from NUMO_TOKEN', () => {
    const { stdout } = runMayFail('whoami --json', {
      NUMO_CONFIG_DIR: configDir(true, unexpiredToken({ email_verified: false })),
      NUMO_TOKEN: '',
    });
    expect(JSON.parse(stdout)).toMatchObject({
      source: 'credentials_file',
      emailVerified: false,
      emailVerifiedSource: 'cached_token',
    });
  });

  it('reports null rather than false when there is no token to read', () => {
    const { stdout } = runMayFail('whoami --json', {
      NUMO_CONFIG_DIR: configDir(true),
      NUMO_TOKEN: '',
    });
    expect(JSON.parse(stdout)).toMatchObject({
      emailVerified: null,
      emailVerifiedSource: null,
      emailVerifiedStale: null,
    });
  });
});

describe('logout', () => {
  it('deletes the credentials and reports it in JSON mode', () => {
    const dir = configDir(true);
    const { stdout, status } = runMayFail('logout --json', { NUMO_CONFIG_DIR: dir, NUMO_TOKEN: '' });
    expect(status).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ loggedOut: true });
    expect(fs.existsSync(path.join(dir, 'credentials.json'))).toBe(false);
  });

  it('says NUMO_TOKEN is still set, because clearing the file does not de-authenticate', () => {
    const { stdout } = runMayFail('logout --json', {
      NUMO_CONFIG_DIR: configDir(true),
      NUMO_TOKEN: unexpiredToken(),
    });
    expect(JSON.parse(stdout).envTokenStillSet).toBe(true);
  });

  it('succeeds when there is nothing to clear', () => {
    expect(runMayFail('logout --json', { NUMO_CONFIG_DIR: configDir() }).status).toBe(0);
  });

  it('fails loudly when the credentials cannot be removed', () => {
    // Previously every failure here was swallowed, so logout reported success while
    // the refresh token stayed on disk.
    const dir = configDir();
    fs.mkdirSync(path.join(dir, 'credentials.json'));
    const { status, stderr } = runMayFail('logout --json', { NUMO_CONFIG_DIR: dir });
    expect(status).not.toBe(0);
    expect(JSON.parse(stderr).error).toBeDefined();
  });
});

// `--version` has no case of its own: the literal it printed here is the dev-mode
// fallback, which no published build emits, and the envelope test above already requires
// `cliVersion` to equal whatever `--version` reports.

describe('argument-parsing failures', () => {
  // Commander handles these itself by default, printing bare text and exiting 1 —
  // outside the error contract every other failure obeys.
  it.each([
    ['tasks nonexistent --json', 'INVALID_INPUT'],
    ['tasks list --badopt --json', 'INVALID_INPUT'],
    ['tasks --json', 'MISSING_ARGUMENT'],
  ])('%s → parsable JSON on stderr, exit 2', (args, kind) => {
    const { stdout, stderr, status } = runMayFail(args);
    expect(status).toBe(2);
    expect(stdout).toBe('');
    expect(JSON.parse(stderr).error).toMatchObject({ kind, code: 2 });
  });

  // No separate subcommand-level case: the `tasks nonexistent --json` row above is that
  // path, and asserts the kind and an empty stdout where the separate one asserted only 2.

  it('--help and --version stay successful and quiet on stderr', () => {
    for (const flag of ['--help', '--version']) {
      const { stderr, status } = runMayFail(flag);
      expect(status).toBe(0);
      expect(stderr).toBe('');
    }
  });
});

/**
 * Bare `numo`, run by someone with no account.
 *
 * The one user-facing behaviour this branch added that had no test at all: a grep for
 * its message found exactly one hit, the source line. It also runs at module top level,
 * before Commander parses anything, so it is only observable from outside the process —
 * hence the subprocess, as everywhere else in this file.
 */
describe('bare `numo` with no way to authenticate', () => {
  const noAccount = () => ({ NUMO_CONFIG_DIR: configDir(), NUMO_TOKEN: '' });

  // Contract: name the two ways to get an account, and exit NO_PERM. Every command below
  // it needs one, so a wall of them is a worse answer than the two that work — and the
  // exit code is what lets a script tell "not signed in" from "you typed it wrong".
  it('names both ways in, and exits NO_PERM', () => {
    const { status, stderr } = runMayFail('', noAccount());

    expect(status).toBe(77);
    expect(stderr).toMatch(/numo register/);
    expect(stderr).toMatch(/numo login/);
  });

  // Contract: it starts nothing. Auto-launching a login prompt is hostile in a script
  // and hangs in CI, which is the reason this refuses rather than helps.
  it('leaves stdout empty rather than opening a flow', () => {
    const { stdout } = runMayFail('', noAccount());

    expect(stdout).toBe('');
  });

  // Liveness, and the answer to whether the behaviour is defensible at all: `--help` is
  // not intercepted, so someone with no account can still read what the tool does.
  // Without this row, "refuse everything" would satisfy the contract above.
  it('still shows --help to someone with no account', () => {
    const { status, stdout } = runMayFail('--help', noAccount());

    expect(status).toBe(0);
    expect(stdout).toMatch(/Commands:/);
  });

  // The other liveness half: with credentials the intercept does not fire at all, and
  // bare `numo` is an ordinary missing-subcommand. A rule that always fired would pass
  // the first case and refuse every signed-in user.
  it('does not fire for someone who is signed in', () => {
    const { status, stderr } = runMayFail('', {
      NUMO_CONFIG_DIR: configDir(true),
      NUMO_TOKEN: '',
    });

    expect(status).not.toBe(77);
    expect(stderr).not.toMatch(/Not signed in/);
  });
});
