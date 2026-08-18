import { Command } from 'commander';
import pc from 'picocolors';
import { promises as dns } from 'dns';
import { isIP } from 'net';
import tls from 'tls';
import { loadCredentials, getIdToken } from '../auth/credentials';
import { API_BASE } from '../lib/api-client';
import { classifyApiBase } from '../lib/api-base';
import { printJson } from '../lib/output';
import { isQuietMode } from '../lib/quiet';
import { SYM } from '../lib/symbols';
import { sanitizeErrorMessage } from '../lib/errors';
import { getMe } from '../services/me';

/**
 * The floor this package supports, and the fourth place it is written down —
 * package.json engines.node, build.mjs's esbuild target, and the CI matrix are the
 * others. This one is the only one a USER ever sees, and it is the one that stayed at
 * 18 when the rest moved: `numo doctor` reported "all checks passed" on a Node that
 * `npm i -g numo` refuses, which is the run where a broken install is being diagnosed.
 *
 * Four, still — `.nvmrc` is a fifth number but not a fifth copy of THIS one. It pins 24,
 * the version releases are cut on; this is 22, the oldest one still supported. They are
 * different facts and are allowed to differ. What must not drift is this against
 * engines.node, which is what the doctor test asserts.
 */
export const MIN_NODE_MAJOR = 22;

interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
  fix?: string;
}

function errMessage(err: unknown): string {
  return sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
}

async function checkDns(hostname: string): Promise<CheckResult> {
  // A literal IP (loopback, self-hosted) or localhost has nothing to resolve —
  // dns.resolve() would do an A-record query and fail (ENOTFOUND) on an address.
  if (isIP(hostname) !== 0 || hostname === 'localhost') {
    return { name: 'dns', status: 'ok', message: `DNS skipped (${hostname} is a literal address)` };
  }
  try {
    const addrs = await dns.resolve(hostname);
    return { name: 'dns', status: 'ok', message: `DNS ${hostname} → ${addrs[0]}` };
  } catch (err: any) {
    return { name: 'dns', status: 'fail', message: `DNS lookup failed for ${hostname}: ${errMessage(err)}` };
  }
}

async function checkTls(hostname: string): Promise<CheckResult> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: hostname, port: 443, timeout: 5000, servername: hostname },
      () => {
        const proto = socket.getProtocol() ?? 'unknown';
        socket.end();
        resolve({ name: 'tls', status: 'ok', message: `TLS handshake OK (${proto})` });
      },
    );
    socket.on('error', (err: Error) => {
      resolve({ name: 'tls', status: 'fail', message: `TLS handshake failed: ${errMessage(err)}` });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ name: 'tls', status: 'fail', message: 'TLS handshake timed out after 5s' });
    });
  });
}

