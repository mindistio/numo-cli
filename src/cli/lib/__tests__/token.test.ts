import { describe, it, expect } from 'vitest';
import { decodeTokenClaims, verificationClaim } from '../token';

function token(claims: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
}

describe('decodeTokenClaims', () => {
  it('reads the claims the CLI displays', () => {
    const claims = decodeTokenClaims(token({
      exp: 1_760_000_000,
      email: 'a@b.com',
      user_id: 'uid-1',
      email_verified: true,
    }));
    expect(claims).toEqual({
      expMs: 1_760_000_000_000,
      email: 'a@b.com',
      uid: 'uid-1',
      emailVerified: true,
    });
  });

  it('falls back to sub when user_id is absent', () => {
    expect(decodeTokenClaims(token({ sub: 'uid-2' }))?.uid).toBe('uid-2');
  });

  // Contract: this only ever describes a token, so an unreadable one is reported as
  // "nothing known", never as an error the caller has to handle.
  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['not a JWT', 'garbage'],
    ['a JWT with a non-JSON payload', 'a.bm90LWpzb24.c'],
  ])('returns null for %s', (_label, value) => {
    expect(decodeTokenClaims(value)).toBeNull();
  });

  it('omits claims of the wrong type rather than passing them through', () => {
    const claims = decodeTokenClaims(token({ exp: 'soon', email: 42, email_verified: 'yes' }));
    expect(claims).toEqual({});
  });
});

describe('verificationClaim', () => {
  // Contract: the value never travels without the markers saying where it came
  // from. An agent reading whoami --json is the intended audience, and one that
  // treats this as authoritative will tell a user who verified a minute ago that
  // they are still blocked — the claim is minted with the token and does not move.
  it('labels the value as coming from the stored token', () => {
    expect(verificationClaim({ emailVerified: false })).toEqual({
      emailVerified: false,
      emailVerifiedSource: 'cached_token',
      emailVerifiedStale: true,
    });
  });

  it('reports null, not false, when nothing is known', () => {
    for (const claims of [null, {}, { email: 'a@b.com' }]) {
      expect(verificationClaim(claims)).toEqual({
        emailVerified: null,
        emailVerifiedSource: null,
        emailVerifiedStale: null,
      });
    }
  });

  it('never reports a value without its markers', () => {
    for (const claims of [null, {}, { emailVerified: true }, { emailVerified: false }]) {
      const out = verificationClaim(claims);
      expect(out.emailVerifiedSource === null).toBe(out.emailVerified === null);
      expect(out.emailVerifiedStale === null).toBe(out.emailVerified === null);
    }
  });
});
