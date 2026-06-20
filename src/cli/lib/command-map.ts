import type { Command } from 'commander';
import pc from 'picocolors';

export interface CommandInfo {
  name: string;
  description: string;
  options: string[];
}

// Walk the Commander tree and collect every runnable (leaf) command. Single
// source of truth behind `numo commands` and the post-login greeting, so neither
// can drift from the actual registered commands.
export function collectCommands(root: Command): CommandInfo[] {
  const out: CommandInfo[] = [];
  function walk(cmd: Command, prefix: string) {
    for (const sub of cmd.commands) {
      const fullName = prefix ? `${prefix} ${sub.name()}` : sub.name();
      if (sub.commands.length > 0) {
        walk(sub, fullName);
      } else {
        out.push({
          name: fullName,
          description: sub.description(),
          options: sub.options.map((o: { flags: string }) => o.flags),
        });
      }
    }
  }
  walk(root, '');
  return out;
}

// Day-to-day user surface for the post-login greeting. Auth/meta plumbing
// (login, logout, whoami, commands, schema, completion) is intentionally left
// out here — `numo commands` still lists every command.
const FOCUS_GROUPS = new Set(['tasks', 'posts', 'profile', 'doctor']);

export function focusCommands(commands: CommandInfo[]): CommandInfo[] {
  return commands.filter((c) => FOCUS_GROUPS.has(c.name.split(' ')[0]));
}

// Grouped, colorized command map for TTY output (grouped by first token).
export function formatCommandMap(commands: CommandInfo[]): string {
  const lines: string[] = [];
  let lastGroup = '';
  for (const cmd of commands) {
    const group = cmd.name.split(' ')[0];
    if (group !== lastGroup) {
      if (lastGroup) lines.push('');
      lines.push(`  ${pc.bold(group.charAt(0).toUpperCase() + group.slice(1) + ':')}`);
      lastGroup = group;
    }
    lines.push(`    numo ${cmd.name.padEnd(30)} ${pc.dim(cmd.description)}`);
  }
  return lines.join('\n');
}
