import * as fs from 'fs';
import * as path from 'path';
import pc from 'picocolors';
import { getConfigDir, ensureConfigDir } from './dirs';
import { isInteractive } from './tty';

const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const PACKAGE_NAME = 'numo-cli';

interface CheckState {
  lastCheck: number;
  latestVersion?: string;
}

function getStatePath(): string {
  return path.join(getConfigDir(), 'update-check.json');
}

function loadState(): CheckState {
  try {
    return JSON.parse(fs.readFileSync(getStatePath(), 'utf8'));
  } catch {
    return { lastCheck: 0 };
  }
}

function saveState(state: CheckState): void {
  try {
    ensureConfigDir();
    fs.writeFileSync(getStatePath(), JSON.stringify(state), { mode: 0o600 });
  } catch {}
}

function semverGt(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

/**
 * Check for updates and print a notification if a newer version is available.
 * Runs non-blocking: shows cached result, fetches in background.
 */
export function checkForUpdate(currentVersion: string): void {
  // Skip in non-TTY, CI, or if explicitly disabled
  if (!isInteractive()) return;
  if (process.env.CI || process.env.NUMO_NO_UPDATE_CHECK) return;
  if (currentVersion === '0.0.0-dev') return;

  const state = loadState();

  // Show cached notification if available
  if (state.latestVersion && semverGt(state.latestVersion, currentVersion)) {
    process.stderr.write(
      `\n  ${pc.yellow('Update available')} ${pc.dim(currentVersion)} ${pc.dim('→')} ${pc.green(state.latestVersion)}\n` +
      `  Run ${pc.cyan('npm i -g numo-cli')} to update\n\n`
    );
  }

  // Background fetch if check interval has passed
  if (Date.now() - state.lastCheck > CHECK_INTERVAL) {
    fetchLatestVersion(state);
  }
}

function fetchLatestVersion(state: CheckState): void {
  // Fire-and-forget: use native https to avoid blocking CLI exit
  try {
    const url = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
    fetch(url, { signal: AbortSignal.timeout(5000) })
      .then((resp) => resp.json())
      .then((data: any) => {
        state.lastCheck = Date.now();
        state.latestVersion = data.version;
        saveState(state);
      })
      .catch(() => {
        // Silently ignore network errors
        state.lastCheck = Date.now();
        saveState(state);
      });
  } catch {
    // fetch may not be available in very old Node
  }
}
