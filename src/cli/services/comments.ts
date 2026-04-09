import { api } from '../lib/api-client';
import type { CommentListResponse, CommentCreateResponse } from '../types/api';

export async function listComments(postId: string, opts: { cursor?: string; limit?: number }): Promise<CommentListResponse> {
  return api.get<CommentListResponse>(`/api/posts/${encodeURIComponent(postId)}/comments`, {
    cursor: opts.cursor,
    limit: opts.limit?.toString(),
  });
}

export async function createComment(uid: string, postId: string, text: string): Promise<CommentCreateResponse> {
  return api.post<CommentCreateResponse>(`/api/posts/${encodeURIComponent(postId)}/comments`, { text });
}

export async function deleteComment(uid: string, postId: string, commentId: string): Promise<void> {
  await api.del(`/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`);
}
