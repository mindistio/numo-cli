import { describe, it, expect, vi, beforeEach } from 'vitest';

// selectFields stays real — the rule under test is that each runner applies it, and a
// mocked one would only prove a call was made, not that the payload came out trimmed.
vi.mock('../output', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../output')>()),
  printJson: vi.fn(),
  printTable: vi.fn(),
  outputResult: vi.fn(),
  outputError: vi.fn(),
}));
vi.mock('../spinner', () => ({ withSpinner: vi.fn(async (_interactive, _msg, fn) => fn()) }));
vi.mock('../tty', () => ({ isInteractive: vi.fn(() => true), isUnicodeSupported: false }));

import { runGet, runList, runCreate, runWrite } from '../actions';
import { printJson, printTable, outputResult, outputError } from '../output';
import { withSpinner } from '../spinner';

const TASK = { id: 't1', text: 'Buy milk', note: 'private' };
// The completion record numo-api returns beside `task` — a second full task, not a
// wrapper. It must survive a field list that names none of its fields.
const HISTORY = { id: 'h1', text: 'Buy milk', note: 'private', date: '2026-08-14' };

const RUNNERS = [
  ['runGet', (global: any, fn: any) => runGet({ global, fn })],
  ['runList', (global: any, fn: any) => runList({ global, fn, dataKey: 'tasks', columns: ['id'] })],
  ['runCreate', (global: any, fn: any) => runCreate({ global, fn, dataKey: 'task' })],
  ['runWrite', (global: any, fn: any) => runWrite({ global, fn, dataKey: 'task' })],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('action runners', () => {
  // Contract: no runner lets a failure escape as an exception. Every command routes
  // through one of these, so a gap here is a stack trace on stderr and an exit code that
  // says nothing, in place of the published envelope.
  it.each(RUNNERS)('%s reports a failure through outputError instead of throwing', async (_name, call) => {
    const boom = new Error('upstream exploded');

    await expect(call({ json: true }, () => Promise.reject(boom))).resolves.toBeUndefined();

    expect(outputError).toHaveBeenCalledWith(boom, true);
  });

  // Contract: the JSON flag is passed on, so the failure is reported in the shape the
  // caller asked for rather than the shape the terminal would like.
  it.each(RUNNERS)('%s tells outputError which mode it is in', async (_name, call) => {
    await call({}, () => Promise.reject(new Error('x')));
    expect(outputError).toHaveBeenLastCalledWith(expect.any(Error), false);
  });

  // Contract: JSON mode outranks the interactive renderer. An agent must never receive
  // the pretty output just because a command happens to define one.
  // One case, not a table: the body below already exercises all four runners, so a
  // parametrised version ran the identical body four times over an unused parameter.
  it('ignores onInteractive in JSON mode, in every runner', async () => {
    const onInteractive = vi.fn();
    const payload = { task: TASK, tasks: [TASK] };
    const fn = () => Promise.resolve(payload);
    const global = { json: true };

    await runGet({ global, fn, onInteractive });
    await runList({ global, fn, dataKey: 'tasks', columns: ['id'], onInteractive });
    await runCreate({ global, fn, dataKey: 'task', onInteractive });
    await runWrite({ global, fn, dataKey: 'task', onInteractive });

    expect(onInteractive).not.toHaveBeenCalled();
    expect(printJson).toHaveBeenCalledTimes(4);
  });

  // Contract: `--json <fields>` trims the record the command is about, and touches
  // nothing else in the envelope.
  //
  // Each row carries the payload its runner actually receives. The previous version of
  // this test fed all four the same invented `{task, tasks}` — a shape no command
  // returns — and so proved nothing about any of them. It is why `tasks get` shipped
  // ignoring the field list entirely: getTask returns a bare ApiTask, not `{task}`, and
  // the envelope logic left every top-level scalar in place, private note included.
  //
  // The last two rows are the other direction, and the four above cannot stand without
  // them: every one of those envelopes holds exactly one object, so all four would pass
  // just as well on a rule that trims every nested object it finds.
  //
  // The complete row is the case that separates the two rules. numo-api answers it with
  // `{completed, task, taskHistory, karma, checksInRow, taskText}` — two full records
  // side by side, `taskHistory` being a second serializeTask result rather than a
  // wrapper around one. Trimming by type hit both and left no way to ask the second one
  // back, since `--json taskHistory` looked for a key of that name inside it.
  it.each([
    ['runGet — payload IS the record',
      (g: any, f: any) => runGet({ global: g, fn: f }),
      { id: 't1', text: 'Buy milk', note: 'private' },
      { id: 't1', text: 'Buy milk' }],
    ['runList — trims the rows, keeps the paging scalars',
      (g: any, f: any) => runList({ global: g, fn: f, dataKey: 'tasks', columns: ['id'] }),
      { tasks: [TASK], count: 1, nextCursor: null },
      { tasks: [{ id: 't1', text: 'Buy milk' }], count: 1, nextCursor: null }],
    ['runCreate — trims the created record',
      (g: any, f: any) => runCreate({ global: g, fn: f, dataKey: 'task' }),
      { task: TASK },
      { task: { id: 't1', text: 'Buy milk' } }],
    ['runWrite — trims the updated record',
      (g: any, f: any) => runWrite({ global: g, fn: f, dataKey: 'task' }),
      { task: TASK },
      { task: { id: 't1', text: 'Buy milk' } }],
    ['runWrite on complete — trims the acted-on record, leaves the peer record whole',
      (g: any, f: any) => runWrite({ global: g, fn: f, dataKey: 'task' }),
      { completed: true, task: TASK, taskHistory: HISTORY, karma: 3 },
      { completed: true, task: { id: 't1', text: 'Buy milk' }, taskHistory: HISTORY, karma: 3 }],
    ['runWrite without a record key — the envelope is the answer, untouched',
      (g: any, f: any) => runWrite({ global: g, fn: f }),
      { taskText: 'Buy milk', archived: true },
      { taskText: 'Buy milk', archived: true }],
  ])('%s', async (_name, call, payload, expected) => {
    await call({ json: 'id,text' }, () => Promise.resolve(payload));

    expect(vi.mocked(printJson)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(printJson).mock.calls[0][0]).toStrictEqual(expected);
  });

  // Contract: no spinner writes while a machine is reading. The spinner goes to stdout,
  // so one frame of it in JSON mode is a payload that will not parse.
  it.each(RUNNERS)('%s runs without a spinner in JSON mode, and with one in a terminal', async (_name, call) => {
    await call({ json: true }, () => Promise.resolve({ task: TASK, tasks: [TASK] }));
    expect(withSpinner).toHaveBeenLastCalledWith(false, expect.any(String), expect.any(Function));

    await call({}, () => Promise.resolve({ task: TASK, tasks: [TASK] }));
    expect(withSpinner).toHaveBeenLastCalledWith(true, expect.any(String), expect.any(Function));
  });

  it('renders a table for a list in a terminal, and the record for the others', async () => {
    const fn = () => Promise.resolve({ task: TASK, tasks: [TASK] });

    await runList({ global: {}, fn, dataKey: 'tasks', columns: ['id', 'text'] });
    expect(printTable).toHaveBeenCalledWith([TASK], ['id', 'text']);

    await runGet({ global: {}, fn });
    expect(outputResult).toHaveBeenCalled();
  });
});
