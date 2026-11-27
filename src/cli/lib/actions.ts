import { printTable, printJson, outputResult, outputError, selectFields, selectRecordFields } from './output';
import { withSpinner } from './spinner';
import { isQuietMode } from './quiet';
import { stripControlDeep } from './format';

export interface GlobalOpts {
  json?: boolean | string;
  quiet?: boolean;
}

const useJson = isQuietMode;
// Spinner only in pure interactive mode — never in --json/--quiet/piped (keeps stdout clean).
const useSpinner = (opts: GlobalOpts): boolean => !isQuietMode(opts);

export async function runGet<T>(opts: {
  global: GlobalOpts;
  fn: () => Promise<T>;
  spinnerMessage?: string;
  onInteractive?: (data: T) => void;
}): Promise<void> {
  try {
    const result = await withSpinner(
      useSpinner(opts.global),
      opts.spinnerMessage ?? 'Fetching...',
      opts.fn,
    );
    if (useJson(opts.global)) {
      printJson(selectRecordFields(result, opts.global.json));
    } else if (opts.onInteractive) {
      opts.onInteractive(stripControlDeep(result));
    } else {
      outputResult(stripControlDeep(result) as Record<string, unknown>, false);
    }
  } catch (err) {
    outputError(err, useJson(opts.global));
  }
}

export async function runList<T>(opts: {
  global: GlobalOpts;
  fn: () => Promise<T>;
  dataKey: string;
  columns: string[];
  spinnerMessage?: string;
  onInteractive?: (payload: T) => void;
}): Promise<void> {
  try {
    const payload = await withSpinner(
      useSpinner(opts.global),
      opts.spinnerMessage ?? 'Fetching...',
      opts.fn,
    );

    if (useJson(opts.global)) {
      printJson(selectFields(payload, opts.global.json, opts.dataKey));
    } else if (opts.onInteractive) {
      opts.onInteractive(stripControlDeep(payload));
    } else {
      const items = stripControlDeep((payload as Record<string, unknown>)[opts.dataKey]);
      printTable(items as Record<string, unknown>[], opts.columns);
      if ((payload as Record<string, unknown>).nextCursor) {
        console.log(`\nNext cursor: ${stripControlDeep((payload as Record<string, unknown>).nextCursor)}`);
      }
    }
  } catch (err) {
    outputError(err, useJson(opts.global));
  }
}

export async function runCreate<T>(opts: {
  global: GlobalOpts;
  fn: () => Promise<T>;
  dataKey: string;
  successMessage?: (data: Record<string, unknown>) => string;
  spinnerMessage?: string;
  onInteractive?: (data: Record<string, unknown>, payload: T) => void;
}): Promise<void> {
  try {
    const payload = await withSpinner(
      useSpinner(opts.global),
      opts.spinnerMessage ?? 'Creating...',
      opts.fn,
    );
    const item = (payload as Record<string, unknown>)[opts.dataKey] as Record<string, unknown>;

    if (useJson(opts.global)) {
      printJson(selectFields(payload, opts.global.json, opts.dataKey));
    } else if (opts.onInteractive) {
      opts.onInteractive(stripControlDeep(item), stripControlDeep(payload));
    } else {
      if (opts.successMessage) {
        console.log(opts.successMessage(stripControlDeep(item)));
      }
      outputResult(stripControlDeep(item), false);
    }
  } catch (err) {
    outputError(err, useJson(opts.global));
  }
}

export async function runWrite<T>(opts: {
  global: GlobalOpts;
  fn: () => Promise<T>;
  dataKey?: string;
  successMessage?: string;
  spinnerMessage?: string;
  onInteractive?: (data: T) => void;
}): Promise<void> {
  try {
    const payload = await withSpinner(
      useSpinner(opts.global),
      opts.spinnerMessage ?? 'Updating...',
      opts.fn,
    );
    const item = (opts.dataKey ? (payload as Record<string, unknown>)[opts.dataKey] : payload) as Record<string, unknown>;

    if (useJson(opts.global)) {
      printJson(selectFields(payload, opts.global.json, opts.dataKey));
    } else if (opts.onInteractive) {
      opts.onInteractive(stripControlDeep(payload));
    } else {
      if (opts.successMessage) console.log(opts.successMessage);
      if (item && Object.keys(item).length > 0) {
        outputResult(stripControlDeep(item), false);
      }
    }
  } catch (err) {
    outputError(err, useJson(opts.global));
  }
}

