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

/**
 * Print a record as aligned key-value pairs for interactive mode.
 * Accepts a map of label → value. Null/undefined values are skipped.
 */
export function printRecord(fields: [string, unknown][]) {
  const visible = fields.filter(([, v]) => v != null && v !== '');
  const maxLabel = Math.max(...visible.map(([l]) => l.length));
  for (const [label, value] of visible) {
    console.log(`  ${pc.bold(label.padEnd(maxLabel))}  ${value}`);
  }
}

/**
 * Output a result. Interactive mode pretty-prints JSON; pipe/--json outputs raw JSON.
 */
export function outputResult(data: unknown, asJson: boolean) {
  if (asJson) {
    printJson(data);
  } else if (typeof data === 'string') {
    console.log(data);
  } else {
    printJson(data);
  }
}

/**
 * Pick only specified fields from an object.
 */
function pickFields(obj: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const f of fields) { if (f in obj) result[f] = obj[f]; }
  return result;
}

/**
 * Select specific fields from data when --json is used with field names.
 * If fields is true or undefined, returns data unchanged.
 */
export function selectFields(data: unknown, fields: string | boolean | undefined): unknown {
  if (!fields || fields === true) return data;
  const fieldList = (fields as string).split(',').map(f => f.trim());

  if (Array.isArray(data)) {
    return data.map(item => pickFields(item as Record<string, unknown>, fieldList));
  }
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
        result[key] = value.map((item: any) => pickFields(item, fieldList));
      } else {
        result[key] = value;
      }
    }
    return result;
  }
  return data;
}

/**
 * Output an error and exit. Returns `never`.
 * Classifies errors into structured CliError with kind, exit code, and suggestions.
 */
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
