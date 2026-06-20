import { readFileSync } from 'fs';
import { join } from 'path';

// AGENTS.md is the single source of truth for the agent contract. The build
// (build.mjs) inlines its text via esbuild `define`, so the published single-file
// binary carries the guide with no external file. In dev (tsx) the define is
// absent, so we read AGENTS.md from the repo root (`npm run dev` runs from there).
declare const __AGENTS_MD__: string | undefined;

/** The full agent integration guide (AGENTS.md), embedded at build time. */
export function getAgentGuide(): string {
  if (typeof __AGENTS_MD__ !== 'undefined') return __AGENTS_MD__;
  try {
    return readFileSync(join(process.cwd(), 'AGENTS.md'), 'utf8');
  } catch {
    return 'Agent guide is unavailable in this build.\nSee https://github.com/mindistio/numo-cli/blob/main/AGENTS.md';
  }
}
