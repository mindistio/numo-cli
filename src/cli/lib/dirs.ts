import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const LEGACY_DIR = path.join(os.homedir(), '.numo');

/**
 * Get the config directory, following XDG Base Directory Spec.
 * Resolution order:
 * 1. $NUMO_CONFIG_DIR (explicit override)
 * 2. $XDG_CONFIG_HOME/numo
 * 3. ~/.config/numo (XDG default)
 * 4. ~/.numo (legacy fallback: only if it exists AND new dir does NOT)
 */
export function getConfigDir(): string {
  if (process.env.NUMO_CONFIG_DIR) {
    return process.env.NUMO_CONFIG_DIR;
  }

  const xdgHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  const xdgDir = path.join(xdgHome, 'numo');

  if (fs.existsSync(xdgDir)) return xdgDir;

  // If legacy dir exists but XDG does not, use legacy (until migrated)
  if (fs.existsSync(LEGACY_DIR)) return LEGACY_DIR;

  // Default to XDG (fresh install)
  return xdgDir;
}

/**
 * Ensure the config directory exists with secure permissions.
 */
export function ensureConfigDir(): string {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

/**
 * Get path to credentials file.
 */
export function getCredentialsPath(): string {
  return path.join(getConfigDir(), 'credentials.json');
}

/**
 * One-time migration from ~/.numo/ to XDG directory.
 * Only migrates if legacy exists and XDG does not.
 */
export function migrateIfNeeded(): void {
  const xdgHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  const xdgDir = path.join(xdgHome, 'numo');

  // Skip if explicit override
  if (process.env.NUMO_CONFIG_DIR) return;

  // Only migrate if legacy exists and XDG does not
  const legacyCreds = path.join(LEGACY_DIR, 'credentials.json');
  if (!fs.existsSync(legacyCreds) || fs.existsSync(xdgDir)) return;

  try {
    fs.mkdirSync(xdgDir, { recursive: true, mode: 0o700 });

    // Copy credentials
    const data = fs.readFileSync(legacyCreds, 'utf8');
    fs.writeFileSync(path.join(xdgDir, 'credentials.json'), data, { mode: 0o600 });

    process.stderr.write(`Migrated config from ${LEGACY_DIR} to ${xdgDir}\n`);
  } catch {
    // Migration is best-effort
  }
}
