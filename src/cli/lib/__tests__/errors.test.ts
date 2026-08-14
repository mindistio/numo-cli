import { describe, it, expect } from 'vitest';
import { classifyError, commanderToCliError, sanitizeErrorMessage, CliError, ErrorKind, ExitCode } from '../errors';

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
  // The body-message-wins rule is asserted by the three cases below, each of which also
  // pins what happens to the hint, the suggestion and the exit code alongside it.

  it('keeps the status hint when the server said nothing', () => {
    expect(classifyError(httpError(403)).options.hint).toBeTruthy();
    expect(classifyError(httpError(400)).options.hint).toBeTruthy();
  });

  // The status hint is what we can say knowing only the status. Once the server has
  // explained itself, that explanation is the guidance — a 400 whose body reads
  // "Verification code is invalid or has expired" does not want "run with --help"
  // stapled underneath, which is advice pointing at the wrong problem.
  it('drops the generic status hint once the server explains itself', () => {
    const e = classifyError(httpError(400, { error: { kind: 'INVALID_INPUT', message: 'Code expired. Request a new one.' } }));
    expect(e.message).toBe('Code expired. Request a new one.');
    expect(e.options.hint).toBeUndefined();
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

describe('commanderToCliError', () => {
  const commanderError = (code: string, message: string) => Object.assign(new Error(message), { code, exitCode: 1 });

  // Contract: a parse failure is an error like any other — same kind vocabulary, same
  // exit code an agent branches on. Commander otherwise exits 1 with bare text.
  it.each([
    ['commander.unknownCommand', ErrorKind.INVALID_INPUT],
    ['commander.unknownOption', ErrorKind.INVALID_INPUT],
    ['commander.missingArgument', ErrorKind.MISSING_ARGUMENT],
    ['commander.optionMissingArgument', ErrorKind.MISSING_ARGUMENT],
  ])('%s → %s / exit 2', (code, kind) => {
    const e = commanderToCliError(commanderError(code, "error: unknown option '--x'"));
    expect(e.kind).toBe(kind);
    expect(e.exitCode).toBe(ExitCode.USAGE);
  });

  it('reports a group called without a subcommand as a missing argument', () => {
    const e = commanderToCliError(commanderError('commander.help', '(outputHelp)'));
    expect(e.kind).toBe(ErrorKind.MISSING_ARGUMENT);
    expect(e.message).toBe('Missing subcommand');
  });

  it('does not double the "error:" prefix Commander already writes', () => {
    const e = commanderToCliError(commanderError('commander.unknownOption', "error: unknown option '--nope'"));
    expect(e.message).toBe("unknown option '--nope'");
  });

  it('redacts a secret the user typed into an unknown option', () => {
    const secret = 'A'.repeat(40);
    const e = commanderToCliError(commanderError('commander.unknownOption', `error: unknown option '--token=${secret}'`));
    expect(e.message).not.toContain(secret);
  });

  it('leaves an error it does not recognise to the main classifier', () => {
    expect(commanderToCliError(new Error('boom')).kind).toBe(ErrorKind.UNKNOWN);
  });
});

describe('invariants', () => {
  const PUBLISHED_KINDS = new Set<string>(Object.values(ErrorKind));

  // I-3: in JSON mode every non-zero exit is accompanied by a parsable body. That holds
  // only if every class of failure — including argument parsing, which Commander used to
  // handle itself — produces a CliError with a non-zero exit code.
  it('I-3 — every failure class yields a serialisable error with a non-zero exit', () => {
    const failures: unknown[] = [
      Object.assign(new Error("error: unknown command 'nope'"), { code: 'commander.unknownCommand', exitCode: 1 }),
      Object.assign(new Error('(outputHelp)'), { code: 'commander.help', exitCode: 1 }),
      Object.assign(new Error('error: missing required argument'), { code: 'commander.missingArgument', exitCode: 1 }),
      httpError(401),
      httpError(403, { error: { kind: 'AUTH_FORBIDDEN', message: 'verify first' } }),
      httpError(500),
      { code: 'ECONNREFUSED' },
      new Error('something unplanned'),
    ];

    for (const failure of failures) {
      const e = commanderToCliError(failure);
      expect(e.exitCode).toBeGreaterThan(0);
      expect(() => JSON.parse(JSON.stringify(e.toJSON()))).not.toThrow();
      expect(e.toJSON().error.message).toBeTruthy();
    }
  });

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
