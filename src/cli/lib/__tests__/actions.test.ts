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

  // Contract: `--json <fields>` applies wherever the payload leaves. Applying it in some
  // runners and not others is worse than not having it: the caller cannot tell which.
  it('applies the field list in every runner', async () => {
    const global = { json: 'id,text' };
    const fn = () => Promise.resolve({ task: TASK, tasks: [TASK] });

    for (const [, call] of RUNNERS) await call(global, fn);

    expect(vi.mocked(printJson).mock.calls.length).toBe(RUNNERS.length);
    for (const [payload] of vi.mocked(printJson).mock.calls) {
      expect(payload).toEqual({ task: { id: 't1', text: 'Buy milk' }, tasks: [{ id: 't1', text: 'Buy milk' }] });
    }
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
