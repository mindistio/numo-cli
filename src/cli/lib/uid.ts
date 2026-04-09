import { loadCredentials } from '../auth/credentials';
import { Errors } from './errors';

export function requireUid(): string {
  const creds = loadCredentials();
  if (!creds) throw Errors.authRequired();
  return creds.uid;
}
