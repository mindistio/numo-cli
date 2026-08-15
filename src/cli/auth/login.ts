import type { Command } from 'commander';
import { http } from '../lib/http';
import pc from 'picocolors';
import { saveCredentials } from './credentials';
import { collectCommands, focusCommands, formatCommandMap } from '../lib/command-map';
import { promptText, promptPassword, promptSelect } from '../lib/prompts';
import { CliError, classifyError, Errors } from '../lib/errors';
import { API_BASE } from '../lib/api-client';
import { assertSafeApiBase } from '../lib/api-base';
import { isQuietMode, makeClackSpinner, type ClackSpinner } from '../lib/quiet';
import { outputError, printJson } from '../lib/output';

export interface AuthResult {
  refreshToken: string;
  uid: string;
  displayName: string;
  idToken?: string;
  idTokenExpiry?: number;
}

export async function postLogin(email: string, password: string): Promise<AuthResult> {
  assertSafeApiBase();
  const resp = await http.post(`${API_BASE}/api/auth/login`, { email, password });
  return {
    refreshToken: resp.data.refreshToken,
    uid: resp.data.uid,
    displayName: resp.data.email ?? email,
    idToken: resp.data.idToken,
    idTokenExpiry: Date.now() + (resp.data.expiresIn || 3600) * 1000,
  };
}

/**
 * The non-interactive credential pair, or null when it is not fully set.
 *
 * Both halves or neither: one alone is a half-configured CI job, and treating it as
 * "no env creds" is what makes that fail with the config error rather than by
 * prompting into a pipe that will never answer.
 */
export function readEnvCredentials(): { email: string; password: string } | null {
  const email = process.env.NUMO_LOGIN_EMAIL;
  const password = process.env.NUMO_LOGIN_PASSWORD;
  return email && password ? { email, password } : null;
}

/** Persist a completed handshake. The field rename (displayName → email) is the whole
 *  reason this is worth a name: both flows did it by hand, and a third would too. */
export function saveAuthResult(result: AuthResult): void {
  saveCredentials({
    refreshToken: result.refreshToken,
    uid: result.uid,
    email: result.displayName,
    idToken: result.idToken,
    idTokenExpiry: result.idTokenExpiry,
  });
}

/**
 * The end of every failed auth flow: the machine-readable envelope when one was asked
 * for, then the human one, then the exit code that belongs to the kind.
 *
 * Takes the error already reframed. Deciding WHAT to report is each flow's own
 * business — register turns a post-creation failure into "the account exists, only
 * the sign-in failed", which would be a lie on the login path — but saying it is the
 * same five steps in the same order, and they were written twice.
 */
export async function reportAuthFailure(
  reported: CliError,
  opts: { spinner: ClackSpinner; quietMode: boolean; stopMessage: string },
): Promise<never> {
  const p = await import('@clack/prompts');
  //  — returned, not just called, so the control flow is on the page instead of
  // five unreachable lines below it.
  if (opts.quietMode) return outputError(reported, true);
  opts.spinner.stop(pc.red(opts.stopMessage));
  p.log.error(reported.message);
  if (reported.options.suggestion) p.log.info(`Try: ${reported.options.suggestion}`);
  if (reported.options.hint) p.log.warning(reported.options.hint);
  return process.exit(reported.exitCode);
}

async function authenticateInteractive(spinner: ClackSpinner): Promise<AuthResult> {
  const email = await promptText({ message: 'Email', required: true });
  const password = await promptPassword({ message: 'Password' });
  spinner.start('Signing in...');
  return postLogin(email, password);
}

export function printSuccess(root?: Command) {
  // Render the live command tree so this greeting never drifts from the actual
  // commands (it shares its source with `numo commands`).
  const body = root
    ? formatCommandMap(focusCommands(collectCommands(root)))
    : `    ${pc.dim('Run')} numo commands ${pc.dim('to list every command.')}`;
  console.log(`\n  ${pc.bold('Available commands:')}\n${body}`);
  console.log(`  ${pc.dim('Run')} numo commands ${pc.dim('to see all commands.')}\n`);
}

/**
 * Sign in, or — with `intent: 'signup'` — create an account by phone.
 *
 * `numo register --phone` routes here rather than into register.ts: past the intent,
 * phone signup and phone login are the same handshake, and the credential save, quiet
 * mode and error contract around it are already written once here.
 */
export async function login(
  options: { phone?: boolean; intent?: 'login' | 'signup'; json?: boolean | string; quiet?: boolean } = {},
  root?: Command,
) {
  const intent = options.intent ?? 'login';
  const signingUp = intent === 'signup';
  const envCreds = readEnvCredentials();
  const quietMode = isQuietMode(options);

  // Non-interactive mode without env-creds and without --phone has no way to collect input
  if (quietMode && options.phone) {
    outputError(
      Errors.invalidInput(
        '--phone requires an interactive terminal for SMS OTP entry',
        'Use NUMO_LOGIN_EMAIL + NUMO_LOGIN_PASSWORD env vars for non-interactive login.',
      ),
      true,
    );
  }
  if (quietMode && !envCreds && !options.phone) {
    outputError(
      Errors.configMissing('NUMO_LOGIN_EMAIL and NUMO_LOGIN_PASSWORD'),
      true,
    );
  }

  const p = await import('@clack/prompts');
  if (!quietMode) p.intro(pc.bold(signingUp ? 'Numo — Create account' : 'Numo — Login'));

  let method: 'email' | 'phone' = options.phone ? 'phone' : 'email';

  if (!options.phone && !envCreds && !quietMode) {
    method = await promptSelect({
      message: 'How would you like to sign in?',
      options: [
        { value: 'email' as const, label: 'Email & password' },
        { value: 'phone' as const, label: 'Phone number (SMS)' },
      ],
    });
  }

  const s = await makeClackSpinner(quietMode);

  try {
    let result: AuthResult;

    if (method === 'phone') {
      const { authenticateWithPhone } = await import('./phone-login');
      result = await authenticateWithPhone(s, intent);
    } else if (envCreds) {
      s.start('Signing in...');
      result = await postLogin(envCreds.email, envCreds.password);
    } else {
      result = await authenticateInteractive(s);
    }

    saveAuthResult(result);

    if (quietMode) {
      printJson({
        ok: true,
        uid: result.uid,
        email: result.displayName,
        idToken: result.idToken,
        idTokenExpiry: result.idTokenExpiry,
      });
      return;
    }

    s.stop(`${signingUp ? 'Account created for' : 'Logged in as'} ${pc.green(result.displayName)}`);
    p.outro('You are ready to go!');
    printSuccess(root);
  } catch (err: unknown) {
    const classified = err instanceof CliError ? err : classifyError(err);
    await reportAuthFailure(classified, {
      spinner: s,
      quietMode,
      stopMessage: signingUp ? 'Could not create the account' : 'Login failed',
    });
  }
}
