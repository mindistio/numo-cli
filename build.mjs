import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

const required = ['NUMO_FIREBASE_API_KEY', 'NUMO_FIREBASE_PROJECT_ID', 'NUMO_FIREBASE_APP_ID', 'NUMO_ADMIN_UIDS'];
const missing = required.filter((k) => !process.env[k]);

if (missing.length > 0 && !process.env.CI) {
  console.error(`Missing env vars for build: ${missing.join(', ')}`);
  console.error('Set them before running build, e.g.:');
  console.error('  NUMO_FIREBASE_API_KEY=... NUMO_FIREBASE_PROJECT_ID=... NUMO_FIREBASE_APP_ID=... npm run build');
  process.exit(1);
}
if (missing.length > 0) {
  console.warn(`Warning: building without ${missing.join(', ')} — CLI will require env vars at runtime`);
}

await esbuild.build({
  entryPoints: ['src/cli/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'dist/cli.cjs',
  format: 'cjs',
  external: ['open'],
  banner: { js: '#!/usr/bin/env node' },
  define: {
    __FIREBASE_API_KEY__: JSON.stringify(process.env.NUMO_FIREBASE_API_KEY ?? ''),
    __FIREBASE_PROJECT_ID__: JSON.stringify(process.env.NUMO_FIREBASE_PROJECT_ID ?? ''),
    __FIREBASE_APP_ID__: JSON.stringify(process.env.NUMO_FIREBASE_APP_ID ?? ''),
    __CLI_VERSION__: JSON.stringify(pkg.version),
    __ADMIN_UIDS__: process.env.NUMO_ADMIN_UIDS ?? '[]',
  },
});

console.log('Build complete: dist/cli.cjs');
