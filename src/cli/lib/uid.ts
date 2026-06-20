import { loadCredentials } from '../auth/credentials';
import { Errors } from './errors';

/** Decode the `user_id`/`sub` claim from a JWT payload (no signature check). */
function uidFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64').toString('utf8'));
    if (typeof payload.user_id === 'string') return payload.user_id;
    if (typeof payload.sub === 'string') return payload.sub;
    return null;
  } catch {
    return null;
  }
}

export function requireUid(): string {
  // NUMO_TOKEN (agents/CI) authenticates via the token itself — a local credentials
  // file is not required. Identity comes from the token; the API validates it.
  if (process.env.NUMO_TOKEN) return uidFromToken(process.env.NUMO_TOKEN) ?? '';
  const creds = loadCredentials();
  if (!creds) throw Errors.authRequired();
  return creds.uid;
}
