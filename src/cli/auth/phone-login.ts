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
 * `intent` is still sent and still validated by the server, but it is now **recorded
 * rather than acted on**. The pre-OTP gate that used to refuse a mismatched intent is
 * gone: it predicted whether an account existed by asking a Cloud Function about user
 * documents, and that proxy answer disagreed with the authority often enough to refuse
 * real people their own logins. numo-api's `routes/auth.ts` carries the full reasoning
 * and the accepted cost.
 *
 * The consequence that lands here: `numo login --phone` on a number with no account no
 * longer fails fast — it sends an SMS and creates the account. The server now tells us
 * which happened, via `created` on the poll response, and reporting that honestly is
 * this file's job (see the copy below). On a mistyped number the flow simply times out,
 * because the code went to a stranger who will never complete it.
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

  // No retries: this call is not idempotent. Receiving it mints a session, an SMS
  // allowance and — in the same breath — a per-number cooldown. So when the response
  // was lost rather than never sent (an edge 502, a dropped connection), the retry
  // reached a server that had already armed its own guard and answered 429 with a
  // Retry-After covering what was left of it. 429 is retryable too, so http slept that
  // out and tried twice more, ending in "Too many requests — wait N seconds" on the
  // user's FIRST login attempt, with a live unused session sitting on the server.
  const startResp = await http.post(
    `${API_BASE}/api/auth/phone/start`,
    { phoneNumber: phone, intent },
    { retries: 0 },
  );

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
        spinner.stop('');
        reportOutcome(p, phone, intent, pollResp.data.created);
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
          // Suggest the command they actually ran. Hardcoding one of the two sent a
          // `numo register --phone` user whose session had simply timed out off to the
          // other command instead, for no reason they could see.
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
      // Names the mistyped number, because this message now carries that whole case. The
      // server used to refuse an unregistered number in one round trip; it no longer does,
      // so a digit typed wrong sends the code to a stranger and ends here — where the old
      // wording ("nobody finished it") was simply untrue, since nobody could have. The
      // retry suggestion above is only honest if the user is told what to re-check first.
      hint: 'Nobody completed the verification within five minutes. If the number was mistyped, the code went to someone else — check it before trying again.',
      retryable: true,
    },
  );
}

/**
 * Say which of the two things just happened, in the one moment the user can act on it.
 *
 * `created` comes from the server's own observation after the OTP — see numo-api's
 * `routes/phone-verify.ts`. It is absent when the account carried no usable creation time,
 * which is an ordinary runtime condition rather than a version-skew artefact, so that row
 * has to read as a normal successful login and claim nothing either way.
 *
 * The `login` + `created` case is the only warning here, and it earns it: the server used to
 * refuse exactly this with a 404, so this line is now the sole moment a user learns an
 * account was made on a number that might not be theirs. Naming the number back is what
 * makes a typo visible; naming the fix is what makes it recoverable.
 *
 * Accepted hole, recorded rather than solved: when `created` is absent that warning cannot
 * fire, so a mistyped login goes unwarned precisely when we could not observe it. Warning on
 * "unknown" would cry wolf on every skew, which is how warnings stop being read. numo-api's
 * throttled log is the only thing that reveals this is happening.
 */
function reportOutcome(
  p: { log: { info: (msg: string) => void; warn: (msg: string) => void } },
  phone: string,
  intent: 'login' | 'signup',
  created: boolean | undefined,
): void {
  if (created === undefined) {
    p.log.info(`Signed in as ${pc.bold(phone)}.`);
    return;
  }
  if (intent === 'login' && created) {
    p.log.warn(
      `You asked to log in, but no account existed for ${pc.bold(phone)} — a new one was created.`,
    );
    p.log.info(`If you mistyped the number, run ${pc.bold('numo logout')} and try again with the correct one.`);
    return;
  }
  if (intent === 'signup' && !created) {
    p.log.info(`An account already existed for ${pc.bold(phone)} — you are signed in to it.`);
    return;
  }
  p.log.info(created ? `Account created for ${pc.bold(phone)}.` : `Signed in as ${pc.bold(phone)}.`);
}
