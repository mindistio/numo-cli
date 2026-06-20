import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}));

import { listTasks, getTask, createTask, updateTask, deleteTask, completeTask, uncompleteTask } from '../tasks';
import { api } from '../../lib/api-client';

const mockGet = vi.mocked(api.get);
const mockPost = vi.mocked(api.post);
const mockPatch = vi.mocked(api.patch);
const mockDel = vi.mocked(api.del);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listTasks', () => {
  it('calls GET /api/tasks with query params', async () => {
    mockGet.mockResolvedValue({ tasks: [], count: 0, pendingCount: 0, completedCount: 0 });

    await listTasks({ date: '2024-01-15', tag: 'work' });

    expect(mockGet).toHaveBeenCalledWith('/api/tasks', {
      date: '2024-01-15',
      backlog: undefined,
      tag: 'work',
    });
  });

  it('passes backlog=true', async () => {
    mockGet.mockResolvedValue({ tasks: [], count: 0, pendingCount: 0, completedCount: 0 });

    await listTasks({ backlog: true });

    expect(mockGet).toHaveBeenCalledWith('/api/tasks', {
      date: undefined,
      backlog: 'true',
      tag: undefined,
    });
  });
});

describe('getTask', () => {
  it('calls GET /api/tasks/:id', async () => {
    mockGet.mockResolvedValue({ id: 'task-1', text: 'Buy milk' });

    await getTask('task-1');

    expect(mockGet).toHaveBeenCalledWith('/api/tasks/task-1');
  });
});

describe('createTask', () => {
  it('calls POST /api/tasks with body', async () => {
    mockPost.mockResolvedValue({ task: { id: 'task-1' }, karma: 2 });

    await createTask({ text: 'Buy milk' });

    expect(mockPost).toHaveBeenCalledWith('/api/tasks', { text: 'Buy milk' });
  });
});

describe('updateTask', () => {
  it('calls PATCH /api/tasks/:id', async () => {
    mockPatch.mockResolvedValue({ task: { id: 'task-1', text: 'Updated' } });

    await updateTask('task-1', { text: 'Updated' });

    expect(mockPatch).toHaveBeenCalledWith('/api/tasks/task-1', { text: 'Updated' });
  });
});

describe('deleteTask', () => {
  it('calls DELETE /api/tasks/:id', async () => {
    mockDel.mockResolvedValue({ deleted: true });

    await deleteTask('task-1');

    expect(mockDel).toHaveBeenCalledWith('/api/tasks/task-1');
  });
});

describe('completeTask', () => {
  it('calls POST /api/tasks/:id/complete', async () => {
    mockPost.mockResolvedValue({ completed: true, karma: 5 });

    await completeTask('task-1');

    expect(mockPost).toHaveBeenCalledWith('/api/tasks/task-1/complete', undefined);
  });

  it('passes date when provided', async () => {
    mockPost.mockResolvedValue({ completed: true, karma: 5 });

    await completeTask('task-1', '2024-01-15');

    expect(mockPost).toHaveBeenCalledWith('/api/tasks/task-1/complete', { date: '2024-01-15' });
  });
});

describe('uncompleteTask', () => {
  it('calls POST /api/tasks/:id/uncomplete', async () => {
    mockPost.mockResolvedValue({ uncompleted: true });

    await uncompleteTask('history-1');

    expect(mockPost).toHaveBeenCalledWith('/api/tasks/history-1/uncomplete');
  });
});
