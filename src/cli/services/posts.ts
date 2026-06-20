import { api } from '../lib/api-client';
import type { ApiPost, PostListResponse } from '../types/api';

export async function listPosts(opts: { cursor?: string; limit?: number }): Promise<PostListResponse> {
  return api.get<PostListResponse>('/api/posts', {
    cursor: opts.cursor,
    limit: opts.limit?.toString(),
  });
}

export async function getPost(id: string): Promise<ApiPost> {
  return api.get<ApiPost>(`/api/posts/${encodeURIComponent(id)}`);
}
