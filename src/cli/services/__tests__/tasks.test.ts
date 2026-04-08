import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firestore module
vi.mock('../../lib/firestore', () => ({
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  runQuery: vi.fn(),
  commit: vi.fn(),
}));

// Mock streaks module
vi.mock('../../lib/streaks', () => ({
  recordDailyStreak: vi.fn(() => 1),
  revertDailyStreak: vi.fn(),
  removeDailyStreak: vi.fn(),
}));

// Mock validation (pass-through)
vi.mock('../../lib/validation', () => ({
  validateDocId: vi.fn((id: string) => id),
  incrementField: vi.fn(),
}));

// Mock karma (no-op)
vi.mock('../../lib/karma', () => ({
  giveKarma: vi.fn(),
  removeKarma: vi.fn(),
}));

import { createTask, completeTask, listTasks } from '../tasks';
import { getDoc, setDoc, runQuery, commit } from '../../lib/firestore';

const mockSetDoc = vi.mocked(setDoc);
const mockGetDoc = vi.mocked(getDoc);
const mockRunQuery = vi.mocked(runQuery);
const mockCommit = vi.mocked(commit);

const UID = 'test-user-123';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createTask', () => {
  it('creates task with defaults (public, backlog when no date)', async () => {
    mockSetDoc.mockResolvedValue({ id: 'task-1', text: 'Buy milk' });

    const result = await createTask(UID, { text: 'Buy milk' });

    // First setDoc call is the main task creation; subsequent are side effects (karma, ordering)
    expect(mockSetDoc).toHaveBeenCalled();
    const [path, data] = mockSetDoc.mock.calls[0];
    expect(path).toContain(`users/${UID}/tasks/`);
    expect(data.text).toBe('Buy milk');
    expect(data.isPublic).toBe(true);
    expect(data.backlog).toBe(true);
    expect(data.dueDate).toBeNull();
    expect(data.completed).toBe(false);
    expect(result.task).toBeDefined();
    expect(result.karma).toBe(2); // KARMA_POINTS.addTask = 2
  });

  it('creates task with dueDate (not backlog)', async () => {
    mockSetDoc.mockResolvedValue({ id: 'task-2', text: 'Meeting' });

    await createTask(UID, { text: 'Meeting', dueDate: '2026-03-27' });

    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.dueDate).toBe('2026-03-27');
    expect(data.backlog).toBe(false);
  });

  it('creates task with tags and difficulty', async () => {
    mockSetDoc.mockResolvedValue({ id: 'task-3', text: 'Workout' });

    await createTask(UID, { text: 'Workout', tags: ['Health'], difficulty: 2 });

    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.tags).toEqual(['Health']);
    expect(data.difficulty).toBe(2);
  });
});

describe('completeTask (simple)', () => {
  const simpleTask = {
    id: 'task-simple',
    text: 'Buy groceries',
    completed: false,
    completedAt: null,
    completions: 0,
    repeat: { type: 'none', every: null },
    subtasks: [],
    dueDate: '2026-03-26',
    parentTaskId: null,
  };

  it('uses atomic commit with delete + history write', async () => {
    mockGetDoc.mockResolvedValue(simpleTask as any);
    mockCommit.mockResolvedValue(undefined);

    const result = await completeTask(UID, 'task-simple');

    expect(mockCommit).toHaveBeenCalledTimes(1);
    const writes = mockCommit.mock.calls[0][0];

    // Should have exactly 2 writes: delete active + write history
    expect(writes).toHaveLength(2);
    expect(writes[0].type).toBe('delete');
    expect(writes[0].path).toContain('tasks/task-simple');
    expect(writes[1].type).toBe('update');
    expect(writes[1].path).toContain('tasksHistory/task-simple');
    expect(writes[1].data?.completed).toBe(true);
    expect(result.completed).toBe(true);
  });
});

describe('completeTask (recurring)', () => {
  const recurringTask = {
    id: 'task-daily',
    text: 'Workout',
    completed: false,
    completedAt: null,
    completions: 2,
    repeat: { type: 'daily', every: 1 },
    subtasks: [{ id: 's1', text: 'Pushups', completed: true }],
    dueDate: '2026-03-26 00:00',
    parentTaskId: null,
  };

  it('uses atomic commit with update (not delete) + history write', async () => {
    mockGetDoc.mockResolvedValue(recurringTask as any);
    mockCommit.mockResolvedValue(undefined);

    const result = await completeTask(UID, 'task-daily');

    expect(mockCommit).toHaveBeenCalledTimes(1);
    const writes = mockCommit.mock.calls[0][0];

    // Should have exactly 2 writes: update active + write history
    expect(writes).toHaveLength(2);
    expect(writes[0].type).toBe('update');
    expect(writes[0].path).toContain('tasks/task-daily');
    // Should advance dueDate (not same as original)
    expect(writes[0].data?.dueDate).not.toBe('2026-03-26 00:00');
    // Should increment completions
    expect(writes[0].data?.completions).toBe(3);
    // Should reset subtasks
    expect((writes[0].data?.subtasks as any[])[0].completed).toBe(false);

    expect(writes[1].type).toBe('update');
    expect(writes[1].path).toContain('tasksHistory/');
    expect(writes[1].data?.completed).toBe(true);

    expect(result.completed).toBe(true);
  });
});

describe('listTasks', () => {
  it('combines active + history and filters by date', async () => {
    // First runQuery call: active tasks
    // Second runQuery call: history tasks
    mockRunQuery
      .mockResolvedValueOnce([
        { id: 't1', text: 'Task A', dueDate: '2026-03-26 00:00', completed: false, repeat: { type: 'none' }, completedAt: null },
        { id: 't2', text: 'Task B', dueDate: '2026-03-27 00:00', completed: false, repeat: { type: 'none' }, completedAt: null },
      ])
      .mockResolvedValueOnce([
        { id: 't3', text: 'Done C', dueDate: '2026-03-26 00:00', completed: true, completedAt: 1711411200000, repeat: { type: 'none' } },
      ]);

    const result = await listTasks(UID, { date: '2026-03-26' });

    // t2 should be filtered out (different date)
    expect(result.tasks.some((t) => t.id === 't1')).toBe(true);
    expect(result.tasks.some((t) => t.id === 't2')).toBe(false);
    expect(result.tasks.some((t) => t.id === 't3')).toBe(true);
  });

  it('filters by tag', async () => {
    mockRunQuery
      .mockResolvedValueOnce([
        { id: 't1', text: 'Task A', tags: ['Work'], dueDate: '2026-03-26 00:00', completed: false, repeat: { type: 'none' }, completedAt: null },
        { id: 't2', text: 'Task B', tags: ['Health'], dueDate: '2026-03-26 00:00', completed: false, repeat: { type: 'none' }, completedAt: null },
      ])
      .mockResolvedValueOnce([]);

    const result = await listTasks(UID, { date: '2026-03-26', tag: 'Work' });

    expect(result.tasks.some((t) => t.id === 't1')).toBe(true);
    expect(result.tasks.some((t) => t.id === 't2')).toBe(false);
  });
});
