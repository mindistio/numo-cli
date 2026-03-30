import { isInteractive } from './tty';
import { printTable, printJson, outputResult, outputError, selectFields } from './output';
import { withSpinner } from './spinner';

export interface GlobalOpts {
  json?: boolean | string;
  quiet?: boolean;
}

function useJson(opts: GlobalOpts): boolean {
  return !!(opts.json || opts.quiet || !isInteractive());
}

function useSpinner(opts: GlobalOpts): boolean {
  return isInteractive() && !opts.quiet;
}

/**
 * Run an async function that returns a single record and output it.
 */
export async function runGet(opts: {
  global: GlobalOpts;
  fn: () => Promise<Record<string, unknown>>;
  spinnerMessage?: string;
  onInteractive?: (data: Record<string, unknown>) => void;
}): Promise<void> {
  try {
    const result = await withSpinner(
      useSpinner(opts.global),
      opts.spinnerMessage ?? 'Fetching...',
      opts.fn,
    );
    if (useJson(opts.global)) {
      printJson(selectFields(result, opts.global.json));
    } else if (opts.onInteractive) {
      opts.onInteractive(result);
    } else {
      outputResult(result, false);
    }
  } catch (err) {
    outputError(err, useJson(opts.global));
  }
}

/**
 * Run an async function that returns a list payload and output as table or JSON.
 */
export async function runList(opts: {
  global: GlobalOpts;
  fn: () => Promise<Record<string, unknown>>;
  dataKey: string;
  columns: string[];
  spinnerMessage?: string;
  onInteractive?: (payload: Record<string, unknown>) => void;
}): Promise<void> {
  try {
    const payload = await withSpinner(
      useSpinner(opts.global),
      opts.spinnerMessage ?? 'Fetching...',
      opts.fn,
    );

    if (useJson(opts.global)) {
      printJson(selectFields(payload, opts.global.json));
    } else if (opts.onInteractive) {
      opts.onInteractive(payload);
    } else {
      const items = payload[opts.dataKey];
      printTable(items as Record<string, unknown>[], opts.columns);
      if (payload.nextCursor) {
        console.log(`\nNext cursor: ${payload.nextCursor}`);
      }
    }
  } catch (err) {
    outputError(err, useJson(opts.global));
  }
}

/**
 * Run an async function that creates a resource.
 */
export async function runCreate(opts: {
  global: GlobalOpts;
  fn: () => Promise<Record<string, unknown>>;
  dataKey: string;
  successMessage?: (data: Record<string, unknown>) => string;
  spinnerMessage?: string;
  onInteractive?: (data: Record<string, unknown>, payload: Record<string, unknown>) => void;
}): Promise<void> {
  try {
    const payload = await withSpinner(
      useSpinner(opts.global),
      opts.spinnerMessage ?? 'Creating...',
      opts.fn,
    );
    const item = payload[opts.dataKey] as Record<string, unknown>;

    if (useJson(opts.global)) {
      printJson(selectFields(payload, opts.global.json));
    } else if (opts.onInteractive) {
      opts.onInteractive(item, payload);
    } else {
      if (opts.successMessage) {
        console.log(opts.successMessage(item));
      }
      outputResult(item, false);
    }
  } catch (err) {
    outputError(err, useJson(opts.global));
  }
}

/**
 * Run an async function that updates/writes a resource.
 */
export async function runWrite(opts: {
  global: GlobalOpts;
  fn: () => Promise<Record<string, unknown>>;
  dataKey?: string;
  successMessage?: string;
  spinnerMessage?: string;
  onInteractive?: (data: Record<string, unknown>) => void;
}): Promise<void> {
  try {
    const payload = await withSpinner(
      useSpinner(opts.global),
      opts.spinnerMessage ?? 'Updating...',
      opts.fn,
    );
    const item = (opts.dataKey ? payload[opts.dataKey] : payload) as Record<string, unknown>;

    if (useJson(opts.global)) {
      printJson(selectFields(payload, opts.global.json));
    } else if (opts.onInteractive) {
      opts.onInteractive(item);
    } else {
      if (opts.successMessage) console.log(opts.successMessage);
      if (item && Object.keys(item).length > 0) {
        outputResult(item, false);
      }
    }
  } catch (err) {
    outputError(err, useJson(opts.global));
  }
}

/**
 * Run an async function that deletes a resource.
 */
export async function runDelete(opts: {
  global: GlobalOpts;
  fn: () => Promise<void>;
  successMessage: string;
  spinnerMessage?: string;
}): Promise<void> {
  try {
    await withSpinner(
      useSpinner(opts.global),
      opts.spinnerMessage ?? 'Deleting...',
      opts.fn,
    );
    if (!opts.global.quiet) {
      console.log(opts.successMessage);
    }
  } catch (err) {
    outputError(err, useJson(opts.global));
  }
}
