import { getDoc } from '../lib/firestore';
import { loadCredentials } from '../auth/credentials';

export async function getProfile(): Promise<Record<string, unknown>> {
  const creds = loadCredentials();
  if (!creds) throw new Error('Not logged in. Run: numo login');

  const doc = await getDoc(`users/${creds.uid}`);
  return {
    uid: creds.uid,
    email: creds.email ?? null,
    username: doc.username ?? null,
    photoURL: doc.photoURL ?? null,
  };
}
