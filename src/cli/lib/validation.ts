import { CliError, ErrorKind, ExitCode } from './errors';
import { commit, CommitWrite } from './firestore';

/**
 * Validate a Firestore document ID.
 * Rejects path traversal attempts, empty IDs, and excessively long IDs.
 */
export function validateDocId(id: string, label = 'Document ID'): string {
  if (!id || typeof id !== 'string') {
    throw new Error(`${label} is required`);
  }

  const trimmed = id.trim();

  if (trimmed.length === 0) {
    throw new Error(`${label} cannot be empty`);
  }

  if (trimmed.length > 1500) {
    throw new Error(`${label} is too long (max 1500 characters)`);
  }

  if (trimmed.includes('/')) {
    throw new Error(`${label} cannot contain '/'`);
  }

  if (trimmed === '.' || trimmed === '..') {
    throw new Error(`${label} cannot be '.' or '..'`);
  }

  if (trimmed.startsWith('__') && trimmed.endsWith('__')) {
    throw new Error(`${label} cannot be a reserved Firestore ID (double underscore wrapped)`);
  }

  return trimmed;
}

/**
 * Check that a document belongs to the given user. Throws AUTH_FORBIDDEN if not.
 */
export function checkOwnership(doc: Record<string, unknown>, uid: string, action: string, userField = 'userId'): void {
  const docUid = doc[userField] ?? doc.authorId;
  if (docUid && docUid !== uid) {
    throw new CliError(ErrorKind.AUTH_FORBIDDEN, `You can only ${action} your own content`, ExitCode.NO_PERM);
  }
}

/**
 * Atomically increment a numeric field on a Firestore document.
 */
export async function incrementField(path: string, field: string, delta: number): Promise<void> {
  await commit([{
    type: 'transform',
    path,
    transforms: [{ field, increment: delta }],
  }]);
}
