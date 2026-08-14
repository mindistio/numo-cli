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

/** Redeem the oobCode from a verification link. The server answers with the account
 *  state as it stands after the redeem — read it rather than assuming success: the code
 *  names an address, and the server refuses one that is not the caller's. */
export async function confirmVerificationCode(
  oobCode: string,
): Promise<{ status: string; emailVerified?: boolean }> {
  return api.post('/api/auth/verify-email/confirm', { oobCode });
}
