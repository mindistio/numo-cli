import { api } from '../lib/api-client';
import type { ApiPost, PostListResponse, PostCreateResponse, PostUpdateResponse } from '../types/api';

export async function listPosts(opts: { cursor?: string; limit?: number }): Promise<PostListResponse> {
  return api.get<PostListResponse>('/api/posts', {
    cursor: opts.cursor,
    limit: opts.limit?.toString(),
  });
}

export async function getPost(id: string): Promise<ApiPost> {
  return api.get<ApiPost>(`/api/posts/${encodeURIComponent(id)}`);
}

export async function createPost(uid: string, body: Record<string, unknown>): Promise<PostCreateResponse> {
  return api.post<PostCreateResponse>('/api/posts', body);
}

export async function updatePost(uid: string, id: string, body: Record<string, unknown>): Promise<PostUpdateResponse> {
  return api.patch<PostUpdateResponse>(`/api/posts/${encodeURIComponent(id)}`, body);
}

export async function deletePost(uid: string, id: string): Promise<void> {
  await api.del(`/api/posts/${encodeURIComponent(id)}`);
}
