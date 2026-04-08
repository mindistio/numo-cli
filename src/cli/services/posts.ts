import { MAX_POSTS_PER_REQUEST, KARMA_POINTS } from '../../shared';
import { getDoc, createDoc, updateDoc, deleteDoc, runQuery } from '../lib/firestore';
import { validateDocId, checkOwnership, incrementField } from '../lib/validation';
import { giveKarma } from '../lib/karma';

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80) + '-' + Date.now().toString(36);
}

export async function listPosts(opts: { cursor?: string; limit?: number }): Promise<{ posts: Record<string, unknown>[]; nextCursor?: string }> {
  const lim = Math.min(opts.limit ?? 20, MAX_POSTS_PER_REQUEST);

  const queryOpts: any = {
    orderBy: [{ field: 'createdAt', direction: 'DESCENDING' }],
    limit: lim + 1,
  };

  if (opts.cursor) {
    // Fetch cursor doc to get its createdAt for startAfter
    const cursorDoc = await getDoc(`posts/${opts.cursor}`);
    if (cursorDoc.createdAt != null) {
      queryOpts.startAfter = [cursorDoc.createdAt];
    }
  }

  const docs = await runQuery('', 'posts', queryOpts);
  const hasMore = docs.length > lim;
  const posts = docs.slice(0, lim);

  return {
    posts,
    nextCursor: hasMore ? (posts[posts.length - 1].id as string) : undefined,
  };
}

export async function getPost(id: string): Promise<Record<string, unknown>> {
  validateDocId(id, 'Post ID');
  const post = await getDoc(`posts/${id}`);
  if (post.authorId) {
    try {
      const author = await getDoc(`users/${post.authorId}`);
      post.authorName = author.username ?? null;
    } catch {
      // author doc may not exist
    }
  }
  return post;
}

export async function createPost(uid: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const now = Date.now();
  const postData: Record<string, unknown> = {
    title: body.title,
    body: body.body,
    tag: body.tag,
    authorId: uid,
    slug: generateSlug(body.title as string),
    isPublic: body.isPublic !== false,
    createdAt: now,
    updatedAt: now,
    commentsCount: 0,
    likesCount: 0,
  };

  const doc = await createDoc('posts', postData);
  const postId = doc.id as string;

  try {
    await giveKarma(uid, 'createPost', postId, KARMA_POINTS.createPost, String(body.title));
  } catch { /* non-critical */ }

  try {
    await incrementField(`users/${uid}/activity/totals`, 'posts.written', 1);
  } catch { /* non-critical */ }

  return { post: doc, karma: KARMA_POINTS.createPost };
}

export async function updatePost(uid: string, id: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  validateDocId(id, 'Post ID');
  const post = await getDoc(`posts/${id}`);
  checkOwnership(post, uid, 'update');
  const allowed = ['title', 'body', 'tag', 'isPublic'];
  const update: Record<string, unknown> = { updatedAt: Date.now() };
  const fieldMask = ['updatedAt'];

  for (const key of allowed) {
    if (key in body) {
      update[key] = body[key];
      fieldMask.push(key);
    }
  }

  await updateDoc(`posts/${id}`, update, fieldMask);
  const updated = await getDoc(`posts/${id}`);
  return { post: updated };
}

export async function deletePost(uid: string, id: string): Promise<void> {
  validateDocId(id, 'Post ID');
  const post = await getDoc(`posts/${id}`);
  checkOwnership(post, uid, 'delete');
  await deleteDoc(`posts/${id}`);
}
