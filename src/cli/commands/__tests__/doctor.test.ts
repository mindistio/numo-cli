import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

vi.mock('../../lib/api-client', () => ({ API_BASE: 'https://api.numo.ai' }));
vi.mock('../../lib/api-base', () => ({ classifyApiBase: vi.fn(() => ({ ok: true, insecure: false })) }));
vi.mock('../../auth/credentials', () => ({
  loadCredentials: vi.fn(() => ({ refreshToken: 'rt', uid: 'u1', email: 'a@b.com' })),
  getIdToken: vi.fn(async () => 'id-token'),
}));
vi.mock('../../services/me', () => ({ getMe: vi.fn() }));
vi.mock('../../lib/output', () => ({ printJson: vi.fn() }));
vi.mock('dns', () => ({ promises: { resolve: vi.fn(async () => ['203.0.113.1']) } }));
// The ready callback fires on a later tick, as the real socket's does — calling it
// synchronously would hand the code a socket variable it has not assigned yet.
vi.mock('tls', () => {
  const socket = { getProtocol: () => 'TLSv1.3', end: vi.fn(), on: vi.fn(), destroy: vi.fn() };
  return {
    default: {
      connect: vi.fn((_o: unknown, onReady: () => void) => { queueMicrotask(onReady); return socket; }),
    },
  };
});

import { registerDoctorCommand } from '../doctor';
import { classifyApiBase } from '../../lib/api-base';
import { loadCredentials, getIdToken } from '../../auth/credentials';
import { getMe } from '../../services/me';
import { printJson } from '../../lib/output';
import { promises as dns } from 'dns';

type Check = { name: string; status: 'ok' | 'warn' | 'fail'; message: string };
type Report = { ok: boolean; exitCode: number; checks: Check[] };

let fetchMock: ReturnType<typeof vi.fn>;

/** Run `numo doctor --json` and return the report, plus the exit code it asked for. */
async function doctor(): Promise<{ report: Report; exited: number | undefined }> {
  let exited: number | undefined;
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => { exited = code; return undefined as never; }) as never);

  const program = new Command();
  program.exitOverride().option('--json [fields]').option('-q, --quiet');
  registerDoctorCommand(program);
  await program.parseAsync(['doctor', '--json'], { from: 'user' });

  const [payload] = vi.mocked(printJson).mock.calls.at(-1) ?? [];
  return { report: payload as Report, exited };
}

const checkNamed = (report: Report, name: string) => report.checks.find((c) => c.name === name);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(classifyApiBase).mockReturnValue({ ok: true, insecure: false });
  vi.mocked(loadCredentials).mockReturnValue({ refreshToken: 'rt', uid: 'u1', email: 'a@b.com' } as never);
  vi.mocked(getIdToken).mockResolvedValue('id-token');
  vi.mocked(getMe).mockResolvedValue({ uid: 'u1', email: 'a@b.com', emailVerified: true, canCreateTasks: true });
  fetchMock = vi.fn(async () => ({ ok: true, status: 200 }) as unknown as Response);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('numo doctor', () => {
  // Contract: an untrusted host is reported, not probed. doctor is the one command a user
  // runs when things are broken, so it is the most likely place to be pointed at a host
  // the credential guard has already refused — and it must not be the way around it.
  it('sends nothing anywhere when the API base is untrusted', async () => {
    vi.mocked(classifyApiBase).mockReturnValue({ ok: false, message: 'Refusing to send credentials to untrusted host "evil.example"' });

    const { report, exited } = await doctor();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(dns.resolve).not.toHaveBeenCalled();
    expect(getIdToken).not.toHaveBeenCalled();
    expect(checkNamed(report, 'api_url')).toMatchObject({ status: 'fail' });
    expect(report.ok).toBe(false);
    expect(exited).toBe(1);
  });

  // Liveness for the check above: on a trusted host the probes do run, or "sends nothing"
  // would be satisfied by a doctor that never probes at all.
  it('probes the host when it is trusted', async () => {
    const { report, exited } = await doctor();

    expect(dns.resolve).toHaveBeenCalledWith('api.numo.ai');
    expect(fetchMock).toHaveBeenCalled();
    expect(report.ok).toBe(true);
    expect(exited).toBeUndefined();
  });

  // Contract: a warning is not a failure. The CLI ships independently of the server, so
  // talking to one that does not report a field yet is a normal state — failing the whole
  // health check for it reads as a broken install in CI.
  it('warns rather than fails when the server does not report verification', async () => {
    vi.mocked(getMe).mockResolvedValue({ uid: 'u1', email: 'a@b.com' });

    const { report, exited } = await doctor();

    expect(checkNamed(report, 'verification')).toMatchObject({ status: 'warn' });
    expect(report.ok).toBe(true);
    expect(exited).toBeUndefined();
  });

  it('fails when the server says task creation is blocked', async () => {
    vi.mocked(getMe).mockResolvedValue({ uid: 'u1', email: 'a@b.com', emailVerified: false, canCreateTasks: false });

    const { report } = await doctor();

    expect(checkNamed(report, 'verification')).toMatchObject({ status: 'fail' });
    expect(report.ok).toBe(false);
  });

  it('reports not being logged in as a failure, and skips the token check', async () => {
    vi.mocked(loadCredentials).mockReturnValue(null);

    const { report } = await doctor();

    expect(checkNamed(report, 'credentials')).toMatchObject({ status: 'fail' });
    expect(getIdToken).not.toHaveBeenCalled();
    expect(report.ok).toBe(false);
  });

  // Contract: nothing in this report can carry a credential. doctor output is what a user
  // pastes into an issue, and a refresh failure is exactly where a token turns up in an
  // error message.
  it('does not print a token that appeared in an error message', async () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJl';
    vi.mocked(getIdToken).mockRejectedValue(new Error(`refresh failed for ${jwt}`));

    const { report } = await doctor();

    const printed = JSON.stringify(report);
    expect(printed).not.toContain(jwt);
    expect(checkNamed(report, 'token')).toMatchObject({ status: 'fail' });
    // Liveness: the message is still there to read, just without the secret in it.
    expect(checkNamed(report, 'token')!.message).toContain('refresh failed');
  });

  it('reports the exit code it is about to use, so a JSON caller need not guess', async () => {
    vi.mocked(loadCredentials).mockReturnValue(null);
    const { report, exited } = await doctor();
    expect(report.exitCode).toBe(1);
    expect(exited).toBe(1);
  });
});
