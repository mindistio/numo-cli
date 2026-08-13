import { api } from '../lib/api-client';
import type { MeResponse } from '../types/api';

/** Live account state. The authoritative answer to "am I verified?" — a stored
 *  token's claim can lag the account by up to an hour after the link is clicked. */
export async function getMe(): Promise<MeResponse> {
  return api.get<MeResponse>('/api/me');
}

export async function resendVerificationEmail(): Promise<void> {
  await api.post('/api/auth/verify-email');
}

export async function confirmVerificationCode(oobCode: string): Promise<void> {
  await api.post('/api/auth/verify-email/confirm', { oobCode });
}
