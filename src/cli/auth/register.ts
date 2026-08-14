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

  try {
    assertSafeApiBase();
    s.start('Creating account...');
    await http.post(`${API_BASE}/api/auth/register`, { email, password });

    // The server answers the same way whether or not the address was free — it must,
    // or it becomes a way to test which addresses are registered. So the sign-in is
    // where we find out, and a failure here means the address was already taken by
    // someone whose password this is not.
    const result = await postLogin(email, password).catch((err) => {
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
    if (quietMode) outputError(classified, true);

    s.stop(pc.red('Could not create the account'));
    p.log.error(classified.message);
    if (classified.options.suggestion) p.log.info(`Try: ${classified.options.suggestion}`);
    if (classified.options.hint) p.log.warning(classified.options.hint);
    process.exit(classified.exitCode);
  }
}
