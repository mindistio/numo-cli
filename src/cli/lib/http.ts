const DEFAULT_TIMEOUT = 30_000;
const MAX_RETRIES = 3;

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'ECONNABORTED',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

interface HttpError extends Error {
  code?: string;
  response?: { status: number; headers: Record<string, string>; data: unknown };
}

function isRetryableError(err: HttpError): boolean {
  if (err.code && RETRYABLE_NETWORK_CODES.has(err.code)) return true;
  const status = err.response?.status;
  if (status && RETRYABLE_STATUS.has(status)) return true;
  return false;
}

function backoffMs(attempt: number, retryAfterHeader?: string): number {
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10);
    if (!isNaN(seconds)) return seconds * 1000;
  }
  const base = 1000 * Math.pow(2, attempt);
  const jitter = Math.random() * base * 0.5;
  return Math.floor(base + jitter);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface HttpResponse<T = any> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  /**
   * How many times to re-send after a retryable failure. Defaults to MAX_RETRIES.
   *
   * Pass 0 for a call that is not idempotent — one that mints something, or arms a
   * limit, as a side effect of being received. The retry loop cannot tell a request
   * that never arrived from a response that was lost on the way back, so for those it
   * turns one user action into several, and the server answers the extra ones with
   * whatever guard the first one armed.
   */
  retries?: number;
}

async function doRequest<T = any>(url: string, opts: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
  const method = opts.method ?? 'GET';
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const fetchOpts: RequestInit = {
    method,
    headers: opts.headers ?? {},
    signal: controller.signal,
  };
  if (opts.body !== undefined) {
    fetchOpts.body = JSON.stringify(opts.body);
  }

  try {
    const resp = await fetch(url, fetchOpts);
    clearTimeout(timer);

    const responseHeaders: Record<string, string> = {};
    resp.headers.forEach((v, k) => { responseHeaders[k] = v; });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      const err: HttpError = new Error(
        (body as any)?.error?.message ?? `HTTP ${resp.status}`
      );
      err.response = { status: resp.status, headers: responseHeaders, data: body };
      err.code = `HTTP_${resp.status}`;
      throw err;
    }

    const text = await resp.text();
    const data = text ? JSON.parse(text) : {};
    return { data, status: resp.status, headers: responseHeaders };
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      const timeoutErr: HttpError = new Error('Request timed out');
      timeoutErr.code = 'ECONNABORTED';
      throw timeoutErr;
    }
    if (err.cause?.code && !err.response) {
      err.code = err.cause.code;
    }
    throw err;
  }
}

async function requestWithRetry<T = any>(url: string, opts: HttpRequestOptions = {}): Promise<HttpResponse<T>> {
  const maxRetries = opts.retries ?? MAX_RETRIES;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await doRequest<T>(url, opts);
    } catch (err: any) {
      if (attempt < maxRetries && isRetryableError(err)) {
        const retryAfter = err.response?.headers?.['retry-after'];
        const waitMs = backoffMs(attempt, retryAfter);
        await delay(waitMs);
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

export const http = {
  async get<T = any>(url: string, opts?: { headers?: Record<string, string> }): Promise<HttpResponse<T>> {
    return requestWithRetry<T>(url, { method: 'GET', headers: opts?.headers });
  },
  async post<T = any>(
    url: string,
    body?: unknown,
    opts?: { headers?: Record<string, string>; retries?: number },
  ): Promise<HttpResponse<T>> {
    return requestWithRetry<T>(url, { method: 'POST', headers: opts?.headers, body, retries: opts?.retries });
  },
  async patch<T = any>(url: string, body?: unknown, opts?: { headers?: Record<string, string> }): Promise<HttpResponse<T>> {
    return requestWithRetry<T>(url, { method: 'PATCH', headers: opts?.headers, body });
  },
  async delete(url: string, opts?: { headers?: Record<string, string> }): Promise<HttpResponse> {
    return requestWithRetry(url, { method: 'DELETE', headers: opts?.headers });
  },
};
