import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { collectCommands, focusCommands, formatCommandMap } from '../command-map';

function buildProgram(): Command {
  const p = new Command();
  p.command('login').description('Login');
  p.command('whoami').description('Auth status');
  const tasks = p.command('tasks');
  tasks.command('list').description('List tasks').option('--date <date>', 'Date');
  tasks.command('create').description('Create a task');
  p.command('profile').description('View profile');
  p.command('commands').description('List all commands');
  return p;
}

describe('collectCommands', () => {
  it('flattens leaf commands with namespaced names', () => {
    const cmds = collectCommands(buildProgram());
    const names = cmds.map((c) => c.name);
    expect(names).toContain('tasks list');
    expect(names).toContain('tasks create');
    expect(names).toContain('login');
    // a parent with subcommands is not itself a leaf
    expect(names).not.toContain('tasks');
  });

  it('captures option flags', () => {
    const list = collectCommands(buildProgram()).find((c) => c.name === 'tasks list');
    expect(list?.options).toContain('--date <date>');
  });
});

describe('focusCommands', () => {
  it('keeps the user surface and drops auth/meta plumbing', () => {
    const groups = focusCommands(collectCommands(buildProgram())).map((c) => c.name.split(' ')[0]);
    expect(new Set(groups)).toEqual(new Set(['tasks', 'profile']));
    expect(groups).not.toContain('login');
    expect(groups).not.toContain('whoami');
    expect(groups).not.toContain('commands');
  });
});

describe('formatCommandMap', () => {
  it('groups by first token and renders one line per command', () => {
    const out = formatCommandMap(collectCommands(buildProgram()));
    expect(out).toContain('numo tasks list');
    expect(out).toContain('numo tasks create');
    // stale legacy command must never appear
    expect(out).not.toContain('numo add');
  });
});
