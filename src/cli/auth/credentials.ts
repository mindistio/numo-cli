import * as fs from 'fs';
import * as crypto from 'crypto';
import { ensureConfigDir, getCredentialsPath } from '../lib/dirs';
import { assertSafeApiBase } from '../lib/api-base';
import { Errors } from '../lib/errors';

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

export function clearCredentials() {
  const credPath = getCredentialsPath();
  if (!fs.existsSync(credPath)) return;
  // Overwrite before unlinking so the refresh token is not left in freed blocks.
  fs.writeFileSync(credPath, crypto.randomBytes(fs.statSync(credPath).size));
  fs.unlinkSync(credPath);
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
