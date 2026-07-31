import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}));

import { listTasks, completeTask } from '../tasks';
import { api } from '../../lib/api-client';

const mockGet = vi.mocked(api.get);
const mockPost = vi.mocked(api.post);

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
