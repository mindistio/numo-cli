/**
 * Determines whether the CLI is running in an interactive terminal (human) or
 * non-interactive mode (agent, pipe, CI).
 */
export function isInteractive(): boolean {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  if (process.env.CI) return false;
  if (process.env.TERM === 'dumb') return false;
  return true;
}

/**
 * Whether the terminal supports Unicode box-drawing and symbols.
 * Falls back to ASCII on legacy Windows terminals.
 */
export const isUnicodeSupported: boolean =
  process.platform !== 'win32' ||
  !!process.env.WT_SESSION ||
  process.env.TERM_PROGRAM === 'vscode';
