import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

vi.mock('../../services/me', () => ({
  getMe: vi.fn(),
  resendVerificationEmail: vi.fn(),
  confirmVerificationCode: vi.fn(),
}));
vi.mock('../../lib/uid', () => ({ requireAuth: vi.fn() }));

import { registerVerifyEmailCommand } from '../verify-email';
import { getMe, resendVerificationEmail, confirmVerificationCode } from '../../services/me';
import { requireAuth } from '../../lib/uid';

const mocked = {
  getMe: vi.mocked(getMe),
  resend: vi.mocked(resendVerificationEmail),
  confirm: vi.mocked(confirmVerificationCode),
  requireAuth: vi.mocked(requireAuth),
};

function run(args: string[]) {
  const program = new Command();
  program.exitOverride().option('--json [fields]').option('-q, --quiet');
  registerVerifyEmailCommand(program);
  return program.parseAsync(['verify-email', ...args, '--json'], { from: 'user' });
}

describe('numo verify-email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getMe.mockResolvedValue({ uid: 'u1', email: 'a@b.com', emailVerified: false, canCreateTasks: false });
    mocked.confirm.mockResolvedValue({ status: 'ok', emailVerified: true });
  });

  // Contract: refuse before the network, so an unauthenticated caller gets
  // AUTH_REQUIRED and not whatever the API says about a missing bearer token.
  it('requires credentials before making any request', async () => {
    mocked.requireAuth.mockImplementationOnce(() => { throw new Error('not logged in'); });
    await expect(run([])).rejects.toThrow('not logged in');
    expect(mocked.getMe).not.toHaveBeenCalled();
    expect(mocked.resend).not.toHaveBeenCalled();
  });

  it('resends the email when no code is given', async () => {
    await run([]);
    expect(mocked.resend).toHaveBeenCalledOnce();
    expect(mocked.confirm).not.toHaveBeenCalled();
  });

  // Contract: an already-verified caller is told so, not sent mail they have no
  // reason to open — and this is why the status is read before sending.
  it('does not send anything to an already-verified account', async () => {
    mocked.getMe.mockResolvedValue({ uid: 'u1', email: 'a@b.com', emailVerified: true, canCreateTasks: true });
    await run([]);
    expect(mocked.resend).not.toHaveBeenCalled();
  });

  // The CLI ships independently of the API, so it routinely talks to a server
  // older than itself. A field the server never sent is unknown, not false — and
  // the resend still happens, because that is what was asked for.
  it('still resends when the server does not report verification state', async () => {
    mocked.getMe.mockResolvedValue({ uid: 'u1', email: 'a@b.com' });
    await run([]);
    expect(mocked.resend).toHaveBeenCalledOnce();
  });

  it('redeems the code when one is given', async () => {
    await run(['--code', 'oob-123']);
    expect(mocked.confirm).toHaveBeenCalledWith('oob-123');
  });

  // Redeeming is the whole point of --code: it must not first ask the server for a
  // status that the redemption is about to change.
  it('does not resend, or read status, when redeeming a code', async () => {
    await run(['--code', 'oob-123']);
    expect(mocked.resend).not.toHaveBeenCalled();
    expect(mocked.getMe).not.toHaveBeenCalled();
  });

  it('surfaces a rejected code instead of reporting success', async () => {
    mocked.confirm.mockRejectedValueOnce(new Error('Verification code is invalid or has expired.'));
    await expect(run(['--code', 'stale'])).rejects.toThrow(/invalid or has expired/);
  });

  // Contract: the reported flag is the server's answer, carried through. It used to be
  // the literal `true`, printed on any 2xx — the CLI's own copy of the claim the server
  // had also stopped checking. A 200 says the code was accepted, which is not the same
  // sentence as "this account is now verified".
  //
  // Both rows matter together. Only-true would pass on the old literal; only-false
  // would pass on a rule that never reports verified at all.
  it.each([
    [{ status: 'ok', emailVerified: true }, { emailVerified: true }],
    [{ status: 'ok', emailVerified: false }, { emailVerified: false }],
    // An older server omits the field. JSON.stringify drops an undefined value, so the
    // key is absent from the output too — which is the honest shape: not false, unknown.
    [{ status: 'ok' }, {}],
  ])('reports %j as %j', async (serverSaid, expected) => {
    const logged: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a) => { logged.push(a.map(String).join(' ')); });
    mocked.confirm.mockResolvedValueOnce(serverSaid);

    await run(['--code', 'oob-123']);
    spy.mockRestore();

    expect(JSON.parse(logged.join('\n'))).toStrictEqual(expected);
  });
});
