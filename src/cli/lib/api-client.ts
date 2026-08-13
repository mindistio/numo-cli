import { getIdToken } from '../auth/credentials';
import { http, type HttpResponse } from './http';
import { classifyError } from './errors';
import { API_BASE, assertSafeApiBase } from './api-base';

export { API_BASE };

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
