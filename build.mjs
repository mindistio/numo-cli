import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

await esbuild.build({
  entryPoints: ['src/cli/cli.ts'],
  bundle: true,
  platform: 'node',
  // The floor this package promises, and the one CI runs. esbuild downlevels syntax to
  // it, so this and engines.node in package.json are the same statement said twice —
  // they move together or the bundle stops matching the manifest.
  target: 'node22',
  outfile: 'dist/cli.cjs',
  format: 'cjs',
  external: ['open'],
  banner: { js: '#!/usr/bin/env node' },
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
    __API_BASE_URL__: JSON.stringify(process.env.NUMO_API_URL ?? 'https://api.numo.ai'),
    // Inline the agent contract so `numo guide` ships inside the single-file
    // binary — AGENTS.md stays the one source of truth (no duplicated copy).
    __AGENTS_MD__: JSON.stringify(readFileSync('AGENTS.md', 'utf8')),
  },
});

console.log('Build complete: dist/cli.cjs');
