import { http } from '../lib/http';
import pc from 'picocolors';
import { Errors, CliError, ErrorKind, ExitCode, classifyError } from '../lib/errors';
import { promptText } from '../lib/prompts';
import { API_BASE } from '../lib/api-client';
import { assertSafeApiBase } from '../lib/api-base';
import type { AuthResult } from './login';
const POLL_INTERVAL = 2000;
const POLL_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/**
 * Run the phone device-flow handshake.
 *
 * `intent` tells the server whether this number is supposed to exist yet. Omitting it
 * takes numo-api's legacy no-gate path, where a login with a number that has no
 * account silently CREATES one — so `numo login --phone` on a mistyped number signed
 * the user into a brand-new empty account with no error to read, and `numo register`
 * had no phone route at all. The web modal has always sent it; this brings the CLI in
 * line with it and with the API's own signup/login distinction.
 */
export async function authenticateWithPhone(
  spinner: { start: (msg?: string) => void; stop: (msg?: string) => void },
  intent: 'login' | 'signup' = 'login',
): Promise<AuthResult> {
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

  // The gate's two refusals are the whole point of sending an intent, so they are
  // reported as themselves — each naming the command that WOULD have worked. Falling
  // through to the generic classifier would render both as a bare "Access denied" /
  // "Resource not found", which is the state this replaces.
  //
  // Matched against the intent that was sent, because the server only produces them
  // that way round: routes/auth.ts throws 409 solely for `intent: 'signup'` and 404
  // solely for `intent: 'login'`. A 409 arriving under `login` is therefore not the
  // gate at all — a proxy or a path typo can produce one — and answering it with
  // "already exists, try `numo login --phone`" named the command the user had just
  // run. A wrong NUMO_API_URL made that a loop with no way out of it.
  const startResp = await http
    .post(`${API_BASE}/api/auth/phone/start`, { phoneNumber: phone, intent })
    .catch((err: any) => {
      const status = err?.response?.status;
      if (status === 409 && intent === 'signup') {
        throw new CliError(ErrorKind.CONFLICT, 'An account already exists for that number.', ExitCode.CONFLICT, {
          suggestion: 'numo login --phone',
        });
      }
      if (status === 404 && intent === 'login') {
        throw new CliError(ErrorKind.NOT_FOUND, 'No account exists for that number yet.', ExitCode.NOT_FOUND, {
          suggestion: 'numo register --phone',
        });
      }
      throw err;
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
      const status = err.response?.status;
      if (status === 404) {
        throw new CliError(ErrorKind.NOT_FOUND, 'Verification session expired. Start again.', ExitCode.NOT_FOUND, {
          // Start again with the command they were running. Hardcoding login sent a
          // first-time `numo register --phone` user whose session had simply timed out
          // to `numo login --phone`, which the gate then refuses because verification
          // never completed and no account exists — back to register, and round again.
          suggestion: intent === 'signup' ? 'numo register --phone' : 'numo login --phone',
        });
      }
      // Any other 4xx is the server's settled answer — a rejected poll secret, a
      // malformed request, a session it will not serve. Waiting it out cannot change
      // it, and the timeout below reports the five minutes as a network problem the
      // caller should retry, which points at the wrong thing entirely. 408 and 429
      // are the exceptions: both mean "later", and later is what this loop is for.
      if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
        throw classifyError(err);
      }
      // Network blips and 5xx — keep polling.
    }
  }

  // Not `Errors.networkError`: it takes its argument as a HINT and hardcodes the
  // message "Can't reach Numo servers", so the sentence below never reached anyone and
  // a five-minute wait for a human to finish was reported as an unreachable server.
  // Exactly the defect the 404 branch above already names — it was left standing here.
  throw new CliError(
    ErrorKind.TIMEOUT,
    'Phone verification timed out.',
    ExitCode.TEMP_FAIL,
    {
      suggestion: intent === 'signup' ? 'numo register --phone' : 'numo login --phone',
      hint: 'Nobody finished the verification in the browser within five minutes.',
      retryable: true,
    },
  );
}
