import type { Command } from 'commander';
import pc from 'picocolors';
import { http } from '../lib/http';
import { login, postLogin, printSuccess } from './login';
import { saveCredentials } from './credentials';
import { promptText, promptPassword } from '../lib/prompts';
import { CliError, ErrorKind, ExitCode, Errors, classifyError } from '../lib/errors';
import { API_BASE } from '../lib/api-client';
import { assertSafeApiBase } from '../lib/api-base';
import { isQuietMode, makeClackSpinner } from '../lib/quiet';
import { decodeTokenClaims } from '../lib/token';
import { outputError, printJson } from '../lib/output';

export async function register(
  options: { phone?: boolean; json?: boolean | string; quiet?: boolean } = {},
  root?: Command,
) {
  // Phone signup is the login handshake with a different intent, and everything around
  // it — the credential save, quiet mode, the error contract — is already written there.
  if (options.phone) {
    return login({ phone: true, intent: 'signup', json: options.json, quiet: options.quiet }, root);
  }

  const envEmail = process.env.NUMO_LOGIN_EMAIL;
  const envPassword = process.env.NUMO_LOGIN_PASSWORD;
  const hasEnvCreds = !!(envEmail && envPassword);
  const quietMode = isQuietMode(options);

  if (quietMode && !hasEnvCreds) {
    outputError(Errors.configMissing('NUMO_LOGIN_EMAIL and NUMO_LOGIN_PASSWORD'), true);
  }

  const p = await import('@clack/prompts');
  if (!quietMode) p.intro(pc.bold('Numo — Create account'));

  const email = hasEnvCreds ? envEmail! : await promptText({ message: 'Email', required: true });
  const password = hasEnvCreds ? envPassword! : await promptPassword({ message: 'Password (at least 6 characters)' });

  const s = await makeClackSpinner(quietMode);

  // Whether the account exists by the time anything else can fail. Everything after
  // this point is about getting a session for an account that is already there, so a
  // failure past it must not be reported as a failure to create one.
  let accountCreated = false;

  try {
    assertSafeApiBase();
    s.start('Creating account...');
    await http.post(`${API_BASE}/api/auth/register`, { email, password });
    accountCreated = true;

    // The server answers the same way whether or not the address was free — it must,
    // or it becomes a way to test which addresses are registered. So the sign-in is
    // where we find out, and a *refused* sign-in means the address was already taken
    // by someone whose password this is not.
    //
    // Refused, not merely failed. A 429 (login is 10/min against register's 5), a 5xx,
    // or a connection dropped between the two calls says nothing about the address —
    // and the account was just created successfully. Reporting those as CONFLICT tells
    // someone who did sign up that they did not, exits 101, and discards the
    // credentials they now have. Anything that is not an auth refusal goes to
    // `classifyError` below and is reported as itself.
    //
    // 401 exactly. numo-api answers every credential refusal — INVALID_LOGIN_CREDENTIALS,
    // INVALID_PASSWORD, EMAIL_NOT_FOUND — with AUTH_REQUIRED (services/firebase-auth.ts).
    // Its only 400 from this route is INVALID_EMAIL, which says the address is malformed,
    // not that someone else holds it.
    const result = await postLogin(email, password).catch((err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status !== 401) throw err;
      throw new CliError(
        ErrorKind.CONFLICT,
        'That address is already registered, and the password does not match it.',
        ExitCode.CONFLICT,
        {
          suggestion: 'numo login',
          // Not "we sent you an email" — the CLI cannot see whether one went out,
          // and claiming it would be the same untruth this release is removing.
          hint: 'If the address is yours, a password-reset email may have been sent to it. Check your inbox and spam.',
          cause: err,
        },
      );
    });

    saveCredentials({
      refreshToken: result.refreshToken,
      uid: result.uid,
      email: result.displayName,
      idToken: result.idToken,
      idTokenExpiry: result.idTokenExpiry,
    });

    // Read the flag rather than assuming it: registering an address that already
    // exists, with its own password, signs into an account that may well be
    // verified already. The token was minted a moment ago, so its claim is current.
    const emailVerified = decodeTokenClaims(result.idToken)?.emailVerified ?? false;

    if (quietMode) {
      printJson({
        ok: true,
        uid: result.uid,
        email: result.displayName,
        emailVerified,
        idToken: result.idToken,
        idTokenExpiry: result.idTokenExpiry,
      });
      return;
    }

    s.stop(`Signed in as ${pc.green(result.displayName)}`);
    if (!emailVerified) {
      p.log.info(`Check ${pc.bold(result.displayName)} for a verification link.`);
      p.log.info(`No email? ${pc.cyan('$')} ${pc.bold('numo verify-email')} ${pc.dim('(or --code <oobCode> to finish from the link)')}`);
    }
    p.outro('You are ready to go!');
    printSuccess(root);
  } catch (err: unknown) {
    const classified = err instanceof CliError ? err : classifyError(err);

    // The register call can succeed and only the sign-in after it fail — a 429 from
    // the login limiter (10/min against register's 5), a 5xx, a dropped connection.
    // The account exists in every one of those; the only thing missing is a session.
    // Saying "could not create the account" there sends someone to sign up again for
    // an address that is now taken — by themselves.
    const sessionOnly = accountCreated && classified.kind !== ErrorKind.CONFLICT;
    const reported = sessionOnly
      ? new CliError(classified.kind, classified.message, classified.exitCode, {
          ...classified.options,
          suggestion: 'numo login',
          // Appended, not replaced: a 429's hint carries the Retry-After wait, which
          // is still the next thing to do — it is just no longer the whole story.
          hint: [classified.options.hint, 'The account was created; only the sign-in failed.']
            .filter(Boolean)
            .join(' '),
        })
      : classified;

    if (quietMode) outputError(reported, true);

    s.stop(pc.red(sessionOnly ? 'Account created, but signing in failed' : 'Could not create the account'));
    p.log.error(reported.message);
    if (reported.options.suggestion) p.log.info(`Try: ${reported.options.suggestion}`);
    if (reported.options.hint) p.log.warning(reported.options.hint);
    process.exit(reported.exitCode);
  }
}
