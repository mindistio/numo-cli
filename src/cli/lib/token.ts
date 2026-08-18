export interface TokenClaims {
  email?: string;
  uid?: string;
  expMs?: number;
  emailVerified?: boolean;
}

/**
 * Read the claims out of an ID token without verifying its signature.
 *
 * Only ever used to describe the token the CLI already holds — never to decide
 * whether a request is allowed. The API validates the token; this cannot, and a
 * caller who could forge one would be forging it for themselves anyway.
 */
export function decodeTokenClaims(token: string | undefined): TokenClaims | null {
  if (!token) return null;
  try {
    const payloadB64 = token.split('.')[1] ?? '';
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'));
    const claims: TokenClaims = {};

    if (typeof payload.exp === 'number') claims.expMs = payload.exp * 1000;
    if (typeof payload.email === 'string') claims.email = payload.email;
    if (typeof payload.user_id === 'string') claims.uid = payload.user_id;
    else if (typeof payload.sub === 'string') claims.uid = payload.sub;
    if (typeof payload.email_verified === 'boolean') claims.emailVerified = payload.email_verified;

    return claims;
  } catch {
    return null;
  }
}

/**
 * How `whoami` reports verification: the value, plus the fact that it came from a
 * token and not from the server.
 *
 * The claim is baked in when the token is minted, so it stays false for up to an
 * hour after the user clicks the link. `whoami --json` is where an agent looks, and
 * an agent that treats this as authoritative will tell a user who has just verified
 * that they are still blocked — the one moment it is worst to be wrong. Hence the
 * markers: the payload has to say it is not the answer, not merely fail to say it is.
 */
export function verificationClaim(claims: TokenClaims | null) {
  if (claims?.emailVerified === undefined) {
    return { emailVerified: null, emailVerifiedSource: null, emailVerifiedStale: null };
  }
  return {
    emailVerified: claims.emailVerified,
    emailVerifiedSource: 'cached_token',
    emailVerifiedStale: true,
  };
}
