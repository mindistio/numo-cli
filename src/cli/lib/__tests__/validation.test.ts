import { describe, it, expect } from 'vitest';
import { validateDocId } from '../validation';

describe('validateDocId', () => {
  // ── Valid IDs ─────────────────────────────────────────────────────
  it('accepts simple alphanumeric IDs', () => {
    expect(validateDocId('abc123')).toBe('abc123');
  });

  it('accepts IDs with hyphens and underscores', () => {
    expect(validateDocId('my-task_123')).toBe('my-task_123');
  });

  it('accepts typical numo task IDs', () => {
    const id = 'simple_buy-groc_2026-03-26-00-00_87654321abcdefg';
    expect(validateDocId(id)).toBe(id);
  });

  it('trims whitespace', () => {
    expect(validateDocId('  abc123  ')).toBe('abc123');
  });

  it('accepts IDs at exactly 1500 characters', () => {
    const maxId = 'a'.repeat(1500);
    expect(validateDocId(maxId)).toBe(maxId);
  });

  it('allows IDs that start with __ but do not end with __', () => {
    expect(validateDocId('__prefix')).toBe('__prefix');
  });

  // ── Path traversal ────────────────────────────────────────────────
  it('rejects IDs containing forward slash', () => {
    expect(() => validateDocId('../../secrets')).toThrow("cannot contain '/'");
  });

  it('rejects IDs with embedded slashes', () => {
    expect(() => validateDocId('tasks/other')).toThrow("cannot contain '/'");
  });

  // ── Dot traversal ────────────────────────────────────────────────
  it('rejects dot-dot', () => {
    expect(() => validateDocId('..')).toThrow("cannot be '.' or '..'");
  });

  it('rejects single dot', () => {
    expect(() => validateDocId('.')).toThrow("cannot be '.' or '..'");
  });

  // ── Empty / missing ──────────────────────────────────────────────
  it('rejects empty string', () => {
    expect(() => validateDocId('')).toThrow('is required');
  });

  it('rejects whitespace-only string', () => {
    expect(() => validateDocId('   ')).toThrow('cannot be empty');
  });

  it('rejects null/undefined', () => {
    expect(() => validateDocId(null as any)).toThrow('is required');
    expect(() => validateDocId(undefined as any)).toThrow('is required');
  });

  // ── Too long ─────────────────────────────────────────────────────
  it('rejects IDs over 1500 characters', () => {
    expect(() => validateDocId('a'.repeat(1501))).toThrow('too long');
  });

  // ── Firestore reserved ───────────────────────────────────────────
  it('rejects double-underscore wrapped IDs', () => {
    expect(() => validateDocId('__reserved__')).toThrow('reserved');
  });

  // ── Custom label ─────────────────────────────────────────────────
  it('uses custom label in error messages', () => {
    expect(() => validateDocId('', 'Task ID')).toThrow('Task ID is required');
  });
});
