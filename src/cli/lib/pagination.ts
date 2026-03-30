import pc from 'picocolors';
import { Errors } from './errors';

/**
 * Parse and validate --limit flag.
 */
export function parseLimit(raw: string, min = 1, max = 50): number {
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < min || n > max) {
    throw Errors.invalidInput(`--limit must be between ${min} and ${max}`);
  }
  return n;
}

/**
 * Print a hint for the next page of results.
 * Only prints in interactive mode when there's a next cursor.
 */
export function printPaginationHint(opts: {
  nextCursor?: string;
  command: string;
  limit?: string;
}): void {
  if (!opts.nextCursor) return;
  const parts = [opts.command, `--cursor ${opts.nextCursor}`];
  if (opts.limit) parts.push(`--limit ${opts.limit}`);
  console.log(`\n${pc.dim('Next page:')} ${pc.dim('$')} numo ${parts.join(' ')}`);
}
