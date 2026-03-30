import * as fs from 'fs';

/**
 * Read lines from stdin (synchronous, for piped input).
 * Returns trimmed, non-empty lines.
 */
export function readStdinLines(): string[] {
  const input = fs.readFileSync(0, 'utf8');
  return input.split('\n').map((l) => l.trim()).filter(Boolean);
}
