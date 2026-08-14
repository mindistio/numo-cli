import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../tty', () => ({ isInteractive: vi.fn(() => true), isUnicodeSupported: false }));

import { selectFields, printTable, printJson, printRecord, outputResult, outputError } from '../output';
import { isInteractive } from '../tty';
import { CliError, ErrorKind, ExitCode } from '../errors';

let out: string[];
let err: string[];

beforeEach(() => {
  out = [];
  err = [];
  vi.mocked(isInteractive).mockReturnValue(true);
  vi.spyOn(console, 'log').mockImplementation((...args) => { out.push(args.map(String).join(' ')); });
  vi.spyOn(console, 'error').mockImplementation((...args) => { err.push(args.map(String).join(' ')); });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('selectFields', () => {
  const TASK = { id: 't1', text: 'Buy milk', note: 'private', difficulty: 2 };

  it('returns the payload untouched when no field list was given', () => {
    expect(selectFields({ task: TASK }, undefined)).toEqual({ task: TASK });
    expect(selectFields({ task: TASK }, true)).toEqual({ task: TASK });
  });

  // Contract: `--json <fields>` trims the records inside the envelope and keeps the
  // envelope's own scalars, which are what an agent pages and counts with.
  it('trims records in a list envelope and keeps the envelope scalars', () => {
    expect(selectFields({ tasks: [TASK], count: 1, nextCursor: null }, 'id,text')).toEqual({
      tasks: [{ id: 't1', text: 'Buy milk' }],
      count: 1,
      nextCursor: null,
    });
  });

  // Contract: the same flag trims a single-record envelope. It used to return every
  // field here — a caller asking for two of them still received the private note.
  it('trims a single-record envelope the same way', () => {
    expect(selectFields({ task: TASK, karma: 5 }, 'id,text')).toEqual({
      task: { id: 't1', text: 'Buy milk' },
      karma: 5,
    });
  });

  it('trims a bare array of records', () => {
    expect(selectFields([TASK], 'id')).toEqual([{ id: 't1' }]);
  });

  // toStrictEqual, not toEqual: a key present but undefined compares equal under toEqual
  // and then vanishes again in JSON.stringify, so the looser assertion could not tell an
  // omitted field from one carried through as undefined.
  it('tolerates spaces in the field list and omits fields the record does not have', () => {
    expect(selectFields({ task: TASK }, 'id, nope')).toStrictEqual({ task: { id: 't1' } });
  });

  it('leaves a value that is not a record alone', () => {
    expect(selectFields('plain', 'id')).toBe('plain');
    expect(selectFields({ ok: true, count: 0 }, 'id')).toEqual({ ok: true, count: 0 });
  });
});

describe('printTable', () => {
  // Contract: a piped table is still machine-readable. Rendering box drawing into a pipe
  // would hand a script something it cannot parse, and JSON mode is decided by the same
  // detection everywhere else.
  it('prints JSON instead of a table when stdout is not a terminal', () => {
    vi.mocked(isInteractive).mockReturnValue(false);

    printTable([{ id: 't1', text: 'Buy milk' }], ['id', 'text']);

    expect(JSON.parse(out.join('\n'))).toEqual([{ id: 't1', text: 'Buy milk' }]);
  });

  it('renders a table when attached to a terminal', () => {
    printTable([{ id: 't1', text: 'Buy milk' }], ['id', 'text']);

    expect(out.join('\n')).toContain('ID');
    expect(out.join('\n')).toContain('Buy milk');
  });

  // A record without one of the requested columns is data the server did not send, not
  // something to print the word for. This is also what keeps every row the same width as
  // the header, which the renderer takes as given.
  it('prints a blank for a column a record does not have', () => {
    printTable([{ id: 't1' }], ['id', 'note']);

    const printed = out.join('\n');
    expect(printed).not.toContain('undefined');
    expect(printed).toContain('NOTE');
  });
});

describe('printRecord', () => {
  it('drops fields with nothing in them rather than printing empty labels', () => {
    printRecord([['Text', 'Buy milk'], ['Note', null], ['Tags', ''], ['Effort', 0]]);

    const printed = out.join('\n');
    expect(printed).toContain('Buy milk');
    expect(printed).not.toContain('Note');
    expect(printed).not.toContain('Tags');
    // 0 is a value, not an absence — filtering on falsiness would have eaten it.
    expect(printed).toContain('Effort');
  });
});

describe('outputResult', () => {
  it('prints a string as itself outside JSON mode, and as JSON inside it', () => {
    outputResult('done', false);
    expect(out).toEqual(['done']);

    out.length = 0;
    outputResult('done', true);
    expect(JSON.parse(out[0])).toBe('done');
  });
});

describe('outputError', () => {
  function exitCodeOf(fn: () => void): number {
    const exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`__exit__:${code}`);
    }) as unknown as { mock: { calls: unknown[][] } };
    try {
      fn();
    } catch (e) {
      const m = /__exit__:(\d+)/.exec((e as Error).message);
      if (m) return Number(m[1]);
      throw e;
    } finally {
      exit.mock.calls.length = 0;
    }
    throw new Error('outputError returned instead of exiting');
  }

  // Contract: in JSON mode stderr carries one parseable envelope, and the process exits
  // with the code that belongs to the kind. Both halves are published, so a caller can
  // branch on either without reading the wording.
  it('writes a parseable envelope to stderr and exits with the kind exit code', () => {
    const code = exitCodeOf(() =>
      outputError(new CliError(ErrorKind.CONFIG_ERROR, 'NUMO_API_URL not set', ExitCode.CONFIG), true),
    );

    expect(code).toBe(78);
    expect(JSON.parse(err.join('\n')).error).toMatchObject({
      kind: 'CONFIG_ERROR',
      code: 78,
      message: 'NUMO_API_URL not set',
    });
    expect(out).toEqual([]);
  });

  it('writes human text outside JSON mode, and still exits non-zero', () => {
    const code = exitCodeOf(() =>
      outputError(new CliError(ErrorKind.AUTH_REQUIRED, 'Not logged in', ExitCode.NO_PERM, {
        suggestion: 'numo login',
      }), false),
    );

    expect(code).toBe(77);
    const printed = err.join('\n');
    expect(printed).toContain('Not logged in');
    expect(printed).toContain('numo login');
    expect(() => JSON.parse(printed)).toThrow();
  });

  // Contract: whatever is thrown, the exit is non-zero and stderr is still an envelope.
  // A bare string or a plain Error reaching here is the case where a shell `if` would
  // otherwise read a crash as success.
  it('classifies a value that is not a CliError rather than exiting 0', () => {
    const code = exitCodeOf(() => outputError('something unplanned', true));

    expect(code).toBeGreaterThan(0);
    expect(JSON.parse(err.join('\n')).error.kind).toBeTruthy();
  });
});
