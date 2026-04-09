import { api } from '../lib/api-client';
import type { ReplyListResponse, ReplyCreateResponse } from '../types/api';

export async function listReplies(postId: string, commentId: string, opts: { cursor?: string; limit?: number }): Promise<ReplyListResponse> {
  return api.get<ReplyListResponse>(`/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/replies`, {
    cursor: opts.cursor,
    limit: opts.limit?.toString(),
  });
}

export async function createReply(uid: string, postId: string, commentId: string, text: string): Promise<ReplyCreateResponse> {
  return api.post<ReplyCreateResponse>(`/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/replies`, { text });
}

export async function deleteReply(uid: string, postId: string, commentId: string, replyId: string): Promise<void> {
  await api.del(`/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/replies/${encodeURIComponent(replyId)}`);
}
