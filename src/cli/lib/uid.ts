import { loadCredentials } from '../auth/credentials';
import { Errors, CliError, ErrorKind, ExitCode } from './errors';

// Injected at build time by esbuild `define`. No runtime fallback — prevents users from granting themselves admin.
declare const __ADMIN_UIDS__: string[];
const ADMIN_UIDS: string[] = typeof __ADMIN_UIDS__ !== 'undefined' ? __ADMIN_UIDS__ : [];

export function requireUid(): string {
  const creds = loadCredentials();
  if (!creds) throw Errors.authRequired();
  return creds.uid;
}

export function isAdmin(): boolean {
  const creds = loadCredentials();
  return !!creds && ADMIN_UIDS.includes(creds.uid);
}

export function requireAdmin(): string {
  const creds = loadCredentials();
  if (!creds) throw Errors.authRequired();
  if (!ADMIN_UIDS.includes(creds.uid)) {
    throw new CliError(ErrorKind.AUTH_FORBIDDEN, 'Admin access required', ExitCode.NO_PERM, {
      hint: 'Your account does not have admin privileges.',
    });
  }
  return creds.uid;
}
