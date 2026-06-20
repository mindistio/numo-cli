import { randomUUID } from 'node:crypto';
import type { SubTask } from '../types/api';

/**
 * Build well-formed subtask objects from plain text lines.
 *
 * The API treats subtasks differently per route:
 *  - CREATE regenerates {id, completed} and uses only `text`.
 *  - UPDATE stores the array verbatim.
 * Emitting {id, text, completed:false} is therefore correct for both: create
 * ignores the id, update keeps the shape valid. Note: passing subtasks on
 * `update` REPLACES the whole list (existing completion state is lost).
 *
 * Empty/whitespace-only entries are dropped.
 */
export function buildSubtasks(texts: string[]): SubTask[] {
  return texts
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((text) => ({ id: randomUUID(), text, completed: false }));
}
