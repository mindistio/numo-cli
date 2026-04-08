import * as crypto from 'crypto';
import { ITask, IRoutineStreak, WeekDay, MAX_TASKS_PER_REQUEST, KARMA_POINTS, DIFFICULTY_BONUS, MAX_KARMA_PER_COMPLETE } from '../../shared';
import { getDoc, setDoc, updateDoc, deleteDoc, runQuery, commit, CommitWrite } from '../lib/firestore';
import { recordDailyStreak, revertDailyStreak, removeDailyStreak } from '../lib/streaks';
import { validateDocId, incrementField } from '../lib/validation';
import { giveKarma, removeKarma } from '../lib/karma';

// ── Date helpers ──────────────────────────────────────────────────────

const WEEKDAY_MAP: Record<WeekDay, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function parseDate(s: string): Date {
  const [datePart, timePart] = s.split(' ');
  const [y, m, d] = datePart.split('-').map(Number);
  if (timePart) {
    const [h, min] = timePart.split(':').map(Number);
    return new Date(y, m - 1, d, h, min);
  }
  return new Date(y, m - 1, d, 0, 0);
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function endOfDay(dateStr: string): string {
  return dateStr.slice(0, 10) + ' 23:59';
}

function todayFormatted(): string {
  return formatDate(startOfDay(new Date()));
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDayDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

function diffDays(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

function diffWeeks(a: Date, b: Date): number {
  return Math.floor(diffDays(a, b) / 7);
}

function diffMonths(a: Date, b: Date): number {
  return (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
}

function getClosestNextWeekDay(baseDate: Date, weekDays: WeekDay[]): Date {
  const dayNums = new Set(weekDays.map((d) => WEEKDAY_MAP[d]));
  for (let offset = 1; offset <= 7; offset++) {
    const candidate = addDays(baseDate, offset);
    if (dayNums.has(candidate.getDay())) {
      candidate.setHours(baseDate.getHours(), baseDate.getMinutes(), 0, 0);
      return candidate;
    }
  }
  return addDays(baseDate, 7);
}

function getFarthestPrevWeekDay(baseDate: Date, weekDays: WeekDay[], timeSource: Date): Date {
  const dayNums = new Set(weekDays.map((d) => WEEKDAY_MAP[d]));
  for (let offset = 0; offset <= 6; offset++) {
    const candidate = addDays(baseDate, -offset);
    if (dayNums.has(candidate.getDay())) {
      candidate.setHours(timeSource.getHours(), timeSource.getMinutes(), 0, 0);
      return candidate;
    }
  }
  return baseDate;
}

// ── Task logic ────────────────────────────────────────────────────────

function isRepeating(task: ITask): boolean {
  return task.repeat?.type !== 'none';
}

function getTaskRemindDate(task: Partial<ITask>): string | null {
  if (!task.dueDate || task.completed) return null;
  const d = parseDate(task.dueDate);
  if (d.getHours() === 0 && d.getMinutes() === 0) return null;
  const utcY = d.getUTCFullYear();
  const utcM = String(d.getUTCMonth() + 1).padStart(2, '0');
  const utcD = String(d.getUTCDate()).padStart(2, '0');
  const utcH = String(d.getUTCHours()).padStart(2, '0');
  const utcMin = String(d.getUTCMinutes()).padStart(2, '0');
  return `${utcY}-${utcM}-${utcD} ${utcH}:${utcMin}`;
}

function getNextDueDate(task: ITask): string | null {
  if (!task.dueDate) return todayFormatted();
  const { repeat } = task;
  const every = repeat.every ?? 1;
  const now = endOfDayDate(new Date());
  let nextDate = parseDate(task.dueDate);

  const calculatePeriods = (diffFn: (a: Date, b: Date) => number) => {
    const diff = diffFn(now, nextDate);
    const passedPeriods = Math.max(0, Math.floor(diff / every));
    return (passedPeriods + 1) * every;
  };

  if (repeat.type === 'daily') {
    nextDate = addDays(nextDate, calculatePeriods(diffDays));
  } else if (repeat.type === 'weekly') {
    if (repeat.weekDays && repeat.weekDays.length > 0) {
      const closestNext = getClosestNextWeekDay(parseDate(task.dueDate), repeat.weekDays);
      if (now < closestNext) {
        nextDate = closestNext;
      } else {
        const periods = calculatePeriods(diffWeeks);
        const advanced = addDays(nextDate, periods * 7);
        const dayDiff = (closestNext.getDay() - advanced.getDay() + 7) % 7;
        nextDate = addDays(advanced, dayDiff);
        nextDate.setHours(parseDate(task.dueDate).getHours(), parseDate(task.dueDate).getMinutes(), 0, 0);
      }
    } else {
      nextDate = addDays(nextDate, calculatePeriods(diffWeeks) * 7);
    }
  } else if (repeat.type === 'monthly') {
    nextDate = addMonths(nextDate, calculatePeriods(diffMonths));
  }

  return formatDate(nextDate);
}

function getPreviousDueDate(task: ITask): string | null {
  if (!task.dueDate) return null;
  const { repeat } = task;
  const every = repeat.every ?? 1;
  const dueDate = parseDate(task.dueDate);
  const now = endOfDayDate(new Date());

  if (repeat.type === 'daily') {
    return formatDate(addDays(dueDate, -every));
  }

  if (repeat.type === 'weekly') {
    if (repeat.weekDays && repeat.weekDays.length > 0) {
      const closestPrev = getFarthestPrevWeekDay(new Date(), repeat.weekDays, dueDate);
      if (now > closestPrev) {
        return formatDate(closestPrev);
      } else {
        const base = addDays(dueDate, -every * 7);
        const dayDiff = (closestPrev.getDay() - base.getDay() + 7) % 7;
        const result = addDays(base, dayDiff);
        result.setHours(dueDate.getHours(), dueDate.getMinutes(), 0, 0);
        return formatDate(result);
      }
    }
    return formatDate(addDays(dueDate, -every * 7));
  }

  if (repeat.type === 'monthly') {
    return formatDate(addMonths(dueDate, -every));
  }

  return task.dueDate;
}

// ── Service methods ──────────────────────────────────────────────────

function tasksPath(uid: string): string {
  return `users/${uid}/tasks`;
}

function taskPath(uid: string, id: string): string {
  return `users/${uid}/tasks/${id}`;
}

function tasksHistoryPath(uid: string): string {
  return `users/${uid}/tasksHistory`;
}

function taskHistoryPath(uid: string, id: string): string {
  return `users/${uid}/tasksHistory/${id}`;
}

function orderingPath(uid: string): string {
  return `users/${uid}/order/tasks`;
}

function progressPath(uid: string, date: string): string {
  return `users/${uid}/progress/${date}`;
}

function routineStreakPath(uid: string, taskId: string): string {
  return `users/${uid}/routineStreaks/${taskId}`;
}

function archivePath(uid: string, taskId: string): string {
  return `archive/${uid}/tasks/${taskId}`;
}

function archiveCounterPath(uid: string): string {
  return `archive/${uid}`;
}

function activityTotalsPath(uid: string): string {
  return `users/${uid}/activity/totals`;
}

// ── ID Generation ────────────────────────────────────────────────────

function reversedTimestamp(len: number): string {
  const maxTs = 9999999999999; // 13-digit max timestamp
  const reversed = String(maxTs - Date.now());
  return reversed.slice(0, len);
}

function randomAlphanumeric(len: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const limit = 252; // 252 = 36 * 7 → largest multiple of 36 that fits in a byte, eliminates modulo bias
  let result = '';
  while (result.length < len) {
    const bytes = crypto.randomBytes(len - result.length);
    for (let i = 0; i < bytes.length && result.length < len; i++) {
      if (bytes[i] < limit) result += chars[bytes[i] % chars.length];
    }
  }
  return result;
}

function generateTaskId(task: Record<string, unknown>): string {
  const repeatType = (task.repeat as any)?.type === 'none' ? 'simple' : (task.repeat as any)?.type;
  const textSlug = String(task.text ?? '').slice(0, 8).toLowerCase().replace(/[^a-z0-9]/g, '-');
  const uniquePart = reversedTimestamp(8) + randomAlphanumeric(7);
  if (!task.dueDate) return `${repeatType}_${textSlug}_${uniquePart}`;
  const dateSlug = String(task.dueDate).replace(/[^a-z0-9]/g, '-');
  return `${repeatType}_${textSlug}_${dateSlug}_${uniquePart}`;
}

// ── Side-effect helpers ──────────────────────────────────────────────

/** Log non-critical side-effect failures to stderr for observability. */
function logSideEffectResults(label: string, results: PromiseSettledResult<unknown>[]): void {
  for (const r of results) {
    if (r.status === 'rejected') {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      process.stderr.write(`[warn] ${label}: ${msg}\n`);
    }
  }
}

async function addToOrdering(uid: string, taskId: string, position: 'start' | 'end' = 'end'): Promise<void> {
  let ordering: string[] = [];
  try {
    const doc = await getDoc(orderingPath(uid));
    if (Array.isArray(doc.tasksListOrdering)) ordering = doc.tasksListOrdering as string[];
  } catch { /* doc may not exist yet */ }

  if (!ordering.includes(taskId)) {
    if (position === 'start') ordering.unshift(taskId);
    else ordering.push(taskId);
  }
  await updateDoc(orderingPath(uid), { tasksListOrdering: ordering }, ['tasksListOrdering']);
}

async function removeFromOrdering(uid: string, taskId: string): Promise<void> {
  try {
    const doc = await getDoc(orderingPath(uid));
    if (Array.isArray(doc.tasksListOrdering)) {
      const ordering = (doc.tasksListOrdering as string[]).filter((id) => id !== taskId);
      await updateDoc(orderingPath(uid), { tasksListOrdering: ordering }, ['tasksListOrdering']);
    }
  } catch { /* doc may not exist */ }
}

async function addToProgress(uid: string, taskId: string, date: string): Promise<void> {
  const dateKey = date.slice(0, 10); // YYYY-MM-DD
  let tasks: string[] = [];
  try {
    const doc = await getDoc(progressPath(uid, dateKey));
    if (Array.isArray(doc.tasks)) tasks = doc.tasks as string[];
  } catch { /* doc may not exist yet */ }

  if (!tasks.includes(taskId)) tasks.push(taskId);
  await setDoc(progressPath(uid, dateKey), { tasks });
}

async function removeFromProgress(uid: string, taskId: string, date: string): Promise<void> {
  const dateKey = date.slice(0, 10);
  try {
    const doc = await getDoc(progressPath(uid, dateKey));
    if (Array.isArray(doc.tasks)) {
      const tasks = (doc.tasks as string[]).filter((id) => id !== taskId);
      await setDoc(progressPath(uid, dateKey), { tasks });
    }
  } catch { /* doc may not exist */ }
}

async function recordRoutineStreak(uid: string, taskId: string): Promise<void> {
  let streak: Partial<IRoutineStreak> = {};
  try {
    streak = await getDoc(routineStreakPath(uid, taskId)) as unknown as Partial<IRoutineStreak>;
  } catch { /* first time */ }

  const newStreak = (streak.streak ?? 0) + 1;
  const longestStreak = Math.max(streak.longestStreak ?? 0, newStreak);
  await setDoc(routineStreakPath(uid, taskId), {
    taskId,
    userId: uid,
    streak: newStreak,
    longestStreak,
    lastCompletedAt: Date.now(),
  });
}

async function revertRoutineStreak(uid: string, taskId: string): Promise<void> {
  try {
    const doc = await getDoc(routineStreakPath(uid, taskId)) as unknown as IRoutineStreak;
    const newStreak = Math.max(0, (doc.streak ?? 0) - 1);
    await setDoc(routineStreakPath(uid, taskId), {
      ...doc,
      streak: newStreak,
      lastCompletedAt: newStreak > 0 ? doc.lastCompletedAt : null,
    } as unknown as Record<string, unknown>);
  } catch { /* may not exist */ }
}

async function deleteRoutineStreak(uid: string, taskId: string): Promise<void> {
  try { await deleteDoc(routineStreakPath(uid, taskId)); } catch { /* may not exist */ }
}

async function archiveTask(uid: string, taskId: string, taskData: Record<string, unknown>): Promise<void> {
  await setDoc(archivePath(uid, taskId), {
    ...taskData,
    archived: true,
    archivedAt: Date.now(),
  });
}

function computeCompleteKarma(task: ITask, checksInRow: number): number {
  const difficultyIdx = task.difficulty ?? 0;
  const bonus = DIFFICULTY_BONUS[difficultyIdx] ?? 0;
  const raw = (KARMA_POINTS.completeTask + bonus) * checksInRow;
  return Math.min(raw, MAX_KARMA_PER_COMPLETE);
}

export async function listTasks(uid: string, opts: { date?: string; backlog?: boolean; tag?: string }): Promise<{ tasks: Record<string, unknown>[]; count: number; pendingCount: number; completedCount: number }> {
  // Fetch active tasks and history, filter client-side to avoid composite index requirements
  const [activeTasks, historyTasks] = await Promise.all([
    runQuery(`users/${uid}`, 'tasks', { where: [], limit: MAX_TASKS_PER_REQUEST }),
    opts.backlog ? Promise.resolve([]) : runQuery(`users/${uid}`, 'tasksHistory', { where: [], limit: MAX_TASKS_PER_REQUEST }),
  ]);

  let pending = activeTasks;
  let completed = historyTasks;

  if (opts.backlog) {
    pending = pending.filter((t) => t.backlog === true);
  } else if (opts.date) {
    const today = new Date().toISOString().slice(0, 10);
    const isToday = opts.date === today;
    if (isToday) {
      // Today: show tasks due today + overdue
      const cutoff = endOfDay(opts.date);
      pending = pending.filter((t) => typeof t.dueDate === 'string' && t.dueDate <= cutoff);
    } else {
      // Other days: strict date match only
      pending = pending.filter((t) => typeof t.dueDate === 'string' && (t.dueDate as string).slice(0, 10) === opts.date);
    }
    completed = completed.filter((t) => {
      if (typeof t.dueDate !== 'string') return false;
      return t.dueDate.slice(0, 10) === opts.date;
    });
  }

  const applyTag = (items: Record<string, unknown>[]) =>
    opts.tag ? items.filter((t) => Array.isArray(t.tags) && (t.tags as string[]).includes(opts.tag!)) : items;

  // Mark history items so display can distinguish them
  completed.forEach((t) => { t.completed = true; });

  const filteredPending = applyTag(pending);
  const filteredCompleted = applyTag(completed);
  const allTasks = [...filteredPending, ...filteredCompleted];
  return { tasks: allTasks, count: allTasks.length, pendingCount: filteredPending.length, completedCount: filteredCompleted.length };
}

export async function getTask(uid: string, id: string): Promise<Record<string, unknown>> {
  validateDocId(id, 'Task ID');
  return getDoc(taskPath(uid, id));
}

export async function createTask(uid: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const now = Date.now();
  const dueDate = (body.dueDate as string) ?? null;
  const taskData: Record<string, unknown> = {
    text: body.text,
    userId: uid,
    isPublic: body.isPublic ?? true,
    completed: false,
    completedAt: null,
    createdAt: now,
    dueDate,
    remindDate: null,
    tags: Array.isArray(body.tags) ? body.tags : [],
    note: (body.note as string) ?? '',
    priority: typeof body.priority === 'number' ? body.priority : 0.0,
    difficulty: body.difficulty ?? null,
    duration: typeof body.duration === 'number' ? body.duration : 10,
    backlog: dueDate == null,
    parentTaskId: null,
    completions: 0,
    repeat: body.repeat ?? { type: 'none', every: null, end: null, endDate: null, endAfter: null, monthDays: null, weekDays: null },
    subtasks: Array.isArray(body.subtasks) ? body.subtasks.map((s: any) => ({ id: crypto.randomUUID(), text: s.text, completed: false })) : [],
    withTime: dueDate != null && !/\b00:00$/.test(dueDate),
    listPosition: null,
  };

  taskData.remindDate = getTaskRemindDate(taskData as any);

  const taskId = generateTaskId(taskData);
  const doc = await setDoc(taskPath(uid, taskId), taskData);

  // Side effects: karma + ordering + activity (fire-and-forget style, don't block on errors)
  const createResults = await Promise.allSettled([
    giveKarma(uid, 'addTask', taskId, KARMA_POINTS.addTask, String(taskData.text)),
    addToOrdering(uid, taskId, 'end'),
    incrementField(activityTotalsPath(uid), 'tasks.active', 1),
  ]);
  logSideEffectResults('createTask', createResults);

  return { task: doc, karma: KARMA_POINTS.addTask };
}

export async function updateTask(uid: string, id: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  validateDocId(id, 'Task ID');
  const allowed = ['text', 'isPublic', 'dueDate', 'tags', 'note', 'priority', 'difficulty', 'duration', 'repeat', 'subtasks'];
  const update: Record<string, unknown> = {};
  const fieldMask: string[] = [];
  for (const key of allowed) {
    if (key in body) {
      update[key] = body[key];
      fieldMask.push(key);
    }
  }

  // If dueDate changed, update backlog flag and ordering
  if ('dueDate' in update) {
    const newDueDate = update.dueDate as string | null;
    update.backlog = newDueDate == null;
    if (!fieldMask.includes('backlog')) fieldMask.push('backlog');
  }

  await updateDoc(taskPath(uid, id), update, fieldMask);

  // Update ordering if dueDate was changed (task may move between backlog/dated)
  if ('dueDate' in body) {
    // Ensure task is in ordering (re-add is a no-op if already present)
    await addToOrdering(uid, id, 'end');
  }

  // Re-read, recalculate remindDate if needed, return final state
  const updated = await getDoc(taskPath(uid, id)) as unknown as ITask;
  const recalculatedRemindDate = getTaskRemindDate(updated);
  if (updated.remindDate !== recalculatedRemindDate) {
    await updateDoc(taskPath(uid, id), { remindDate: recalculatedRemindDate }, ['remindDate']);
    const final = await getDoc(taskPath(uid, id));
    return { task: final };
  }

  return { task: updated as unknown as Record<string, unknown> };
}

export async function deleteTask(uid: string, id: string): Promise<Record<string, unknown>> {
  validateDocId(id, 'Task ID');

  // Read task before deletion for archiving
  let taskData: Record<string, unknown> = {};
  try { taskData = await getDoc(taskPath(uid, id)); } catch { /* proceed anyway */ }

  const hasData = Object.keys(taskData).length > 0;

  // ATOMIC: delete task + create archive + increment counter (if we have data to archive)
  const writes: CommitWrite[] = [
    { type: 'delete', path: taskPath(uid, id) },
  ];
  if (hasData) {
    writes.push({
      type: 'update',
      path: archivePath(uid, id),
      data: { ...taskData, archived: true, archivedAt: Date.now() },
    });
    writes.push({
      type: 'transform',
      path: archiveCounterPath(uid),
      transforms: [{ field: 'archivedTasksCount', increment: 1 }],
    });
  }
  await commit(writes);

  // Non-critical: delete associated history records
  try {
    const historyDocs = await runQuery(`users/${uid}`, 'tasksHistory', {
      where: [{ field: 'parentTaskId', op: 'EQUAL', value: id }],
      limit: MAX_TASKS_PER_REQUEST,
    });
    const historyResults = await Promise.allSettled(historyDocs.map((h) => deleteDoc(taskHistoryPath(uid, h.id as string))));
    logSideEffectResults('deleteTask.history', historyResults);
  } catch (err) {
    process.stderr.write(`[warn] deleteTask.history: ${err instanceof Error ? err.message : String(err)}\n`);
  }

  // Non-critical side effects
  const deleteResults = await Promise.allSettled([
    removeFromOrdering(uid, id),
    deleteRoutineStreak(uid, id),
    incrementField(activityTotalsPath(uid), 'tasks.active', -1),
  ]);
  logSideEffectResults('deleteTask', deleteResults);
  removeDailyStreak(id);

  return { deleted: true, taskText: String(taskData.text ?? ''), archived: hasData };
}

export async function completeTask(uid: string, id: string, date?: string): Promise<Record<string, unknown>> {
  validateDocId(id, 'Task ID');
  const task = await getDoc(taskPath(uid, id)) as unknown as ITask;
  const completedAt = date ? new Date(date).getTime() : Date.now();
  const repeating = isRepeating(task);

  // Generate history record (matches iOS: generateTaskHistory)
  const historyId = repeating ? `${id}-${completedAt}` : id;
  const historyData: Record<string, unknown> = {
    ...(task as unknown as Record<string, unknown>),
    id: historyId,
    completedAt,
    completed: true,
    parentTaskId: id,
    isHistoryTask: true,
    completions: (task.completions ?? 0) + 1,
    remindDate: null,
  };
  delete historyData.id;

  // Build atomic writes
  const writes: CommitWrite[] = [];

  if (repeating) {
    const nextDueDate = getNextDueDate(task);
    const resetSubtasks = (task.subtasks ?? []).map((s: any) => ({ ...s, completed: false }));
    const updatedData: Record<string, unknown> = {
      dueDate: nextDueDate,
      completions: (task.completions ?? 0) + 1,
      completedAt,
      subtasks: resetSubtasks,
    };
    writes.push({
      type: 'update',
      path: taskPath(uid, id),
      data: updatedData,
      fieldMask: Object.keys(updatedData),
    });
  } else {
    writes.push({ type: 'delete', path: taskPath(uid, id) });
  }

  // Write history record
  writes.push({
    type: 'update',
    path: taskHistoryPath(uid, historyId),
    data: historyData,
  });

  // ATOMIC: active task change + history write happen together or not at all
  await commit(writes);

  // Non-critical: recalculate remindDate for repeating tasks
  if (repeating) {
    try {
      const afterUpdate = await getDoc(taskPath(uid, id)) as unknown as ITask;
      await updateDoc(taskPath(uid, id), { remindDate: getTaskRemindDate(afterUpdate) }, ['remindDate']);
    } catch { /* non-critical */ }
  }

  // Side effects (fire-and-forget)
  const completeDateStr = date ?? formatDate(new Date());
  const entityId = repeating ? `${id}_${completeDateStr.slice(0, 10)}` : id;
  const checksInRow = recordDailyStreak(id, completeDateStr);
  const karmaPoints = computeCompleteKarma(task, checksInRow);

  const sideEffects: Promise<unknown>[] = [
    giveKarma(uid, 'completeTask', entityId, karmaPoints, task.text),
    addToProgress(uid, id, completeDateStr),
    incrementField(activityTotalsPath(uid), 'tasks.completed', 1),
  ];

  if (repeating) {
    sideEffects.push(recordRoutineStreak(uid, id));
  } else {
    sideEffects.push(removeFromOrdering(uid, id));
    sideEffects.push(incrementField(activityTotalsPath(uid), 'tasks.active', -1));
  }

  const completeResults = await Promise.allSettled(sideEffects);
  logSideEffectResults('completeTask', completeResults);

  return { completed: true, taskHistory: historyData, karma: karmaPoints, checksInRow, taskText: task.text };
}

export async function uncompleteTask(uid: string, taskHistoryId: string): Promise<Record<string, unknown>> {
  validateDocId(taskHistoryId, 'Task history ID');

  const history = await getDoc(taskHistoryPath(uid, taskHistoryId)) as unknown as ITask;
  const parentTaskId = history.parentTaskId;
  if (!parentTaskId) throw new Error('Not a history record');

  const repeating = isRepeating(history);

  // Build restored task data
  const restoredTask: Record<string, unknown> = {
    ...(history as unknown as Record<string, unknown>),
    completed: false,
    completedAt: null,
    completions: Math.max(0, (history.completions ?? 0) - 1),
  };
  delete restoredTask.isHistoryTask;
  delete restoredTask.id;
  restoredTask.parentTaskId = null;
  if (repeating) {
    restoredTask.dueDate = history.dueDate;
  }

  // ATOMIC: write active task + delete history record
  const writes: CommitWrite[] = [
    { type: 'update', path: taskPath(uid, parentTaskId), data: restoredTask },
    { type: 'delete', path: taskHistoryPath(uid, taskHistoryId) },
  ];
  await commit(writes);

  // Non-critical: recalculate remindDate
  try {
    const updated = await getDoc(taskPath(uid, parentTaskId)) as unknown as ITask;
    await updateDoc(taskPath(uid, parentTaskId), { remindDate: getTaskRemindDate(updated) }, ['remindDate']);
  } catch { /* non-critical */ }

  // Reverse side effects (fire-and-forget)
  const completedAtDate = history.completedAt
    ? formatDate(new Date(history.completedAt))
    : (history.dueDate ?? formatDate(new Date()));
  const entityId = repeating ? `${parentTaskId}_${completedAtDate.slice(0, 10)}` : parentTaskId;

  const sideEffects: Promise<unknown>[] = [
    removeKarma(uid, 'completeTask', entityId),
    removeFromProgress(uid, parentTaskId, completedAtDate),
    incrementField(activityTotalsPath(uid), 'tasks.completed', -1),
  ];
  revertDailyStreak(parentTaskId);
  if (repeating) {
    sideEffects.push(revertRoutineStreak(uid, parentTaskId));
  } else {
    sideEffects.push(addToOrdering(uid, parentTaskId, 'end'));
    sideEffects.push(incrementField(activityTotalsPath(uid), 'tasks.active', 1));
  }
  const uncompleteResults = await Promise.allSettled(sideEffects);
  logSideEffectResults('uncompleteTask', uncompleteResults);

  const final = await getDoc(taskPath(uid, parentTaskId));
  return { uncompleted: true, task: final, karmaReverted: true };
}
