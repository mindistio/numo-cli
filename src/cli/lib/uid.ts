import { loadCredentials } from '../auth/credentials';
import { Errors } from './errors';

/**
 * Presence gate: throws if the caller has no way to authenticate. Identity comes from the
 * Bearer token (NUMO_TOKEN or stored credentials) and is validated by the API — this gate
 * never decodes it. (`whoami` in cli.ts is the one deliberate exception: it decodes the JWT
 * locally to display uid/email/expiry, which a presence check can't provide.)
 */
export function requireAuth(): void {
  if (process.env.NUMO_TOKEN) return;
  if (!loadCredentials()) throw Errors.authRequired();
}
