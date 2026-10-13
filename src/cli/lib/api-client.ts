import { getIdToken } from '../auth/credentials';
import { http, type HttpResponse } from './http';
import { classifyError } from './errors';
import { API_BASE, assertSafeApiBase } from './api-base';

export { API_BASE };

// The user's own zone, so "today" and a task's reminder time are local, not the server's.
// Left out when the system has none Intl can use (a bogus TZ resolves to undefined or
// Etc/Unknown): the server then keeps its own zone instead of refusing the request.
function timeZone(): string | undefined {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    return zone && new Intl.DateTimeFormat('en-US', { timeZone: zone }) ? zone : undefined;
  } catch {
    return undefined;
  }
}

async function apiHeaders(): Promise<Record<string, string>> {
  assertSafeApiBase();
  const token = await getIdToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const zone = timeZone();
  return zone ? { ...headers, 'X-Numo-Timezone': zone } : headers;
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
      throw classifyError(err);
    }
  },

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    try {
      const resp: HttpResponse<T> = await http.post(url(path), body, { headers: await apiHeaders() });
      return resp.data;
    } catch (err) {
      throw classifyError(err);
    }
  },

  async patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    try {
      const resp: HttpResponse<T> = await http.patch(url(path), body, { headers: await apiHeaders() });
      return resp.data;
    } catch (err) {
      throw classifyError(err);
    }
  },

  async del<T = unknown>(path: string): Promise<T> {
    try {
      const resp: HttpResponse<T> = await http.delete(url(path), { headers: await apiHeaders() });
      return resp.data;
    } catch (err) {
      throw classifyError(err);
    }
  },
};
