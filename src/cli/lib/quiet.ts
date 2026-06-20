import { isInteractive } from './tty';

/** Minimal spinner shape compatible with `@clack/prompts.spinner()`. */
export type ClackSpinner = { start: (msg?: string) => void; stop: (msg?: string, code?: number) => void };

const noopSpinner: ClackSpinner = {
  start: () => {},
  stop: () => {},
};

/** Whether the run should suppress pretty TTY output (intro/outro/spinner/log widgets). */
export function isQuietMode(opts: { json?: boolean | string; quiet?: boolean } = {}): boolean {
  return !!(opts.quiet || opts.json || !isInteractive());
}

/** Returns a real @clack spinner in interactive mode, or a no-op in quiet/non-TTY mode. */
export async function makeClackSpinner(quietMode: boolean): Promise<ClackSpinner> {
  if (quietMode) return noopSpinner;
  const p = await import('@clack/prompts');
  return p.spinner();
}
