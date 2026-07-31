// Task date helpers for building the wire format the API expects.
//
// - "today"/"yesterday" use the LOCAL calendar day. Using UTC (toISOString) would
//   misclassify the day for non-UTC users near midnight.
// - dueDate is canonicalized to the 'YYYY-MM-DD HH:mm' wire format.
// - completion is only accepted for today/yesterday (see AGENTS.md).

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
 * Canonicalize an outgoing dueDate to the 'YYYY-MM-DD HH:mm' wire format.
 * 'YYYY-MM-DD' -> 'YYYY-MM-DD 00:00'; longer strings are sliced to minutes.
 */
export function toApiDueDate(s: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s} 00:00` : s.slice(0, 16);
}

/**
 * Canonicalize `body.dueDate` to 'YYYY-MM-DD HH:mm' in place (absent/non-string is left alone).
 * withTime is deliberately not sent — the server owns it. The slice still matters: it trims
 * stray seconds that would otherwise be rejected.
 */
export function normalizeDueDateInBody(body: Record<string, unknown>): void {
  if (typeof body.dueDate === 'string') {
    body.dueDate = toApiDueDate(body.dueDate);
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
