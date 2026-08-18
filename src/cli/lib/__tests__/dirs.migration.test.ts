import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Its own file on purpose: dirs.ts resolves the legacy directory from the home
// directory once, when the module loads. Overriding HOME inside a test that has
// already imported it — directly or through credentials.ts — silently keeps the real
// home, and the migration then finds nothing to move and passes for the wrong reason.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'numo-migrate-'));
const env = { ...process.env };

process.env.HOME = tmp;
process.env.XDG_CONFIG_HOME = path.join(tmp, 'xdg');
delete process.env.NUMO_CONFIG_DIR;

const LEGACY_FILE = path.join(tmp, '.numo', 'credentials.json');
const MIGRATED_FILE = path.join(tmp, 'xdg', 'numo', 'credentials.json');
const CREDS = JSON.stringify({ refreshToken: 'rt', uid: 'u1', email: 'a@b.com' });

afterAll(() => {
  process.env = { ...env };
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** A loose legacy profile waiting to be migrated, and no destination yet. */
function legacyProfileOnly() {
  fs.rmSync(path.join(tmp, 'xdg'), { recursive: true, force: true });
  fs.mkdirSync(path.dirname(LEGACY_FILE), { recursive: true });
  fs.writeFileSync(LEGACY_FILE, CREDS);
  fs.chmodSync(LEGACY_FILE, 0o644);
}

async function migrate() {
  const { migrateIfNeeded } = await import('../dirs');
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  migrateIfNeeded();
  stderr.mockRestore();
}

describe('legacy config migration (I-7)', () => {
  beforeEach(() => {
    legacyProfileOnly();
    delete process.env.NUMO_CONFIG_DIR;
  });

  // I-7: the file holding a refresh token is never wider than 0600 at any moment. The
  // legacy path is the only place a loose one can arrive from outside our control, so
  // migration has to copy the secret without copying the mistake.
  it('does not carry a loose legacy mode across to the new location', async () => {
    await migrate();

    expect(fs.existsSync(MIGRATED_FILE)).toBe(true);
    expect(fs.readFileSync(MIGRATED_FILE, 'utf8')).toBe(CREDS);
    expect(fs.statSync(MIGRATED_FILE).mode & 0o077).toBe(0);
  });

  // Contract: migration never writes over a profile that is already there. The two files
  // are different accounts as often as not, and the loser of that overwrite is a session
  // the user cannot get back without logging in again.
  it('leaves an existing profile alone rather than overwriting it', async () => {
    const existing = JSON.stringify({ refreshToken: 'rt2', uid: 'u2', email: 'current@example.com' });
    fs.mkdirSync(path.dirname(MIGRATED_FILE), { recursive: true });
    fs.writeFileSync(MIGRATED_FILE, existing, { mode: 0o600 });

    await migrate();

    expect(fs.readFileSync(MIGRATED_FILE, 'utf8')).toBe(existing);
  });

  // Contract: an explicit NUMO_CONFIG_DIR means the caller has said where its profile
  // lives — a test account, a parallel session — and migration has no business moving
  // files behind that decision.
  it('does nothing when NUMO_CONFIG_DIR names the location', async () => {
    process.env.NUMO_CONFIG_DIR = path.join(tmp, 'explicit');

    await migrate();

    expect(fs.existsSync(MIGRATED_FILE)).toBe(false);
    expect(fs.existsSync(LEGACY_FILE)).toBe(true);
  });
});
