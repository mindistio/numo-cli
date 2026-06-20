import { describe, it, expect } from 'vitest';
import { buildSubtasks } from '../task-subtasks';

describe('buildSubtasks', () => {
  it('returns [] for an empty list', () => {
    expect(buildSubtasks([])).toEqual([]);
  });

  it('builds {id, text, completed:false} objects', () => {
    const subs = buildSubtasks(['Buy milk', 'Pay rent']);
    expect(subs).toHaveLength(2);
    for (const s of subs) {
      expect(typeof s.id).toBe('string');
      expect(s.id.length).toBeGreaterThan(0);
      expect(s.completed).toBe(false);
    }
    expect(subs.map((s) => s.text)).toEqual(['Buy milk', 'Pay rent']);
  });

  it('trims and drops empty/whitespace entries', () => {
    expect(buildSubtasks(['  a ', '', '   ', 'b']).map((s) => s.text)).toEqual(['a', 'b']);
  });

  it('generates unique ids', () => {
    const subs = buildSubtasks(['a', 'b', 'c']);
    expect(new Set(subs.map((s) => s.id)).size).toBe(3);
  });
});
