import pc from 'picocolors';
import { SYM } from './symbols';

export function formatDate(ts: number | string | null | undefined): string {
  if (ts == null) return '';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  const now = new Date();
  const date = d.toLocaleDateString('en-CA'); // YYYY-MM-DD
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (date === now.toLocaleDateString('en-CA')) return `today ${time}`;
  return time === '00:00' ? date : `${date} ${time}`;
}

export function formatRelativeDate(ts: number | string | null | undefined): string {
  if (ts == null) return '';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(ts);
}

export function formatTags(tags: unknown): string {
  if (!Array.isArray(tags) || tags.length === 0) return '';
  return tags.map((t) => pc.cyan(`#${t}`)).join(' ');
}

export function formatDifficulty(d: unknown): string {
  if (d == null) return '';
  const labels = ['S', 'M', 'L', 'XL'];
  return labels[Number(d)] ?? String(d);
}

export function formatDuration(mins: unknown): string {
  if (mins == null) return '';
  const n = Number(mins);
  if (n < 60) return `${n}min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export function formatRepeat(repeat: unknown): string {
  if (!repeat || typeof repeat !== 'object') return '';
  const r = repeat as { type?: string; every?: number; weekDays?: string[] };
  if (!r.type || r.type === 'none') return '';
  const every = r.every ?? 1;
  if (r.type === 'daily') return every === 1 ? 'daily' : `every ${every} days`;
  if (r.type === 'weekly') {
    const days = r.weekDays?.join(', ') ?? '';
    const base = every === 1 ? 'weekly' : `every ${every} weeks`;
    return days ? `${base} (${days})` : base;
  }
  if (r.type === 'monthly') return every === 1 ? 'monthly' : `every ${every} months`;
  return r.type;
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const suffix = SYM.ellipsis;
  return s.slice(0, max - suffix.length) + suffix;
}

export function formatWeekdayHeader(date: Date, streakCount?: number): string {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
  const fullDate = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const cols = process.stdout.columns ?? 80;
  const fire = SYM.fire;
  const streakStr = streakCount && streakCount > 0 ? `${fire} ${streakCount}` : '';
  // +2 for leading indent
  const pad = Math.max(0, cols - weekday.length - streakStr.length - 4);
  const line1 = `  ${pc.bold(weekday)}${' '.repeat(pad)}${streakStr}`;
  const line2 = `  ${pc.dim(fullDate)}`;
  return `${line1}\n${line2}`;
}

export function formatKarmaGain(points: number, checksInRow?: number): string {
  const base = pc.green(`+${points} karma`);
  if (checksInRow && checksInRow > 1) {
    return `${base} ${pc.yellow(`streak x${checksInRow}!`)}`;
  }
  return base;
}

export function formatProgressSummary(completed: number, total: number): string {
  return pc.dim(`${completed}/${total} done today`);
}

export function formatTagsSummary(tasks: { tags?: string[] }[]): string {
  const counts: Record<string, number> = {};
  for (const t of tasks) {
    if (!Array.isArray(t.tags)) continue;
    for (const tag of t.tags) {
      counts[tag] = (counts[tag] ?? 0) + 1;
    }
  }
  const entries = Object.entries(counts);
  if (entries.length === 0) return '';
  return entries.map(([tag, count]) => `${pc.cyan('#' + tag)}${pc.dim('(' + count + ')')}`).join('  ');
}
