import { Command } from 'commander';
import pc from 'picocolors';
import { loadCredentials, getIdToken } from '../auth/credentials';
import { printJson } from '../lib/output';
import { isInteractive } from '../lib/tty';
import { SYM } from '../lib/symbols';

const API_BASE = process.env.NUMO_API_URL ?? 'http://localhost:3000';

interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
}

async function runChecks(): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  // 1. Node version
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1), 10);
  checks.push({
    name: 'node_version',
    status: major >= 18 ? 'ok' : 'fail',
    message: major >= 18 ? `Node ${nodeVersion}` : `Node ${nodeVersion} — requires >= 18`,
  });

  // 2. API URL
  checks.push({
    name: 'api_url',
    status: process.env.NUMO_API_URL ? 'ok' : 'warn',
    message: process.env.NUMO_API_URL
      ? `API URL: ${API_BASE}`
      : `NUMO_API_URL not set (using default: ${API_BASE})`,
  });

  // 3. Credentials
  const creds = loadCredentials();
  checks.push({
    name: 'credentials',
    status: creds ? 'ok' : 'fail',
    message: creds ? `Logged in as ${creds.email}` : 'Not logged in (run: numo login)',
  });

  // 4. Token refresh
  if (creds) {
    try {
      await getIdToken();
      checks.push({ name: 'token', status: 'ok', message: 'Token valid / refreshed' });
    } catch (err: any) {
      checks.push({ name: 'token', status: 'fail', message: `Token refresh failed: ${err.message}` });
    }
  } else {
    checks.push({ name: 'token', status: 'fail', message: 'Skipped (no credentials)' });
  }

  // 5. API server reachable
  try {
    const resp = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
    checks.push({ name: 'api_reachable', status: 'ok', message: `API server reachable (HTTP ${resp.status})` });
  } catch (err: any) {
    checks.push({ name: 'api_reachable', status: 'fail', message: `API server unreachable: ${err.message}` });
  }

  return checks;
}

export function registerDoctorCommand(program: Command) {
  program
    .command('doctor')
    .description('Check CLI health and connectivity')
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals();
      const asJson = !!(opts.json || opts.quiet || !isInteractive());

      const checks = await runChecks();
      const ok = checks.every((c) => c.status !== 'fail');

      if (asJson) {
        printJson({ ok, checks });
      } else {
        console.log('');
        for (const check of checks) {
          const icon = check.status === 'ok'
            ? pc.green(SYM.check)
            : check.status === 'warn'
              ? pc.yellow('!')
              : pc.red(SYM.cross);
          console.log(`  ${icon} ${check.message}`);
        }
        console.log('');
        if (ok) {
          console.log(`  ${pc.green('All checks passed.')}`);
        } else {
          console.log(`  ${pc.red('Some checks failed.')}`);
        }
        console.log('');
      }

      if (!ok) process.exit(1);
    });
}
