import { getIdToken } from '../auth/credentials';
import { http, type HttpResponse } from './http';
import { CliError, ErrorKind, ExitCode, sanitizeErrorMessage } from './errors';
import { API_BASE, assertSafeApiBase } from './api-base';

export { API_BASE };

const KIND_EXIT: Partial<Record<string, number>> = {
  AUTH_REQUIRED: ExitCode.NO_PERM,
  AUTH_EXPIRED: ExitCode.NO_PERM,
  AUTH_FORBIDDEN: ExitCode.NO_PERM,
  INVALID_INPUT: ExitCode.USAGE,
  MISSING_ARGUMENT: ExitCode.USAGE,
  NOT_FOUND: ExitCode.NOT_FOUND,
  CONFLICT: ExitCode.CONFLICT,
  RATE_LIMITED: ExitCode.TEMP_FAIL,
  NETWORK_ERROR: ExitCode.UNAVAILABLE,
  TIMEOUT: ExitCode.TEMP_FAIL,
  SERVICE_UNAVAILABLE: ExitCode.UNAVAILABLE,
};

function toCliError(err: unknown): CliError {
  if (err instanceof CliError) return err;

  const httpErr = err as {
    code?: string;
    response?: { status: number; headers: Record<string, string>; data: unknown };
    message?: string;
  };

  if (httpErr.code === 'ECONNABORTED' || httpErr.code === 'ETIMEDOUT') {
    return new CliError(ErrorKind.TIMEOUT, 'Request timed out', ExitCode.TEMP_FAIL, {
      hint: 'The API server took too long to respond.',
      retryable: true,
    });
  }
  if (httpErr.code === 'ECONNREFUSED' || httpErr.code === 'ECONNRESET' || httpErr.code === 'ENOTFOUND') {
    return new CliError(ErrorKind.NETWORK_ERROR, "Can't reach Numo API", ExitCode.UNAVAILABLE, {
      hint: 'Is the API server running? Check NUMO_API_URL.',
      retryable: true,
    });
  }

  const body = httpErr.response?.data as { error?: { kind?: string; message?: string; retryable?: boolean; retryAfter?: number } } | undefined;
  if (body?.error) {
    const e = body.error;
    const kind = (e.kind as ErrorKind) ?? ErrorKind.UNKNOWN;
    const exitCode = KIND_EXIT[kind] ?? ExitCode.GENERAL;
    return new CliError(kind, sanitizeErrorMessage(e.message ?? 'Unknown error'), exitCode, {
      retryable: e.retryable,
      retryAfter: e.retryAfter,
    });
  }

  return new CliError(ErrorKind.UNKNOWN, sanitizeErrorMessage(httpErr.message ?? 'Unknown error'), ExitCode.GENERAL);
}

async function apiHeaders(): Promise<Record<string, string>> {
  assertSafeApiBase();
  const token = await getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function url(path: string, params?: Record<string, string | undefined>): string {
  const u = `${API_BASE}${path}`;
  if (!params) return u;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `${u}?${qs}` : u;
}

export const api = {
  async get<T = unknown>(path: string, params?: Record<string, string | undefined>): Promise<T> {
    try {
      const resp: HttpResponse<T> = await http.get(url(path, params), { headers: await apiHeaders() });
      return resp.data;
    } catch (err) {
      throw toCliError(err);
    }
  },

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    try {
      const resp: HttpResponse<T> = await http.post(url(path), body, { headers: await apiHeaders() });
      return resp.data;
    } catch (err) {
      throw toCliError(err);
    }
  },

  async patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    try {
      const resp: HttpResponse<T> = await http.patch(url(path), body, { headers: await apiHeaders() });
      return resp.data;
    } catch (err) {
      throw toCliError(err);
    }
  },

  async del<T = unknown>(path: string): Promise<T> {
    try {
      const resp: HttpResponse<T> = await http.delete(url(path), { headers: await apiHeaders() });
      return resp.data;
    } catch (err) {
      throw toCliError(err);
    }
  },
};
