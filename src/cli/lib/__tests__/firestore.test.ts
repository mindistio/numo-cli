import { describe, it, expect, vi } from 'vitest';

// Mock modules that firestore.ts imports but our tests don't use
vi.mock('../http', () => ({ http: {} }));
vi.mock('../../auth/credentials', () => ({ getIdToken: vi.fn() }));
vi.mock('../config', () => ({ getFirestoreBaseUrl: () => 'https://example.com/documents' }));

import { toFirestoreFields, fromFirestoreDoc } from '../firestore';

describe('toFirestoreFields', () => {
  it('serializes string', () => {
    expect(toFirestoreFields({ name: 'test' })).toEqual({
      name: { stringValue: 'test' },
    });
  });

  it('serializes integer', () => {
    expect(toFirestoreFields({ count: 42 })).toEqual({
      count: { integerValue: '42' },
    });
  });

  it('serializes double (non-integer number)', () => {
    expect(toFirestoreFields({ score: 3.14 })).toEqual({
      score: { doubleValue: 3.14 },
    });
  });

  it('serializes boolean', () => {
    expect(toFirestoreFields({ done: true, active: false })).toEqual({
      done: { booleanValue: true },
      active: { booleanValue: false },
    });
  });

  it('serializes null', () => {
    expect(toFirestoreFields({ nothing: null })).toEqual({
      nothing: { nullValue: null },
    });
  });

  it('serializes undefined as null', () => {
    expect(toFirestoreFields({ missing: undefined })).toEqual({
      missing: { nullValue: null },
    });
  });

  it('serializes array of strings', () => {
    expect(toFirestoreFields({ tags: ['a', 'b'] })).toEqual({
      tags: { arrayValue: { values: [{ stringValue: 'a' }, { stringValue: 'b' }] } },
    });
  });

  it('serializes empty array', () => {
    expect(toFirestoreFields({ tags: [] })).toEqual({
      tags: { arrayValue: { values: [] } },
    });
  });

  it('serializes nested object as mapValue', () => {
    const result = toFirestoreFields({ repeat: { type: 'daily', every: 1 } });
    expect(result.repeat).toEqual({
      mapValue: {
        fields: {
          type: { stringValue: 'daily' },
          every: { integerValue: '1' },
        },
      },
    });
  });

  it('serializes mixed-type array', () => {
    const result = toFirestoreFields({ items: ['text', 42, true, null] });
    expect(result.items).toEqual({
      arrayValue: {
        values: [
          { stringValue: 'text' },
          { integerValue: '42' },
          { booleanValue: true },
          { nullValue: null },
        ],
      },
    });
  });
});

describe('fromFirestoreDoc', () => {
  it('extracts ID from document name', () => {
    const doc = {
      name: 'projects/proj/databases/(default)/documents/users/uid/tasks/abc123',
      fields: { text: { stringValue: 'hello' } as any },
    };
    const result = fromFirestoreDoc(doc);
    expect(result.id).toBe('abc123');
    expect(result.text).toBe('hello');
  });

  it('handles document with no fields', () => {
    const doc = { name: 'projects/proj/databases/(default)/documents/col/doc1' };
    const result = fromFirestoreDoc(doc);
    expect(result).toEqual({ id: 'doc1' });
  });

  it('deserializes all value types', () => {
    const doc = {
      name: 'projects/proj/databases/(default)/documents/col/doc1',
      fields: {
        text: { stringValue: 'hello' },
        count: { integerValue: '42' },
        score: { doubleValue: 3.14 },
        done: { booleanValue: true },
        nothing: { nullValue: null },
        tags: { arrayValue: { values: [{ stringValue: 'a' }, { stringValue: 'b' }] } },
        meta: { mapValue: { fields: { nested: { stringValue: 'value' } } } },
      } as any,
    };
    const result = fromFirestoreDoc(doc);
    expect(result.id).toBe('doc1');
    expect(result.text).toBe('hello');
    expect(result.count).toBe(42);
    expect(result.score).toBe(3.14);
    expect(result.done).toBe(true);
    expect(result.nothing).toBeNull();
    expect(result.tags).toEqual(['a', 'b']);
    expect(result.meta).toEqual({ nested: 'value' });
  });

  it('handles empty arrayValue (no values key)', () => {
    const doc = {
      name: 'projects/proj/databases/(default)/documents/col/doc1',
      fields: { tags: { arrayValue: {} } as any },
    };
    const result = fromFirestoreDoc(doc);
    expect(result.tags).toEqual([]);
  });
});

describe('round-trip serialization', () => {
  it('round-trips a complex task-like object', () => {
    const original = {
      text: 'Buy groceries',
      completed: false,
      dueDate: '2026-01-15 00:00',
      tags: ['House', 'Errands'],
      priority: 0.5,
      difficulty: 2,
      duration: 30,
      note: '',
      backlog: false,
      completions: 0,
      repeat: { type: 'none', every: null },
      subtasks: [],
    };

    const fields = toFirestoreFields(original);
    const doc = {
      name: 'projects/p/databases/(default)/documents/users/uid/tasks/task1',
      fields,
    };
    const result = fromFirestoreDoc(doc);

    expect(result.id).toBe('task1');
    for (const key of Object.keys(original)) {
      expect(result[key]).toEqual((original as any)[key]);
    }
  });

  it('round-trips nested objects', () => {
    const original = {
      repeat: { type: 'weekly', every: 2, weekDays: ['Mon', 'Fri'], end: null },
    };
    const fields = toFirestoreFields(original);
    const doc = { name: 'projects/p/databases/(default)/documents/col/doc', fields };
    const result = fromFirestoreDoc(doc);
    expect(result.repeat).toEqual(original.repeat);
  });
});
