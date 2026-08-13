import { describe, it, expect } from 'vitest';
import { classifyError, sanitizeErrorMessage, CliError, ErrorKind, ExitCode } from '../errors';

function httpError(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return { code: `HTTP_${status}`, message: `HTTP ${status}`, response: { status, headers, data: body } };
}

describe('classifyError — status table', () => {
  // Contract: every status the server can answer with maps to a kind and an exit code
  // agents can branch on.
  it.each([
    [400, ErrorKind.INVALID_INPUT, ExitCode.USAGE],
    [401, ErrorKind.AUTH_REQUIRED, ExitCode.NO_PERM],
    [403, ErrorKind.AUTH_FORBIDDEN, ExitCode.NO_PERM],
    [404, ErrorKind.NOT_FOUND, ExitCode.NOT_FOUND],
    [409, ErrorKind.CONFLICT, ExitCode.CONFLICT],
    [429, ErrorKind.RATE_LIMITED, ExitCode.TEMP_FAIL],
    [503, ErrorKind.SERVICE_UNAVAILABLE, ExitCode.UNAVAILABLE],
  ])('%i → %s / exit %i', (status, kind, exitCode) => {
    const e = classifyError(httpError(status));
    expect(e.kind).toBe(kind);
    expect(e.exitCode).toBe(exitCode);
  });

  it('takes Retry-After from the response header', () => {
    const e = classifyError(httpError(429, undefined, { 'retry-after': '42' }));
    expect(e.options.retryAfter).toBe(42);
    expect(e.options.retryable).toBe(true);
  });

  it('maps transport failures without a response to network kinds', () => {
    expect(classifyError({ code: 'ECONNREFUSED' }).kind).toBe(ErrorKind.NETWORK_ERROR);
    expect(classifyError({ code: 'ECONNABORTED' }).kind).toBe(ErrorKind.TIMEOUT);
  });

  it('passes a CliError through untouched', () => {
    const original = new CliError(ErrorKind.CONFLICT, 'already there', ExitCode.CONFLICT);
    expect(classifyError(original)).toBe(original);
  });
});

describe('classifyError — structured body over status', () => {
  // Contract: when the server explains the refusal, the user reads that explanation.
  // A generic "Access denied" in its place is the defect this classifier exists to fix.
  it('shows the server message instead of the generic status message', () => {
    const e = classifyError(
      httpError(403, { error: { kind: 'AUTH_FORBIDDEN', message: 'Verify your email to create tasks' } }),
    );
    expect(e.message).toBe('Verify your email to create tasks');
  });

  it('keeps the hint from the status table — a structured body never carries one', () => {
    const e = classifyError(httpError(403, { error: { kind: 'AUTH_FORBIDDEN', message: 'nope' } }));
    expect(e.options.hint).toBeTruthy();
  });

  it('keeps the suggestion from the status table', () => {
    const e = classifyError(httpError(401, { error: { kind: 'AUTH_REQUIRED', message: 'token expired' } }));
    expect(e.options.suggestion).toBe('numo login');
    expect(e.message).toBe('token expired');
  });

  it('re-derives the exit code from the kind the body supplied', () => {
    const e = classifyError(httpError(400, { error: { kind: 'CONFLICT', message: 'taken' } }));
    expect(e.kind).toBe(ErrorKind.CONFLICT);
    expect(e.exitCode).toBe(ExitCode.CONFLICT);
  });

  it('falls back to the status kind when the body declares an unknown one', () => {
    const e = classifyError(httpError(403, { error: { kind: 'PWNED', message: 'still shown' } }));
    expect(e.kind).toBe(ErrorKind.AUTH_FORBIDDEN);
    expect(e.message).toBe('still shown');
  });
});

describe('invariants', () => {
  const PUBLISHED_KINDS = new Set<string>(Object.values(ErrorKind));

  // I-2: every kind the CLI emits is one an agent could have read from the published
  // enum. This is broken by what the *server* answers, not by our own call sites, so a
  // single-call contract cannot cover it.
  it('I-2 — never emits a kind outside the published enum', () => {
    const hostile: unknown[] = [
      httpError(403, { error: { kind: 'PWNED', message: 'x' } }),
      httpError(500, { error: { kind: null, message: 'x' } }),
      httpError(418, { error: { kind: 'CONFLICT', message: 'x' } }),
      httpError(200, { error: { kind: '__proto__', message: 'x' } }),
      httpError(404, 'not an object'),
      { message: 'no response at all' },
      {},
      null,
      'a bare string',
    ];
    for (const err of hostile) {
      expect(PUBLISHED_KINDS.has(classifyError(err).kind)).toBe(true);
    }
  });

  // I-6: no path from a response body to the user's terminal leaks a credential.
  it('I-6 — never surfaces a token, JWT or secret blob in the message', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.aGVsbG93b3JsZHNpZ25hdHVyZQ';
    const secrets = [jwt, 'AIzaSyD' + 'x'.repeat(30), 'Bearer ' + jwt];
    for (const secret of secrets) {
      const e = classifyError(httpError(401, { error: { kind: 'AUTH_EXPIRED', message: `bad token: ${secret}` } }));
      expect(e.message).not.toContain(secret);
    }
  });

  it('I-6 — sanitizes URLs, paths and addresses too', () => {
    const dirty = 'GET https://api.example.com/v1/x from /Users/someone/.config failed for a@b.com';
    const clean = sanitizeErrorMessage(dirty);
    expect(clean).not.toContain('api.example.com');
    expect(clean).not.toContain('/Users/someone');
    expect(clean).not.toContain('a@b.com');
  });
});
