import pc from 'picocolors';

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
