import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http } from '../http';

function ok(body: unknown = { ok: true }, headers: Record<string, string> = {}) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(headers),
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

function failure(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
  return {
    ok: false,
    status,
    headers: new Headers(headers),
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

/** Drive a request to completion with the backoff waits collapsed. */
async function settle<T>(p: Promise<T>): Promise<{ value?: T; error?: any }> {
  const outcome = p.then((value) => ({ value }), (error) => ({ error }));
  await vi.runAllTimersAsync();
  return outcome;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('http retries', () => {
  // Contract: a request that failed for a reason the caller can fix is not repeated. This
  // matters most for writes — a retried POST on a 409 is a second attempt to create
  // something the server has already said exists.
  it.each([400, 401, 403, 404, 409, 422])('does not retry a %i', async (status) => {
    fetchMock.mockResolvedValue(failure(status, { error: { message: 'nope' } }));

    const { error } = await settle(http.post('http://x/y', { a: 1 }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(error.response.status).toBe(status);
  });

  // Contract: transient server-side failures are retried, up to a bound. Unbounded retries
  // turn a struggling server into a client that never returns.
  it.each([429, 500, 502, 503, 504])('retries a %i and gives up after four attempts', async (status) => {
    fetchMock.mockResolvedValue(failure(status));

    const { error } = await settle(http.get('http://x/y'));

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(error.response.status).toBe(status);
  });

  it('stops retrying as soon as a retry succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(failure(503))
      .mockResolvedValueOnce(failure(503))
      .mockResolvedValueOnce(ok({ tasks: [] }));

    const { value } = await settle(http.get('http://x/y'));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(value!.data).toEqual({ tasks: [] });
  });

  it('retries a dropped connection, and not an unrecognised failure', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }));
    await settle(http.get('http://x/y'));
    expect(fetchMock).toHaveBeenCalledTimes(4);

    fetchMock.mockClear();
    fetchMock.mockRejectedValue(new Error('something structural'));
    await settle(http.get('http://x/y'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Contract: a server that says how long to wait is obeyed, rather than being hit again
  // on our own schedule. 429 is where this decides whether the next attempt is refused too.
  it('waits the Retry-After the server asked for', async () => {
    fetchMock
      .mockResolvedValueOnce(failure(429, {}, { 'retry-after': '7' }))
      .mockResolvedValueOnce(ok());

    const done = http.get('http://x/y').then(() => 'done');

    await vi.advanceTimersByTimeAsync(6_500);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(600);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(done).resolves.toBe('done');
  });
});

describe('http request shape', () => {
  it('sends a body only when one was given, and passes headers through', async () => {
    fetchMock.mockResolvedValue(ok());

    await settle(http.get('http://x/y', { headers: { 'x-k': 'v' } }));
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET', headers: { 'x-k': 'v' } });
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('body');

    await settle(http.post('http://x/y', { a: 1 }));
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ a: 1 }) });
  });

  it.each([
    ['patch', 'PATCH'],
    ['delete', 'DELETE'],
  ])('%s uses the %s method', async (name, method) => {
    fetchMock.mockResolvedValue(ok());
    await settle((http as any)[name]('http://x/y'));
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method });
  });

  // Contract: an empty response body is a valid answer, not a parse error. Writes that
  // return 204-with-nothing go through here.
  it('reads an empty body as an empty object', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 204, headers: new Headers(), text: async () => '', json: async () => ({}),
    } as unknown as Response);

    const { value } = await settle(http.get('http://x/y'));

    expect(value!.data).toEqual({});
  });

  // Contract: the failure carries what the error layer needs to classify it — the status,
  // the headers and the parsed body. Losing any of them turns a specific message into a
  // generic one at the point the user reads it.
  it('surfaces the server message, status, headers and body on a failure', async () => {
    fetchMock.mockResolvedValue(
      failure(403, { error: { kind: 'AUTH_FORBIDDEN', message: 'verify first' } }, { 'x-req': 'r1' }),
    );

    const { error } = await settle(http.get('http://x/y'));

    expect(error.message).toBe('verify first');
    expect(error.code).toBe('HTTP_403');
    expect(error.response).toMatchObject({
      status: 403,
      headers: { 'x-req': 'r1' },
      data: { error: { kind: 'AUTH_FORBIDDEN', message: 'verify first' } },
    });
  });

  it('falls back to the status when the body explains nothing', async () => {
    fetchMock.mockResolvedValue(failure(418));
    const { error } = await settle(http.get('http://x/y'));
    expect(error.message).toBe('HTTP 418');
  });
});

describe('http timeout', () => {
  // Contract: a request that never answers becomes a timeout error, not a hang. The code
  // is what the error layer maps to the retryable TIMEOUT kind.
  it('aborts a stalled request and reports it as a timeout', async () => {
    fetchMock.mockImplementation((_url: string, opts: any) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      }),
    );

    const { error } = await settle(http.get('http://x/y'));

    expect(error.message).toBe('Request timed out');
    expect(error.code).toBe('ECONNABORTED');
    // A timeout is transient, so it is retried like one — four stalls, not one.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not leave the abort timer armed after a fast response', async () => {
    fetchMock.mockResolvedValue(ok());

    await settle(http.get('http://x/y'));

    expect(vi.getTimerCount()).toBe(0);
  });
});
