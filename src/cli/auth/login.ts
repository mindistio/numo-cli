import { http } from '../lib/http';
import pc from 'picocolors';
import { saveCredentials } from './credentials';
import { getFirebaseApiKey } from '../lib/config';
import { promptText, promptPassword, promptSelect } from '../lib/prompts';
import { Errors, CliError, classifyError } from '../lib/errors';
import { isAdmin } from '../lib/uid';

export interface AuthResult {
  refreshToken: string;
  uid: string;
  displayName: string;
  idToken?: string;
  idTokenExpiry?: number;
}

async function authenticateWithEmail(spinner: { start: (msg?: string) => void; stop: (msg?: string) => void }): Promise<AuthResult> {
  const fbApiKey = getFirebaseApiKey();
  if (!fbApiKey) {
    throw Errors.configMissing('NUMO_FIREBASE_API_KEY');
  }

  const email = await promptText({ message: 'Email', required: true });
  const password = await promptPassword({ message: 'Password' });

  spinner.start('Signing in...');

  const resp = await http.post(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${fbApiKey}`,
    { email, password, returnSecureToken: true },
    { headers: { 'Content-Type': 'application/json' } }
  );

  return {
    refreshToken: resp.data.refreshToken,
    uid: resp.data.localId,
    displayName: resp.data.email,
    idToken: resp.data.idToken,
    idTokenExpiry: Date.now() + (parseInt(resp.data.expiresIn) || 3600) * 1000,
  };
}

export function printSuccess(displayName: string) {
  const lines = [
    `  ${pc.dim('$')} numo tasks list --date YYYY-MM-DD   List tasks for a date`,
    `  ${pc.dim('$')} numo tasks create --text "..."       Create a task`,
  ];
  if (isAdmin()) {
    lines.push(`  ${pc.dim('$')} numo posts list                      Browse community posts`);
  }
  lines.push(`  ${pc.dim('$')} numo profile                         View your profile`);

  console.log(`\n  ${pc.bold('Available commands:')}\n${lines.join('\n')}\n`);
}

export async function login(options: { phone?: boolean } = {}) {
  const p = await import('@clack/prompts');
  p.intro(pc.bold('Numo — Login'));

  let method: 'email' | 'phone' = options.phone ? 'phone' : 'email';

  if (!options.phone) {
    method = await promptSelect({
      message: 'How would you like to sign in?',
      options: [
        { value: 'email' as const, label: 'Email & password' },
        { value: 'phone' as const, label: 'Phone number (SMS)' },
      ],
    });
  }

  const s = p.spinner();
  try {
    let result: AuthResult;

    if (method === 'phone') {
      const { authenticateWithPhone } = await import('./phone-login');
      result = await authenticateWithPhone(s);
    } else {
      result = await authenticateWithEmail(s);
    }

    saveCredentials({
      refreshToken: result.refreshToken,
      uid: result.uid,
      email: result.displayName,
      idToken: result.idToken,
      idTokenExpiry: result.idTokenExpiry,
    });

    s.stop(`Logged in as ${pc.green(result.displayName)}`);
    p.outro('You are ready to go!');
    printSuccess(result.displayName);
  } catch (err: unknown) {
    const classified = err instanceof CliError ? err : classifyError(err);
    s.stop(pc.red('Login failed'));
    p.log.error(classified.message);
    if (classified.options.hint) p.log.warning(classified.options.hint);
    process.exit(classified.exitCode);
  }
}
