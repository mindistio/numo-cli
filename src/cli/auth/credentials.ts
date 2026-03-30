import * as fs from 'fs';
import * as crypto from 'crypto';
import { ensureConfigDir, getCredentialsPath } from '../lib/dirs';

interface Credentials {
  refreshToken: string;
  uid: string;
  email: string;
  idToken?: string;
  idTokenExpiry?: number;
}

export function loadCredentials(): Credentials | null {
  try {
    const data = JSON.parse(fs.readFileSync(getCredentialsPath(), 'utf8'));
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
  fs.writeFileSync(getCredentialsPath(), JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function clearCredentials() {
  try {
    const credPath = getCredentialsPath();
    const stat = fs.statSync(credPath);
    // Overwrite with random data before deleting
    fs.writeFileSync(credPath, crypto.randomBytes(stat.size));
    fs.unlinkSync(credPath);
  } catch {}
}

// Promise lock to prevent concurrent token refreshes
let refreshInFlight: Promise<string> | null = null;

export async function getIdToken(): Promise<string> {
  // Environment variable takes priority (for CI/CD and AI agents)
  const envToken = process.env.NUMO_TOKEN;
  if (envToken) return envToken;

  const creds = loadCredentials();
  if (!creds) throw new Error('Not logged in. Run: numo login');

  // Return cached token if still valid
  if (creds.idToken && creds.idTokenExpiry && Date.now() < creds.idTokenExpiry - 60000) {
    return creds.idToken;
  }

  // If a refresh is already in flight, wait for it
  if (refreshInFlight) return refreshInFlight;

  // Start refresh and store the promise
  refreshInFlight = performRefresh(creds).finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

async function performRefresh(creds: Credentials): Promise<string> {
  const { getFirebaseApiKey } = await import('../lib/config');
  const fbApiKey = getFirebaseApiKey();
  if (!fbApiKey) throw new Error('NUMO_FIREBASE_API_KEY not set');

  const { http } = await import('../lib/http');
  const resp = await http.post(
    `https://securetoken.googleapis.com/v1/token?key=${fbApiKey}`,
    { grant_type: 'refresh_token', refresh_token: creds.refreshToken },
    { headers: { 'Content-Type': 'application/json' } }
  );
  creds.idToken = resp.data.id_token;
  creds.idTokenExpiry = Date.now() + (parseInt(resp.data.expires_in) || 3600) * 1000;
  saveCredentials(creds);

  return creds.idToken!;
}
