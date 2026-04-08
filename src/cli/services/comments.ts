import { MAX_COMMENTS_PER_REQUEST, KARMA_POINTS } from '../../shared';
import { getDoc, createDoc, deleteDoc, runQuery } from '../lib/firestore';
import { validateDocId, checkOwnership, incrementField } from '../lib/validation';
import { giveKarma } from '../lib/karma';

export async function listComments(postId: string, opts: { cursor?: string; limit?: number }): Promise<{ comments: Record<string, unknown>[]; nextCursor?: string }> {
  validateDocId(postId, 'Post ID');
  const lim = Math.min(opts.limit ?? 20, MAX_COMMENTS_PER_REQUEST);

  const queryOpts: any = {
    orderBy: [{ field: 'createdAt', direction: 'ASCENDING' }],
    limit: lim + 1,
  };

  if (opts.cursor) {
    const cursorDoc = await getDoc(`posts/${postId}/comments/${opts.cursor}`);
    if (cursorDoc.createdAt != null) {
      queryOpts.startAfter = [cursorDoc.createdAt];
    }
  }

  const docs = await runQuery(`posts/${postId}`, 'comments', queryOpts);
  const hasMore = docs.length > lim;
  const comments = docs.slice(0, lim);

  // Resolve author usernames
  const uids = [...new Set(comments.map((c) => c.userId as string).filter(Boolean))];
  const userMap: Record<string, string> = {};
  await Promise.all(uids.map(async (uid) => {
    try {
      const user = await getDoc(`users/${uid}`);
      if (user.username) userMap[uid] = user.username as string;
    } catch {}
  }));
  for (const c of comments) {
    c.authorName = userMap[c.userId as string] ?? null;
  }

  return {
    comments,
    nextCursor: hasMore ? (comments[comments.length - 1].id as string) : undefined,
  };
}

export async function createComment(uid: string, postId: string, text: string): Promise<Record<string, unknown>> {
  validateDocId(postId, 'Post ID');
  const now = Date.now();
  const commentData: Record<string, unknown> = {
    postId,
    userId: uid,
    text,
    createdAt: now,
    updatedAt: now,
    textLength: text.length,
    likes: [],
    repliesCount: 0,
  };

  const doc = await createDoc(`posts/${postId}/comments`, commentData);
  const commentId = doc.id as string;

  await incrementField(`posts/${postId}`, 'commentsCount', 1);

  try {
    await giveKarma(uid, 'addComment', `${postId}_${commentId}`, KARMA_POINTS.addComment, text);
  } catch { /* non-critical */ }

  try {
    await incrementField(`users/${uid}/activity/totals`, 'comments.written', 1);
  } catch { /* non-critical */ }

  return { comment: doc, karma: KARMA_POINTS.addComment };
}

export async function deleteComment(uid: string, postId: string, commentId: string): Promise<void> {
  validateDocId(postId, 'Post ID');
  validateDocId(commentId, 'Comment ID');
  const comment = await getDoc(`posts/${postId}/comments/${commentId}`);
  checkOwnership(comment, uid, 'delete');
  await deleteDoc(`posts/${postId}/comments/${commentId}`);

  await incrementField(`posts/${postId}`, 'commentsCount', -1);
}
