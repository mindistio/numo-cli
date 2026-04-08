import { http } from './http';
import { getIdToken } from '../auth/credentials';
import { getFirestoreBaseUrl } from './config';

// ── Serialization ────────────────────────────────────────────────────

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { arrayValue: { values: FirestoreValue[] } }
  | { mapValue: { fields: Record<string, FirestoreValue> } };

function toValue(v: unknown): FirestoreValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(toValue) } };
  }
  if (typeof v === 'object') {
    return { mapValue: { fields: toFirestoreFields(v as Record<string, unknown>) } };
  }
  return { stringValue: String(v) };
}

export function toFirestoreFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = toValue(v);
  }
  return fields;
}

function fromValue(v: FirestoreValue): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return parseInt(v.integerValue as string, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromValue);
  if ('mapValue' in v) return fromFirestoreFields(v.mapValue.fields ?? {});
  return null;
}

function fromFirestoreFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    obj[k] = fromValue(v);
  }
  return obj;
}

export function fromFirestoreDoc(doc: { name: string; fields?: Record<string, FirestoreValue> }): Record<string, unknown> {
  const id = doc.name.split('/').pop()!;
  return { id, ...(doc.fields ? fromFirestoreFields(doc.fields) : {}) };
}

// ── Auth helper ──────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  const idToken = await getIdToken();
  return { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' };
}

// ── CRUD ─────────────────────────────────────────────────────────────

export async function getDoc(path: string): Promise<Record<string, unknown>> {
  const url = `${getFirestoreBaseUrl()}/${path}`;
  const { data } = await http.get(url, { headers: await authHeaders() });
  return fromFirestoreDoc(data);
}

export async function createDoc(collectionPath: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = `${getFirestoreBaseUrl()}/${collectionPath}`;
  const resp = await http.post(url, { fields: toFirestoreFields(data) }, { headers: await authHeaders() });
  return fromFirestoreDoc(resp.data);
}

export async function setDoc(docPath: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = `${getFirestoreBaseUrl()}/${docPath}`;
  const resp = await http.patch(url, { fields: toFirestoreFields(data) }, { headers: await authHeaders() });
  return fromFirestoreDoc(resp.data);
}

export async function updateDoc(path: string, data: Record<string, unknown>, fieldMask: string[]): Promise<Record<string, unknown>> {
  const url = `${getFirestoreBaseUrl()}/${path}`;
  const qs = new URLSearchParams();
  for (const f of fieldMask) qs.append('updateMask.fieldPaths', f);
  const resp = await http.patch(`${url}?${qs}`, { fields: toFirestoreFields(data) }, { headers: await authHeaders() });
  return fromFirestoreDoc(resp.data);
}

export async function deleteDoc(path: string): Promise<void> {
  const url = `${getFirestoreBaseUrl()}/${path}`;
  await http.delete(url, { headers: await authHeaders() });
}

// ── Query ────────────────────────────────────────────────────────────

export interface WhereFilter {
  field: string;
  op: 'EQUAL' | 'NOT_EQUAL' | 'LESS_THAN' | 'LESS_THAN_OR_EQUAL' | 'GREATER_THAN' | 'GREATER_THAN_OR_EQUAL';
  value: unknown;
}

interface OrderByClause {
  field: string;
  direction?: 'ASCENDING' | 'DESCENDING';
}

export interface QueryOptions {
  where?: WhereFilter[];
  orderBy?: OrderByClause[];
  limit?: number;
  startAfter?: unknown[];
}

export async function runQuery(parentPath: string, collectionId: string, opts: QueryOptions): Promise<Record<string, unknown>[]> {
  const base = getFirestoreBaseUrl();
  const url = parentPath ? `${base}/${parentPath}:runQuery` : `${base}:runQuery`;

  const structuredQuery: Record<string, unknown> = {
    from: [{ collectionId }],
  };

  if (opts.where && opts.where.length > 0) {
    if (opts.where.length === 1) {
      const w = opts.where[0];
      structuredQuery.where = {
        fieldFilter: {
          field: { fieldPath: w.field },
          op: w.op,
          value: toValue(w.value),
        },
      };
    } else {
      structuredQuery.where = {
        compositeFilter: {
          op: 'AND',
          filters: opts.where.map((w) => ({
            fieldFilter: {
              field: { fieldPath: w.field },
              op: w.op,
              value: toValue(w.value),
            },
          })),
        },
      };
    }
  }

  if (opts.orderBy && opts.orderBy.length > 0) {
    structuredQuery.orderBy = opts.orderBy.map((o) => ({
      field: { fieldPath: o.field },
      direction: o.direction ?? 'ASCENDING',
    }));
  }

  if (opts.limit) {
    structuredQuery.limit = opts.limit;
  }

  if (opts.startAfter && opts.startAfter.length > 0) {
    structuredQuery.startAt = {
      values: opts.startAfter.map(toValue),
      before: false,
    };
  }

  const headers = await authHeaders();
  const { data } = await http.post(url, { structuredQuery }, { headers });

  // Firestore returns array of { document?, readTime } — filter out empty results
  return (data as { document?: { name: string; fields?: Record<string, FirestoreValue> } }[])
    .filter((r) => r.document)
    .map((r) => fromFirestoreDoc(r.document!));
}

// ── Batch write (commit) ─────────────────────────────────────────────

interface WriteOp {
  update?: {
    name: string;
    fields: Record<string, FirestoreValue>;
  };
  updateMask?: { fieldPaths: string[] };
  updateTransforms?: { fieldPath: string; increment: FirestoreValue }[];
  delete?: string;
}

export interface CommitWrite {
  type: 'update' | 'delete' | 'transform';
  path: string;
  data?: Record<string, unknown>;
  fieldMask?: string[];
  transforms?: { field: string; increment: number }[];
}

export async function commit(writes: CommitWrite[]): Promise<void> {
  const baseUrl = getFirestoreBaseUrl();
  // Commit URL is at database level, not documents level
  const dbUrl = baseUrl.replace('/documents', '');
  const url = `${dbUrl}/documents:commit`;

  // Firestore commit API expects resource names (projects/...), not full URLs
  const toResourceName = (path: string) =>
    `${baseUrl}/${path}`.replace('https://firestore.googleapis.com/v1/', '');

  const ops: WriteOp[] = writes.map((w) => {
    if (w.type === 'delete') {
      return { delete: toResourceName(w.path) };
    }

    const op: WriteOp = {};

    if (w.type === 'update' && w.data) {
      op.update = {
        name: toResourceName(w.path),
        fields: toFirestoreFields(w.data),
      };
      if (w.fieldMask) {
        op.updateMask = { fieldPaths: w.fieldMask };
      }
    }

    if (w.type === 'transform') {
      op.update = {
        name: toResourceName(w.path),
        fields: {},
      };
      op.updateTransforms = (w.transforms ?? []).map((t) => ({
        fieldPath: t.field,
        increment: toValue(t.increment),
      }));
    }

    return op;
  });

  await http.post(url, { writes: ops }, { headers: await authHeaders() });
}
