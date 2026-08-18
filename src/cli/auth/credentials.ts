import * as fs from 'fs';
import * as crypto from 'crypto';
import { ensureConfigDir, getCredentialsPath } from '../lib/dirs';
import { assertSafeApiBase } from '../lib/api-base';
import { CliError, ErrorKind, Errors, ExitCode } from '../lib/errors';

interface Credentials {
  refreshToken: string;
  uid: string;
  email: string;
  idToken?: string;
  idTokenExpiry?: number;
}

export function loadCredentials(): Credentials | null {
  try {
    const path = getCredentialsPath();
    if (process.platform !== 'win32' && (fs.statSync(path).mode & 0o077)) {
      process.stderr.write(`[warn] credentials file is group/other-readable. Run: chmod 600 ${path}\n`);
    }
    const data = JSON.parse(fs.readFileSync(path, 'utf8'));
    if (
      typeof data?.refreshToken !== 'string' ||
      typeof data?.uid !== 'string' ||
      typeof data?.email !== 'string'
    ) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: Credentials) {
  ensureConfigDir();
  const path = getCredentialsPath();
  fs.writeFileSync(path, JSON.stringify(creds, null, 2), { mode: 0o600 });
  // writeFileSync's mode only applies on creation — force-tighten a pre-existing file.
  if (process.platform !== 'win32') fs.chmodSync(path, 0o600);
}

/**
 * Remove the stored credentials, overwriting them first so the refresh token is not
 * left behind in freed blocks.
 *
 * No `existsSync` guard: the file can go away between that check and the stat, and
 * "there is nothing to remove" is already the ENOENT case below. Asking the same
 * question twice is one of the two answers being wrong under a race.
 *
 * The two steps fail on DIFFERENT permissions, and the difference is the whole message.
 * Writing to an existing file needs write on the FILE (0600, ours); unlinking needs
 * write on the DIRECTORY. So under a read-only directory the shred lands and only the
 * unlink throws — the token is already destroyed, and telling the user it is "still
 * valid" sends them hunting for a live secret that no longer exists. Whether the caller
 * is still authenticated is exactly what logout is asked, so it is tracked, not guessed.
 */
export function clearCredentials() {
  const credPath = getCredentialsPath();
  let shredded = false;
  try {
    fs.writeFileSync(credPath, crypto.randomBytes(fs.statSync(credPath).size));
    shredded = true;
    fs.unlinkSync(credPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw new CliError(
      ErrorKind.CONFIG_ERROR,
      shredded
        ? `Signed out, but could not delete ${credPath}`
        : `Could not remove the stored credentials at ${credPath}`,
      ExitCode.CONFIG,
      {
        hint: shredded
          ? 'The stored token has been destroyed and is no longer usable. Only the empty file is left — delete it yourself, or fix the permissions on its directory.'
          : 'They are still there and still usable. Fix the permissions on the file, or delete it yourself.',
      },
    );
  }
}

// Promise lock to prevent concurrent token refreshes
let refreshInFlight: Promise<string> | null = null;

export async function getIdToken(): Promise<string> {
  // Environment variable takes priority (for CI/CD and AI agents)
  const envToken = process.env.NUMO_TOKEN;
  if (envToken) return envToken;

  const creds = loadCredentials();
  if (!creds) throw Errors.authRequired();

  // Return cached token if still valid
  if (creds.idToken && creds.idTokenExpiry && Date.now() < creds.idTokenExpiry - 60000) {
    return creds.idToken;
  }

  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = performRefresh(creds).finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

async function performRefresh(creds: Credentials): Promise<string> {
  assertSafeApiBase();
  const { API_BASE: apiBase } = await import('../lib/api-client');

  const { http } = await import('../lib/http');
  const resp = await http.post(
    `${apiBase}/api/auth/refresh`,
    { refreshToken: creds.refreshToken },
  );
  creds.idToken = resp.data.idToken;
  creds.refreshToken = resp.data.refreshToken ?? creds.refreshToken;
  creds.idTokenExpiry = Date.now() + (resp.data.expiresIn || 3600) * 1000;
  saveCredentials(creds);

  return creds.idToken!;
}