async function runChecks(): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  const nodeVersion = process.version;
  const supported = parseInt(nodeVersion.slice(1), 10) >= MIN_NODE_MAJOR;
  checks.push({
    name: 'node_version',
    status: supported ? 'ok' : 'fail',
    message: supported
      ? `Node ${nodeVersion}`
      : `Node ${nodeVersion} — requires >= ${MIN_NODE_MAJOR}`,
  });

  const verdict = classifyApiBase();
  if (!verdict.ok) {
    checks.push({
      name: 'api_url',
      status: 'fail',
      message: verdict.message,
      fix: 'Use https://api.numo.ai, or export NUMO_ALLOW_CUSTOM_HOST=1 for a self-hosted server',
    });
    return checks; // don't probe (or send anything to) an untrusted/invalid host
  }
  const apiUrl = new URL(API_BASE);
  checks.push({
    name: 'api_url',
    status: verdict.insecure ? 'warn' : process.env.NUMO_API_URL ? 'ok' : 'warn',
    message: verdict.insecure
      ? `API URL: ${API_BASE} (HTTP — tokens unencrypted)`
      : process.env.NUMO_API_URL
        ? `API URL: ${API_BASE}`
        : `NUMO_API_URL not set (using default: ${API_BASE})`,
  });

  checks.push(await checkDns(apiUrl.hostname));

  if (apiUrl.protocol === 'https:') {
    checks.push(await checkTls(apiUrl.hostname));
  }

  // The gate is "can this shell authenticate", not "is there a credentials file".
  // getIdToken() reads NUMO_TOKEN first (auth/credentials.ts), so an agent or CI runner
  // with the env var and no file — the setup AGENTS.md prescribes — makes perfectly good
  // API calls while doctor reported a broken install, failed the whole health check, and
  // skipped the one report this release added: which verification gate is closed.
  const creds = loadCredentials();
  const envToken = !!process.env.NUMO_TOKEN;
  const authed = envToken || !!creds;
  checks.push({
    name: 'credentials',
    status: authed ? 'ok' : 'fail',
    // Named, not just passed: "Logged in as <email>" for a token with no file would be
    // a claim doctor cannot support — it never decodes the token.
    message: envToken
      ? 'Using NUMO_TOKEN'
      : creds
        ? `Logged in as ${creds.email}`
        : 'Not logged in',
    fix: authed ? undefined : 'numo login',
  });

  if (authed) {
    try {
      await getIdToken();
      checks.push({ name: 'token', status: 'ok', message: 'Token valid / refreshed' });
    } catch (err: unknown) {
      checks.push({
        name: 'token',
        status: 'fail',
        message: `Token refresh failed: ${errMessage(err)}`,
        fix: 'numo login',
      });
    }
  } else {
    checks.push({ name: 'token', status: 'fail', message: 'Skipped (no credentials and no NUMO_TOKEN)' });
  }

  try {
    const resp = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
    checks.push({
      name: 'api_reachable',
      status: resp.ok ? 'ok' : 'fail',
      message: `API /api/health → HTTP ${resp.status}`,
      fix: resp.ok ? undefined : 'Check NUMO_API_URL and your network connection',
    });
  } catch (err: unknown) {
    checks.push({
      name: 'api_reachable',
      status: 'fail',
      message: `API server unreachable: ${errMessage(err)}`,
      fix: 'Check NUMO_API_URL and your network connection',
    });
  }

  if (authed) {
    try {
      const token = await getIdToken();
      const resp = await fetch(`${API_BASE}/api/tasks?backlog=true`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      });
      checks.push({
        name: 'auth',
        status: resp.ok ? 'ok' : 'fail',
        message: resp.ok ? `Authenticated request OK (HTTP ${resp.status})` : `Authenticated request failed: HTTP ${resp.status}`,
        fix: resp.ok ? undefined : 'numo login',
      });
    } catch (err: unknown) {
      checks.push({
        name: 'auth',
        status: 'fail',
        message: `Authenticated request error: ${errMessage(err)}`,
        fix: 'numo login',
      });
    }

    // Asked live, because the stored token's email_verified claim keeps its old
    // value for up to an hour after the link is clicked — long enough for doctor to
    // tell a user who has just verified that they are still blocked.
    try {
      const me = await getMe();
      // Two gates, reported separately because they disagree: `verified` guards posts
      // and likes with no exemptions, `canCreateTasks` grandfathers accounts older than
      // the server's cutoff. Reporting only the task one told a legacy account
      // "verification ok" while the community gate was refusing every like it made.
      const blocked = [
        me.verified === false && 'posting and likes',
        me.canCreateTasks === false && 'creating tasks',
      ].filter((x): x is string => typeof x === 'string');

      if (me.verified === undefined && me.canCreateTasks === undefined) {
        // An older server does not report either. Saying "blocked" here would be the
        // CLI inventing a refusal the server never made — and it fails the whole
        // health check, which in CI reads as a broken install.
        checks.push({ name: 'verification', status: 'warn', message: 'Server does not report verification status' });
      } else {
        checks.push({
          name: 'verification',
          status: blocked.length ? 'fail' : 'ok',
          message: blocked.length
            ? `Identity not verified — ${blocked.join(' and ')} blocked`
            // Not "email verified": a phone account passes with no email at all, and
            // telling it its email is verified is a claim about a field it lacks.
            : me.emailVerified
              ? 'Email verified'
              : 'Verified',
          fix: blocked.length ? 'numo verify-email' : undefined,
        });
      }
    } catch (err: unknown) {
      checks.push({
        name: 'verification',
        status: 'warn',
        message: `Verification status unavailable: ${errMessage(err)}`,
      });
    }
  }

  return checks;
}

export function registerDoctorCommand(program: Command) {
  program
    .command('doctor')
    .description('Check CLI health and connectivity')
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals();
      const asJson = isQuietMode(opts);

      const checks = await runChecks();
      const ok = checks.every((c) => c.status !== 'fail');

      if (asJson) {
        printJson({ ok, exitCode: ok ? 0 : 1, checks });
      } else {
        console.log('');
        for (const check of checks) {
          const icon = check.status === 'ok'
            ? pc.green(SYM.check)
            : check.status === 'warn'
              ? pc.yellow('!')
              : pc.red(SYM.cross);
          console.log(`  ${icon} ${check.message}`);
          if (check.fix) {
            console.log(`      ${pc.dim('Fix:')} ${pc.cyan('$')} ${pc.bold(check.fix)}`);
          }
        }
        console.log('');
        console.log(`  ${ok ? pc.green('All checks passed.') : pc.red('Some checks failed.')}`);
        console.log('');
      }

      if (!ok) process.exit(1);
    });
}
