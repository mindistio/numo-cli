import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}));

import { listTasks, completeTask, restoreTask, skipOccurrence, unskipOccurrence, uncompleteOccurrence } from '../tasks';
import { api } from '../../lib/api-client';

const mockGet = vi.mocked(api.get);
const mockPost = vi.mocked(api.post);
const mockDel = vi.mocked(api.del);

beforeEach(() => {
  vi.clearAllMocks();
});

// The task service functions are one-line passthroughs to api.*; only the two calls
// that actually transform their arguments are worth covering.

describe('listTasks', () => {
  it('maps backlog:true to the string "true" query param', async () => {
    mockGet.mockResolvedValue({ tasks: [], count: 0, pendingCount: 0, completedCount: 0 });

    await listTasks({ backlog: true });

    expect(mockGet).toHaveBeenCalledWith('/api/tasks', {
      date: undefined,
      backlog: 'true',
      tag: undefined,
    });
  });
});

describe('completeTask', () => {
  it('omits the body when no date is given', async () => {
    mockPost.mockResolvedValue({ completed: true, karma: 5 });

    await completeTask('task-1');

    expect(mockPost).toHaveBeenCalledWith('/api/tasks/task-1/complete', undefined);
  });

  it('wraps a provided date as { date }', async () => {
    mockPost.mockResolvedValue({ completed: true, karma: 5 });

    await completeTask('task-1', '2024-01-15');

    expect(mockPost).toHaveBeenCalledWith('/api/tasks/task-1/complete', { date: '2024-01-15' });
  });
});

// Contract: each routine-day action reaches its own route, with the id escaped.
describe('routine day and restore routes', () => {
  it('restoreTask posts to the restore route', async () => {
    await restoreTask('a/b');
    expect(mockPost).toHaveBeenCalledWith('/api/tasks/a%2Fb/restore');
  });

  it('skipOccurrence posts and unskipOccurrence deletes the same day', async () => {
    await skipOccurrence('r1', '2026-03-26');
    await unskipOccurrence('r1', '2026-03-26');
    expect(mockPost).toHaveBeenCalledWith('/api/tasks/r1/occurrences/2026-03-26/skip');
    expect(mockDel).toHaveBeenCalledWith('/api/tasks/r1/occurrences/2026-03-26/skip');
  });

  it('uncompleteOccurrence posts to that day', async () => {
    await uncompleteOccurrence('r1', '2026-03-26');
    expect(mockPost).toHaveBeenCalledWith('/api/tasks/r1/occurrences/2026-03-26/uncomplete');
  });
});
