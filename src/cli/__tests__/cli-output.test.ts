import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

function run(args: string): string {
  return execSync(`npx tsx src/cli/cli.ts ${args}`, {
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, NO_COLOR: '1' },
  });
}

function runMayFail(args: string, extraEnv?: Record<string, string>): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execSync(`npx tsx src/cli/cli.ts ${args}`, {
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, NO_COLOR: '1', ...extraEnv },
    });
    return { stdout, stderr: '', status: 0 };
  } catch (err: any) {
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? '', status: err.status ?? 1 };
  }
}

describe('CLI help output', () => {
  it('root --help includes Examples', () => {
    const out = run('--help');
    expect(out).toContain('Examples:');
    expect(out).toContain('numo login');
  });

  it('tasks list --help includes Examples', () => {
    const out = run('tasks list --help');
    expect(out).toContain('Examples:');
    expect(out).toContain('numo tasks list');
  });

  it('tasks create --help includes --text option', () => {
    const out = run('tasks create --help');
    expect(out).toContain('--text');
    expect(out).toContain('Examples:');
  });
});

describe('commands --json', () => {
  it('outputs valid JSON with commands array', () => {
    const out = run('commands --json');
    const data = JSON.parse(out);
    expect(data.commands).toBeDefined();
    expect(Array.isArray(data.commands)).toBe(true);
    expect(data.commands.length).toBeGreaterThan(5);
  });

  it('each command has name and description', () => {
    const out = run('commands --json');
    const { commands } = JSON.parse(out);
    for (const cmd of commands) {
      expect(typeof cmd.name).toBe('string');
      expect(typeof cmd.description).toBe('string');
    }
  });
});

describe('schema', () => {
  it('outputs valid JSON for all commands', () => {
    const out = run('schema');
    const data = JSON.parse(out);
    expect(data.commands).toBeDefined();
    expect(Array.isArray(data.commands)).toBe(true);
  });

  it('schema tasks create has options', () => {
    const out = run('schema "tasks create"');
    const data = JSON.parse(out);
    expect(data.name).toBe('tasks create');
    expect(data.options).toBeDefined();
    expect(data.options.some((o: any) => o.flags.includes('--text'))).toBe(true);
  });

  it('schema nonexistent exits with error', () => {
    const { status, stderr } = runMayFail('schema nonexistent');
    expect(status).not.toBe(0);
    expect(stderr).toContain('Unknown command');
  });
});

describe('whoami (not logged in)', () => {
  it('exits with code 77', () => {
    const { status } = runMayFail('whoami', { HOME: '/tmp/numo-test-no-creds', NUMO_CONFIG_DIR: '/tmp/numo-test-no-creds' });
    expect(status).toBe(77);
  });
});

describe('--version', () => {
  it('outputs 0.0.0-dev in dev mode', () => {
    const out = run('--version');
    expect(out.trim()).toBe('0.0.0-dev');
  });
});
