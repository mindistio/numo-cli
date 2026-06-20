import * as fs from 'fs';
import * as path from 'path';
import pc from 'picocolors';
import { getConfigDir, ensureConfigDir } from './dirs';
import { isInteractive } from './tty';

const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const PACKAGE_NAME = 'numo-cli';
const REPO = 'mindistio/numo-cli';

// Single source of truth in the TS code. NOTE: README.md, install.sh and
// package.json carry their own static copies of these (they can't import a
// const) — keep them in sync if the repo/package name ever changes.
const INSTALL_SCRIPT_URL = `https://raw.githubusercontent.com/${REPO}/main/install.sh`;
const UPGRADE_NPM = `npm i -g ${PACKAGE_NAME}`;
const UPGRADE_BINARY = `curl -fsSL ${INSTALL_SCRIPT_URL} | bash`;

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

export function semverGt(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

/** Standalone binaries are Bun-compiled; npm/npx installs run under Node. */
function isBinaryInstall(): boolean {
  return !!(process.versions as Record<string, string | undefined>).bun;
}

/** Upgrade command tailored to how numo was installed (binary vs npm). */
export function upgradeCommand(isBinary: boolean = isBinaryInstall()): string {
  return isBinary ? UPGRADE_BINARY : UPGRADE_NPM;
}

export function checkForUpdate(currentVersion: string): void {
  if (!isInteractive()) return;
  if (process.env.CI || process.env.NUMO_NO_UPDATE_CHECK) return;
  if (currentVersion === '0.0.0-dev') return;

  const state = loadState();

  if (state.latestVersion && semverGt(state.latestVersion, currentVersion)) {
    process.stderr.write(
      `\n  ${pc.yellow('Update available')} ${pc.dim(currentVersion)} ${pc.dim('→')} ${pc.green(state.latestVersion)}\n` +
      `  Run ${pc.cyan(upgradeCommand())} to update\n\n`
    );
  }

  if (Date.now() - state.lastCheck > CHECK_INTERVAL) {
    fetchLatestVersion(state);
  }
}

function fetchLatestVersion(state: CheckState): void {
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
        state.lastCheck = Date.now();
        saveState(state);
      });
  } catch {}
}
