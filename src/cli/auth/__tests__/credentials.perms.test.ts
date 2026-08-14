import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Real filesystem, because the property under test is a filesystem property — a mock
// would assert that we passed 0o600 to something, not that a file ended up at 0o600.
const onPosix = process.platform !== 'win32';

const CREDS = { refreshToken: 'rt', uid: 'u1', email: 'a@b.com' };

let tmp: string;
const env = { ...process.env };

function modeOf(file: string): number {
  return fs.statSync(file).mode & 0o777;
}

describe('credentials file permissions (I-7)', () => {
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'numo-perms-'));
    process.env.NUMO_CONFIG_DIR = path.join(tmp, 'cfg');
  });

  afterEach(() => {
    process.env = { ...env };
    fs.rmSync(tmp, { recursive: true, force: true });
    vi.resetModules();
  });

  // I-7: the file holding a refresh token is never readable by group or other, at any
  // point. This is a condition on the file at all times, not the outcome of one call —
  // which is why every route that can produce it is checked, not just the first write.
  it.skipIf(!onPosix)('writes a fresh file no wider than 0600', async () => {
    const { saveCredentials } = await import('../credentials');
    saveCredentials(CREDS);

    const file = path.join(process.env.NUMO_CONFIG_DIR!, 'credentials.json');
    expect(modeOf(file) & 0o077).toBe(0);
  });

  it.skipIf(!onPosix)('creates the directory itself no wider than 0700', async () => {
    const { saveCredentials } = await import('../credentials');
    saveCredentials(CREDS);

    expect(modeOf(process.env.NUMO_CONFIG_DIR!) & 0o077).toBe(0);
  });

  // writeFileSync's `mode` applies only when it creates the file, so a file that was
  // already loose stays loose without the explicit chmod. A user who once ran
  // `chmod 644` on it would otherwise never get it tightened back.
  it.skipIf(!onPosix)('tightens a pre-existing world-readable file', async () => {
    const dir = process.env.NUMO_CONFIG_DIR!;
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = path.join(dir, 'credentials.json');
    fs.writeFileSync(file, '{}');
    fs.chmodSync(file, 0o644);

    const { saveCredentials } = await import('../credentials');
    saveCredentials(CREDS);

    expect(modeOf(file) & 0o077).toBe(0);
  });

  // The erase overwrites the bytes before unlinking. What is observable afterwards is
  // that nothing readable is left at the path — a remnant would be a token on disk that
  // no command will ever clean up again, because loadCredentials no longer finds it.
  it('leaves nothing at the path after erasing', async () => {
    const { saveCredentials, clearCredentials, loadCredentials } = await import('../credentials');
    saveCredentials(CREDS);
    const file = path.join(process.env.NUMO_CONFIG_DIR!, 'credentials.json');
    expect(fs.existsSync(file)).toBe(true);

    clearCredentials();

    expect(fs.existsSync(file)).toBe(false);
    expect(loadCredentials()).toBeNull();
  });
});

describe('loadCredentials on a file it did not write', () => {
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'numo-load-'));
    process.env.NUMO_CONFIG_DIR = path.join(tmp, 'cfg');
    fs.mkdirSync(process.env.NUMO_CONFIG_DIR, { recursive: true, mode: 0o700 });
  });

  afterEach(() => {
    process.env = { ...env };
    fs.rmSync(tmp, { recursive: true, force: true });
    vi.resetModules();
  });

  function writeRaw(contents: string, mode = 0o600) {
    const file = path.join(process.env.NUMO_CONFIG_DIR!, 'credentials.json');
    fs.writeFileSync(file, contents, { mode });
    fs.chmodSync(file, mode);
    return file;
  }

  // Contract: anything that is not a usable profile reads as "not logged in". A truncated
  // write, a half-synced file or a hand-edited one would otherwise flow onward as a
  // Credentials object and fail somewhere further in, with a message about the wrong thing.
  it.each([
    ['truncated JSON', '{"refreshToken":"rt","uid"'],
    ['an empty file', ''],
    ['a JSON value that is not an object', '"just a string"'],
    ['a profile missing its refresh token', '{"uid":"u1","email":"a@b.com"}'],
    ['a profile whose uid is not a string', '{"refreshToken":"rt","uid":42,"email":"a@b.com"}'],
  ])('reads %s as no credentials at all', async (_case, contents) => {
    writeRaw(contents);
    const { loadCredentials } = await import('../credentials');

    expect(loadCredentials()).toBeNull();
  });

  // Liveness: a well-formed profile does load, or the rule above would be satisfied by a
  // reader that returns null for everything.
  it('reads a well-formed profile', async () => {
    writeRaw(JSON.stringify(CREDS));
    const { loadCredentials } = await import('../credentials');

    expect(loadCredentials()).toMatchObject({ refreshToken: 'rt', uid: 'u1' });
  });

  // I-7 from the reading side: the four cases above cover the routes that write the file,
  // and none of them can see a file that went loose afterwards. Telling the user is all
  // the CLI can do about it, so it has to actually do it.
  it.skipIf(!onPosix)('warns when the file it is reading is group- or other-readable', async () => {
    writeRaw(JSON.stringify(CREDS), 0o644);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { loadCredentials } = await import('../credentials');
    loadCredentials();

    const written = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');
    stderr.mockRestore();
    expect(written).toContain('chmod 600');
  });

  it.skipIf(!onPosix)('says nothing about a file that is already tight', async () => {
    writeRaw(JSON.stringify(CREDS), 0o600);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { loadCredentials } = await import('../credentials');
    loadCredentials();

    const written = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');
    stderr.mockRestore();
    expect(written).toBe('');
  });
});
