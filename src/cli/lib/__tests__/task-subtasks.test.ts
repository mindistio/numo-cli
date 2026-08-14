import { describe, it, expect } from 'vitest';
import { buildSubtasks } from '../task-subtasks';

describe('buildSubtasks', () => {
  // No empty-list case: [].map().filter().map() is a language guarantee with no branch
  // of ours in it, and every caller is length-guarded before it gets here.

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
