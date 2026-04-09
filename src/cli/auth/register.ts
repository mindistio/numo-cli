import { http } from '../lib/http';
import pc from 'picocolors';
import { saveCredentials } from './credentials';
import { getFirebaseApiKey } from '../lib/config';
import { promptText, promptPassword } from '../lib/prompts';
import { Errors, CliError, classifyError, ErrorKind, ExitCode } from '../lib/errors';
import { api } from '../lib/api-client';
import { isInteractive } from '../lib/tty';
import type { AuthResult } from './login';
import { printSuccess } from './login';

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

// ── Firebase error classifier ───────────────────────────────────────

export function classifySignUpError(err: unknown): CliError {
  if (err instanceof CliError) return err;

  const resp = (err as any)?.response?.data?.error;
  const msg: string = resp?.message ?? '';

  if (msg.includes('EMAIL_EXISTS')) {
    return Errors.invalidInput(
      'Email already in use',
      'Already have an account? Run: numo login',
    );
  }
  if (msg.includes('INVALID_EMAIL')) {
    return Errors.invalidInput('Invalid email address');
  }
  if (msg.includes('WEAK_PASSWORD')) {
    return Errors.invalidInput('Password is too weak (min 6 characters)');
  }
  if (msg.includes('OPERATION_NOT_ALLOWED')) {
    return new CliError(
      ErrorKind.AUTH_FORBIDDEN,
      'Email registration is disabled',
      ExitCode.NO_PERM,
    );
  }
  return classifyError(err);
}

// ── I/O functions ───────────────────────────────────────────────────

async function signUp(email: string, password: string): Promise<AuthResult> {
  const fbApiKey = getFirebaseApiKey();
  if (!fbApiKey) throw Errors.configMissing('NUMO_FIREBASE_API_KEY');

  try {
    const resp = await http.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${fbApiKey}`,
      { email, password, returnSecureToken: true },
      { headers: { 'Content-Type': 'application/json' } },
    );

    return {
      refreshToken: resp.data.refreshToken,
      uid: resp.data.localId,
      displayName: resp.data.email,
      idToken: resp.data.idToken,
      idTokenExpiry:
        Date.now() + (parseInt(resp.data.expiresIn) || 3600) * 1000,
    };
  } catch (err) {
    throw classifySignUpError(err);
  }
}

async function setupUserProfile(): Promise<void> {
  const body = {
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    tzOffset: new Date().getTimezoneOffset(),
  };

  // Retry up to 3 times with backoff — profile must exist for CLI to work
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await api.post('/api/profile/setup', body);
      return;
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
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

    // 4. Firebase Auth: create account
    s.start('Creating account...');
    spinnerActive = true;
    const result = await signUp(email, password);

    // 5. Save credentials (BEFORE Firestore writes — getIdToken reads from file)
    saveCredentials({
      refreshToken: result.refreshToken,
      uid: result.uid,
      email: result.displayName,
      idToken: result.idToken,
      idTokenExpiry: result.idTokenExpiry,
    });

    // 6. API: user document + counters
    s.message('Setting up profile...');
    await setupUserProfile();

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
