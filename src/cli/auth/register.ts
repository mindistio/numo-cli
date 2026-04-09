import { http } from '../lib/http';
import pc from 'picocolors';
import { saveCredentials } from './credentials';
import { promptText, promptPassword } from '../lib/prompts';
import { Errors, CliError, classifyError } from '../lib/errors';
import { isInteractive } from '../lib/tty';
import type { AuthResult } from './login';
import { printSuccess } from './login';

const API_BASE = process.env.NUMO_API_URL ?? 'http://localhost:3000';

// ── Pure helpers ────────────────────────────────────────────────────

export function validateEmail(email: string): string {
  const trimmed = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw Errors.invalidInput('Invalid email address');
  }
  return trimmed;
}

export function validatePassword(password: string): string {
  if (password.length < 6) {
    throw Errors.invalidInput('Password is too weak (min 6 characters)');
  }
  return password;
}

// ── API error classifier ───────────────────────────────────────────

export function classifySignUpError(err: unknown): CliError {
  if (err instanceof CliError) return err;

  const resp = (err as any)?.response?.data?.error;
  const kind: string = resp?.kind ?? '';
  const msg: string = resp?.message ?? '';

  if (kind === 'CONFLICT' || msg.includes('already in use')) {
    return Errors.invalidInput(
      'Email already in use',
      'Already have an account? Run: numo login',
    );
  }
  if (msg.includes('Invalid email')) {
    return Errors.invalidInput('Invalid email address');
  }
  if (msg.includes('Password too weak') || msg.includes('min 6')) {
    return Errors.invalidInput('Password is too weak (min 6 characters)');
  }
  return classifyError(err);
}

// ── I/O functions ───────────────────────────────────────────────────

async function signUp(email: string, password: string): Promise<AuthResult> {
  try {
    const resp = await http.post(`${API_BASE}/api/auth/register`, {
      email,
      password,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      tzOffset: new Date().getTimezoneOffset(),
    });

    return {
      refreshToken: resp.data.refreshToken,
      uid: resp.data.uid,
      displayName: resp.data.email ?? email,
      idToken: resp.data.idToken,
      idTokenExpiry: Date.now() + (resp.data.expiresIn || 3600) * 1000,
    };
  } catch (err) {
    throw classifySignUpError(err);
  }
}

// ── Main entry point ────────────────────────────────────────────────

export async function register(
  options: { email?: string; password?: string } = {},
) {
  const p = await import('@clack/prompts');
  p.intro(pc.bold('Numo — Register'));

  const s = p.spinner();
  let spinnerActive = false;
  try {
    // 1. Collect & validate email
    const email = validateEmail(
      options.email ?? (await promptText({ message: 'Email', required: true })),
    );

    // 2. Collect & validate password
    const rawPassword =
      options.password ?? (await promptPassword({ message: 'Password' }));

    // 3. Confirm password (TTY only, skip if provided via flag)
    if (!options.password && isInteractive()) {
      const confirm = await promptPassword({ message: 'Confirm password' });
      if (rawPassword !== confirm) {
        throw Errors.invalidInput('Passwords do not match');
      }
    }

    const password = validatePassword(rawPassword);

    // 4. Create account (API handles Firebase + profile setup)
    s.start('Creating account...');
    spinnerActive = true;
    const result = await signUp(email, password);

    // 5. Save credentials
    saveCredentials({
      refreshToken: result.refreshToken,
      uid: result.uid,
      email: result.displayName,
      idToken: result.idToken,
      idTokenExpiry: result.idTokenExpiry,
    });

    s.stop(`Registered as ${pc.green(result.displayName)}`);
    p.outro('Welcome to Numo!');
    printSuccess(result.displayName);
  } catch (err: unknown) {
    const classified =
      err instanceof CliError ? err : classifySignUpError(err);
    if (spinnerActive) s.stop(pc.red('Registration failed'));
    p.log.error(classified.message);
    if (classified.options.hint) p.log.warning(classified.options.hint);
    process.exit(classified.exitCode);
  }
}
