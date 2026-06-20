// Task date helpers aligned with the Numo API's date contract.
//
// - "today"/"yesterday" use the LOCAL calendar day (the API resolves the day in local time
//   too). Using UTC (toISOString) misclassifies the day for non-UTC clients near midnight.
// - dueDate is canonicalized to 'YYYY-MM-DD HH:mm', matching how the API stores it.
// - completion is restricted to today/yesterday, matching the API's complete guard.

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local calendar day as 'YYYY-MM-DD' (not UTC). */
export function localDateOnly(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local 'YYYY-MM-DD' offset from `base` by `n` whole calendar days (DST-safe via setDate). */
export function localDateOffset(n: number, base: Date = new Date()): string {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return localDateOnly(d);
}

/**
 * Canonicalize an outgoing dueDate to 'YYYY-MM-DD HH:mm' (matches how the API stores it).
 * 'YYYY-MM-DD' -> 'YYYY-MM-DD 00:00'; longer strings are sliced to minutes.
 */
export function toApiDueDate(s: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s} 00:00` : s.slice(0, 16);
}

/** Whether a dueDate string carries a non-zero time-of-day.
 * Anchored at end so it still matches on an un-sliced 'YYYY-MM-DD HH:mm:ss' value. */
export function dueDateHasTime(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  const m = dueDate.match(/ (\d{2}):(\d{2})$/);
  if (!m) return false;
  return !(m[1] === '00' && m[2] === '00');
}

/**
 * In-place: if `body.dueDate` is a string, canonicalize it to 'YYYY-MM-DD HH:mm' and set
 * `body.withTime` accordingly. Leaves an absent/non-string dueDate untouched so PATCH calls
 * that don't change the due date don't accidentally send withTime.
 */
export function normalizeDueDateInBody(body: Record<string, unknown>): void {
  if (typeof body.dueDate === 'string') {
    const due = toApiDueDate(body.dueDate);
    body.dueDate = due;
    body.withTime = dueDateHasTime(due);
  }
}

/**
 * Whether `date` (YYYY-MM-DD or YYYY-MM-DD HH:mm) is today or yesterday by the local
 * calendar — the exact range the API accepts for task completion.
 */
export function isCompletableDate(date: string, now: Date = new Date()): boolean {
  const dateOnly = date.slice(0, 10);
  return dateOnly === localDateOnly(now) || dateOnly === localDateOffset(-1, now);
}
