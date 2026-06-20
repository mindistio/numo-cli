import { api } from '../lib/api-client';
import type { CommentListResponse } from '../types/api';

export async function listComments(postId: string, opts: { cursor?: string; limit?: number }): Promise<CommentListResponse> {
  return api.get<CommentListResponse>(`/api/posts/${encodeURIComponent(postId)}/comments`, {
    cursor: opts.cursor,
    limit: opts.limit?.toString(),
  });
}
