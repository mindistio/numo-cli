import { api } from '../lib/api-client';
import type { ProfileResponse } from '../types/api';

export async function getProfile(): Promise<ProfileResponse> {
  return api.get<ProfileResponse>('/api/profile');
}
