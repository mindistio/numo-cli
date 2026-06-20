import { CliError, ErrorKind, ExitCode } from './errors';

declare const __API_BASE_URL__: string;

// Runtime NUMO_API_URL > baked-in default > localhost dev fallback.
export const API_BASE =
  process.env.NUMO_API_URL ?? (typeof __API_BASE_URL__ !== 'undefined' ? __API_BASE_URL__ : 'http://localhost:3000');

// Only a RUNTIME override is policed. The baked default was chosen at build time by the
// distributor (official build → api.numo.ai; a self-host build bakes their own host), so it
// is trusted; the env var is the attacker-influenceable surface (SSRF / credential redirect).
const FROM_ENV = process.env.NUMO_API_URL !== undefined;

function isLoopback(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

export type ApiBaseVerdict = { ok: true; insecure: boolean } | { ok: false; message: string };

/** Classify whether it is safe to send credentials to the configured API base. */
export function classifyApiBase(base: string = API_BASE, fromEnv: boolean = FROM_ENV): ApiBaseVerdict {
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    return { ok: false, message: `Invalid NUMO_API_URL: ${base}` };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, message: `NUMO_API_URL must be http(s) — got "${u.protocol}"` };
  }
  const insecure = u.protocol === 'http:' && !isLoopback(u.hostname);
  const trusted = isLoopback(u.hostname) || u.hostname === 'numo.ai' || u.hostname.endsWith('.numo.ai');
  if (fromEnv && !trusted && process.env.NUMO_ALLOW_CUSTOM_HOST !== '1') {
    return {
      ok: false,
      message:
        `Refusing to send credentials to untrusted host "${u.hostname}". ` +
        `Use https://api.numo.ai, or set NUMO_ALLOW_CUSTOM_HOST=1 for a self-hosted/staging server.`,
    };
  }
  return { ok: true, insecure };
}

let warnedInsecure = false;

/** Throw if the API base is unsafe to send credentials to; warn once on cleartext (non-loopback HTTP) transport. */
export function assertSafeApiBase(): void {
  const verdict = classifyApiBase();
  if (!verdict.ok) {
    throw new CliError(ErrorKind.CONFIG_ERROR, verdict.message, ExitCode.CONFIG, {
      suggestion: 'export NUMO_ALLOW_CUSTOM_HOST=1',
    });
  }
  if (verdict.insecure && !warnedInsecure) {
    warnedInsecure = true;
    process.stderr.write('[warn] NUMO_API_URL uses HTTP — tokens sent unencrypted. Use HTTPS in production.\n');
  }
}
