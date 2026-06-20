import * as fs from 'fs';

export function readStdinLines(): string[] {
  const input = fs.readFileSync(0, 'utf8');
  return input.split('\n').map((l) => l.trim()).filter(Boolean);
}
