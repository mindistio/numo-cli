import { http } from '../lib/http';
import pc from 'picocolors';
import { Errors, CliError, ErrorKind, ExitCode } from '../lib/errors';
import { promptText } from '../lib/prompts';
import { API_BASE } from '../lib/api-client';
import { assertSafeApiBase } from '../lib/api-base';
import type { AuthResult } from './login';
const POLL_INTERVAL = 2000;
const POLL_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export async function authenticateWithPhone(spinner: { start: (msg?: string) => void; stop: (msg?: string) => void }): Promise<AuthResult> {
  assertSafeApiBase();
  const p = await import('@clack/prompts');

  const phone = await promptText({
    message: 'Phone number (with country code)',
    placeholder: '+380501234567',
    required: true,
  });

  if (!/^\+[0-9]{7,15}$/.test(phone)) {
    throw Errors.invalidInput('Invalid phone number. Use E.164 format: +<country code><number>', 'Example: +380501234567');
  }

  spinner.start('Starting phone verification...');

  const startResp = await http.post(`${API_BASE}/api/auth/phone/start`, {
    phoneNumber: phone,
  });

  const { sessionId, pollSecret, userCode, verifyUrl } = startResp.data;
  spinner.stop('');

  p.log.info('Opening browser for phone verification...');
  p.log.info(pc.dim(`If the browser does not open, visit: ${verifyUrl}`));
  p.log.info(`Enter this confirmation code on the page: ${pc.bold(pc.cyan(userCode))}`);

  const { default: open } = await import('open');
  const cp = await open(verifyUrl);
  cp.unref();

  spinner.start('Waiting for verification in browser...');

  const deadline = Date.now() + POLL_TIMEOUT;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));

    try {
      // pollSecret grants the session's tokens — it stays out of the URL, which
      // proxies and access logs retain.
      const pollResp = await http.get(
        `${API_BASE}/api/auth/phone/poll?session=${encodeURIComponent(sessionId)}`,
        { headers: { 'x-poll-secret': pollSecret } },
      );

      if (pollResp.status === 200 && pollResp.data.idToken) {
        return {
          refreshToken: pollResp.data.refreshToken,
          uid: pollResp.data.uid,
          displayName: phone,
          idToken: pollResp.data.idToken,
          idTokenExpiry: Date.now() + (pollResp.data.expiresIn || 3600) * 1000,
        };
      }
      // 202 = still pending, continue polling
    } catch (err: any) {
      // A session the server no longer has cannot be waited out. Reported as what it is:
      // Errors.networkError takes its argument as a hint, so this used to surface as
      // "Can't reach Numo servers" — retryable, and pointing at the wrong thing entirely.
      if (err.response?.status === 404) {
        throw new CliError(ErrorKind.NOT_FOUND, 'Verification session expired. Start again.', ExitCode.NOT_FOUND, {
          suggestion: 'numo login --phone',
        });
      }
      // Other errors — continue polling
    }
  }

  throw Errors.networkError('Phone verification timed out. Try again.');
}
