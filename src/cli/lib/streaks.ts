import * as fs from 'fs';
import * as path from 'path';
import { getConfigDir } from './dirs';

interface StreakEntry {
  taskId: string;
  lastCheck: string;   // YYYY-MM-DD
  checksInRow: number;
}

function getStreaksPath(): string {
  return path.join(getConfigDir(), 'streaks.json');
}

function loadStreaks(): StreakEntry[] {
  try {
    const raw = fs.readFileSync(getStreaksPath(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveStreaks(entries: StreakEntry[]): void {
  const dir = path.dirname(getStreaksPath());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getStreaksPath(), JSON.stringify(entries, null, 2), { mode: 0o600 });
}

/** Delete the streaks file entirely (e.g. on logout). */
export function clearStreaks(): void {
  try {
    fs.unlinkSync(getStreaksPath());
  } catch {}
}

/** Record a daily check for a task and return the current checksInRow count. */
export function recordDailyStreak(taskId: string, date: string): number {
  const entries = loadStreaks();
  const dateStr = date.slice(0, 10); // YYYY-MM-DD
  const existing = entries.find((e) => e.taskId === taskId);

  if (existing) {
    // Calculate if this is a consecutive day
    const lastDate = new Date(existing.lastCheck);
    const thisDate = new Date(dateStr);
    const diffMs = thisDate.getTime() - lastDate.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 1) {
      existing.checksInRow += 1;
    } else if (diffDays > 1) {
      existing.checksInRow = 1;
    }
    // diffDays === 0: same day, keep current count
    existing.lastCheck = dateStr;
    saveStreaks(entries);
    return existing.checksInRow;
  }

  entries.push({ taskId, lastCheck: dateStr, checksInRow: 1 });
  saveStreaks(entries);
  return 1;
}

/** Revert a daily streak entry (e.g. on uncomplete). */
export function revertDailyStreak(taskId: string): void {
  const entries = loadStreaks();
  const idx = entries.findIndex((e) => e.taskId === taskId);
  if (idx !== -1) {
    entries[idx].checksInRow = Math.max(1, entries[idx].checksInRow - 1);
    saveStreaks(entries);
  }
}

/** Remove a streak entry entirely (e.g. on task delete). */
export function removeDailyStreak(taskId: string): void {
  const entries = loadStreaks().filter((e) => e.taskId !== taskId);
  saveStreaks(entries);
}

/** Count tasks that were checked today (lastCheck === today). */
export function getCompletedTodayCount(): number {
  const today = new Date().toISOString().slice(0, 10);
  return loadStreaks().filter((e) => e.lastCheck === today).length;
}
