import pc from 'picocolors';

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
