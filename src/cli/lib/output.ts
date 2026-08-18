import pc from 'picocolors';
import { isInteractive } from './tty';
import { renderTable } from './table';
import { CliError, classifyError } from './errors';

export function printJson(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

export function printNdjsonLine(data: unknown) {
  process.stdout.write(JSON.stringify(data) + '\n');
}

export function printTable(rows: Record<string, unknown>[], columns?: string[]) {
  if (!isInteractive()) {
    printJson(rows);
    return;
  }

  const keys = columns ?? (rows.length > 0 ? Object.keys(rows[0]) : []);
  const headers = keys.map((k) => k.toUpperCase());
  const tableRows = rows.map((r) => keys.map((k) => String(r[k] ?? '')));
  console.log(renderTable(headers, tableRows));
}

export function printRecord(fields: [string, unknown][]) {
  const visible = fields.filter(([, v]) => v != null && v !== '');
  const maxLabel = Math.max(...visible.map(([l]) => l.length));
  for (const [label, value] of visible) {
    console.log(`  ${pc.bold(label.padEnd(maxLabel))}  ${value}`);
  }
}

export function outputResult(data: unknown, asJson: boolean) {
  if (!asJson && typeof data === 'string') {
    console.log(data);
    return;
  }
  printJson(data);
}

function pickFields(obj: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const f of fields) { if (f in obj) result[f] = obj[f]; }
  return result;
}

function parseFieldList(fields: string | boolean | undefined): string[] | null {
  if (!fields || fields === true) return null;
  return (fields as string).split(',').map(f => f.trim());
}

/**
 * Trim a payload that IS the record. `tasks get` and `posts get` return an ApiTask /
 * ApiPost directly (services/tasks.ts, services/posts.ts) — no envelope around it —
 * so the field list has to apply to the payload itself. Reading it as an envelope
 * and trimming its nested values instead left every top-level scalar in place, which
 * meant `--json id,text` on a get returned the whole task, private note included.
 */
export function selectRecordFields(record: unknown, fields: string | boolean | undefined): unknown {
  const fieldList = parseFieldList(fields);
  if (!fieldList || record === null || typeof record !== 'object' || Array.isArray(record)) {
    return record;
  }
  return pickFields(record as Record<string, unknown>, fieldList);
}

/**
 * Trim the record(s) under `recordKey`, leaving every other key of the envelope
 * exactly as it arrived. `recordKey` is the same key the runner already uses to pull
 * the record out for the human renderer, so the two views agree by construction.
 *
 * Naming the key is the point. Trimming by JS type instead — "any nested object" —
 * is strictly wider than "the record this command is about", and `tasks complete`
 * returns `{completed, taskHistory, karma, checksInRow, taskText}` where taskHistory
 * is a peer record (numo-api serializeTask), not a wrapper. `--json karma` emptied it
 * to `{}`, and no field list could get it back: `--json taskHistory` looked for a key
 * of that name *inside* it.
 *
 * Omit `recordKey` when the envelope holds no record to trim — that same complete
 * response, and delete, whose scalars are the whole answer.
 */
export function selectFields(
  envelope: unknown,
  fields: string | boolean | undefined,
  recordKey?: string,
): unknown {
  const fieldList = parseFieldList(fields);
  if (!fieldList || recordKey === undefined || envelope === null || typeof envelope !== 'object') {
    return envelope;
  }
  const obj = envelope as Record<string, unknown>;
  const value = obj[recordKey];
  if (value === null || typeof value !== 'object') return envelope;

  return {
    ...obj,
    [recordKey]: Array.isArray(value)
      ? value.map(item => pickFields(item as Record<string, unknown>, fieldList))
      : pickFields(value as Record<string, unknown>, fieldList),
  };
}

export function outputError(err: unknown, asJson: boolean): never {
  const structured = classifyError(err);

  if (asJson) {
    console.error(JSON.stringify(structured.toJSON(), null, 2));
  } else {
    console.error(`\n${pc.red('Error')}: ${structured.message}`);
    if (structured.options.suggestion) {
      console.error(`\n  ${pc.dim('Fix:')} ${pc.cyan('$')} ${pc.bold(structured.options.suggestion)}`);
    }
    if (structured.options.hint) {
      console.error(`  ${pc.dim(structured.options.hint)}`);
    }
    console.error('');
  }

  process.exit(structured.exitCode);
}
