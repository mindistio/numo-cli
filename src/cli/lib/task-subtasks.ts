import { randomUUID } from 'node:crypto';
import type { SubTask } from '../types/api';

/**
 * Build well-formed subtask objects from plain text lines.
 *
 * Both CREATE and UPDATE store the array as sent, so the `randomUUID()` here is
 * the subtask's final id. Note: passing subtasks on `update` REPLACES the whole
 * list (existing completion state is lost).
 *
 * Empty/whitespace-only entries are dropped.
 */
export function buildSubtasks(texts: string[]): SubTask[] {
  return texts
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((text) => ({ id: randomUUID(), text, completed: false }));
}
