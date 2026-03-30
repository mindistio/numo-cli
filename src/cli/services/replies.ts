import { MAX_REPLIES_PER_REQUEST } from '../../shared';
import { getDoc, createDoc, deleteDoc, runQuery } from '../lib/firestore';
import { validateDocId, checkOwnership, incrementField } from '../lib/validation';

export async function listReplies(postId: string, commentId: string, opts: { cursor?: string; limit?: number }): Promise<{ replies: Record<string, unknown>[]; nextCursor?: string }> {
  validateDocId(postId, 'Post ID');
  validateDocId(commentId, 'Comment ID');
  const lim = Math.min(opts.limit ?? 20, MAX_REPLIES_PER_REQUEST);

  const queryOpts: any = {
    orderBy: [{ field: 'createdAt', direction: 'ASCENDING' }],
    limit: lim + 1,
  };

  if (opts.cursor) {
    const cursorDoc = await getDoc(`posts/${postId}/comments/${commentId}/replies/${opts.cursor}`);
    if (cursorDoc.createdAt != null) {
      queryOpts.startAfter = [cursorDoc.createdAt];
    }
  }

  const docs = await runQuery(`posts/${postId}/comments/${commentId}`, 'replies', queryOpts);
  const hasMore = docs.length > lim;
  const replies = docs.slice(0, lim);

  return {
    replies,
    nextCursor: hasMore ? (replies[replies.length - 1].id as string) : undefined,
  };
}

export async function createReply(uid: string, postId: string, commentId: string, text: string): Promise<Record<string, unknown>> {
  validateDocId(postId, 'Post ID');
  validateDocId(commentId, 'Comment ID');
  const now = Date.now();
  const replyData: Record<string, unknown> = {
    postId,
    userId: uid,
    text,
    createdAt: now,
    updatedAt: now,
    likes: [],
    parentCommentId: commentId,
  };

  const doc = await createDoc(`posts/${postId}/comments/${commentId}/replies`, replyData);

  await incrementField(`posts/${postId}/comments/${commentId}`, 'repliesCount', 1);

  return { reply: doc };
}

export async function deleteReply(uid: string, postId: string, commentId: string, replyId: string): Promise<void> {
  validateDocId(postId, 'Post ID');
  validateDocId(commentId, 'Comment ID');
  validateDocId(replyId, 'Reply ID');
  const reply = await getDoc(`posts/${postId}/comments/${commentId}/replies/${replyId}`);
  checkOwnership(reply, uid, 'delete');
  await deleteDoc(`posts/${postId}/comments/${commentId}/replies/${replyId}`);

  await incrementField(`posts/${postId}/comments/${commentId}`, 'repliesCount', -1);
}
