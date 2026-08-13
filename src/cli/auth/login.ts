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

export async function login(options: { phone?: boolean; json?: boolean | string; quiet?: boolean } = {}, root?: Command) {
  const envEmail = process.env.NUMO_LOGIN_EMAIL;
  const envPassword = process.env.NUMO_LOGIN_PASSWORD;
  const hasEnvCreds = !!(envEmail && envPassword);
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
  if (quietMode && !hasEnvCreds && !options.phone) {
    outputError(
      Errors.configMissing('NUMO_LOGIN_EMAIL and NUMO_LOGIN_PASSWORD'),
      true,
    );
  }

  const p = await import('@clack/prompts');
  if (!quietMode) p.intro(pc.bold('Numo — Login'));

  let method: 'email' | 'phone' = options.phone ? 'phone' : 'email';

  if (!options.phone && !hasEnvCreds && !quietMode) {
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
      result = await authenticateWithPhone(s);
    } else if (hasEnvCreds) {
      s.start('Signing in...');
      result = await postLogin(envEmail!, envPassword!);
    } else {
      result = await authenticateInteractive(s);
    }

    saveCredentials({
      refreshToken: result.refreshToken,
      uid: result.uid,
      email: result.displayName,
      idToken: result.idToken,
      idTokenExpiry: result.idTokenExpiry,
    });

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

    s.stop(`Logged in as ${pc.green(result.displayName)}`);
    p.outro('You are ready to go!');
    printSuccess(root);
  } catch (err: unknown) {
    const classified = err instanceof CliError ? err : classifyError(err);
    if (quietMode) {
      outputError(classified, true);
    }
    s.stop(pc.red('Login failed'));
    p.log.error(classified.message);
    if (classified.options.hint) p.log.warning(classified.options.hint);
    process.exit(classified.exitCode);
  }
}
