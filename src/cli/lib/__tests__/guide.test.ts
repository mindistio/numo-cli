import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getAgentGuide } from '../guide';

describe('getAgentGuide', () => {
  // Contract: `numo guide` prints AGENTS.md, not a paraphrase of it. Asserting that a
  // few phrases appear leaves the interesting failure — a guide that is stale, or
  // truncated, or half a file — indistinguishable from a correct one. AGENTS.md is what
  // agents integrate against, so "close enough" is the wrong bar; it is byte equality.
  it('is AGENTS.md verbatim', () => {
    const onDisk = readFileSync(join(process.cwd(), 'AGENTS.md'), 'utf8');
    expect(getAgentGuide()).toBe(onDisk);
  });

  // Residual, recorded rather than implied away: under vitest there is no esbuild
  // `__AGENTS_MD__` define, so this exercises the dev fallback that reads from disk.
  // The published binary takes the other branch, and whether the build inlined the
  // current file is a question only a built artifact can answer. `npm run build` +
  // `node dist/cli.cjs guide | diff - AGENTS.md` is that check, and it is not run here.
  it('falls back to a pointer rather than a lie when the file is unreachable', () => {
    const cwd = process.cwd();
    try {
      process.chdir('/');
      expect(getAgentGuide()).toContain('github.com/mindistio/numo-cli');
    } finally {
      process.chdir(cwd);
    }
  });
});
