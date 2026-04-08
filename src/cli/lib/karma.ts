import { IKarmaRecord } from '../../shared';
import { commit, CommitWrite, getDoc } from './firestore';

function karmaPath(uid: string, id: string): string {
  return `users/${uid}/karma/${id}`;
}

export async function giveKarma(uid: string, entity: string, entityId: string, karma: number, text: string): Promise<void> {
  const id = `${entity}_${entityId}`;
  const record: IKarmaRecord = { entity, entityId, karma, text, createdAt: Date.now(), userId: uid };
  await commit([
    { type: 'update', path: karmaPath(uid, id), data: record as unknown as Record<string, unknown> },
    { type: 'transform', path: `users/${uid}`, transforms: [{ field: 'karmaCount', increment: karma }] },
  ]);
}

export async function removeKarma(uid: string, entity: string, entityId: string): Promise<void> {
  const id = `${entity}_${entityId}`;
  try {
    const doc = await getDoc(karmaPath(uid, id));
    const karma = (doc.karma as number) ?? 0;
    const writes: CommitWrite[] = [
      { type: 'delete', path: karmaPath(uid, id) },
    ];
    if (karma > 0) {
      writes.push({
        type: 'transform',
        path: `users/${uid}`,
        transforms: [{ field: 'karmaCount', increment: -karma }],
      });
    }
    await commit(writes);
  } catch { /* not-found is expected */ }
}
