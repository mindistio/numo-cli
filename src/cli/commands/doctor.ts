import { Command } from 'commander';
import pc from 'picocolors';
import { loadCredentials, getIdToken } from '../auth/credentials';
import { getFirebaseApiKey } from '../lib/config';
import { getFirestoreBaseUrl } from '../lib/config';
import { printJson } from '../lib/output';
import { isInteractive } from '../lib/tty';
import { SYM } from '../lib/symbols';

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

  // 2. Credentials
  const creds = loadCredentials();
  checks.push({
    name: 'credentials',
    status: creds ? 'ok' : 'fail',
    message: creds ? `Logged in as ${creds.email}` : 'Not logged in (run: numo login)',
  });

  // 3. Token refresh
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

  // 4. API key
  const apiKey = getFirebaseApiKey();
  checks.push({
    name: 'api_key',
    status: apiKey ? 'ok' : 'fail',
    message: apiKey ? 'Firebase API key configured' : 'NUMO_FIREBASE_API_KEY not set',
  });

  // 5. Firebase reachable
  try {
    const baseUrl = getFirestoreBaseUrl();
    const resp = await fetch(baseUrl, { signal: AbortSignal.timeout(5000) });
    // Any HTTP response (even 401) means Firebase is reachable
    checks.push({ name: 'firebase_reachable', status: 'ok', message: `Firebase reachable (HTTP ${resp.status})` });
  } catch (err: any) {
    checks.push({ name: 'firebase_reachable', status: 'fail', message: `Firebase unreachable: ${err.message}` });
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
