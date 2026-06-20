import { api } from '../lib/api-client';
import type { ReplyListResponse } from '../types/api';

export async function listReplies(postId: string, commentId: string, opts: { cursor?: string; limit?: number }): Promise<ReplyListResponse> {
  return api.get<ReplyListResponse>(`/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/replies`, {
    cursor: opts.cursor,
    limit: opts.limit?.toString(),
  });
}
