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
      } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        // The single-record envelopes ({ task }, { post }) trim the same way the list
        // ones do. Leaving them whole meant `--json id,text` on a get or a create still
        // returned every field, private note included, while the same flag on a list
        // trimmed correctly.
        result[key] = pickFields(value as Record<string, unknown>, fieldList);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
  return data;
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
