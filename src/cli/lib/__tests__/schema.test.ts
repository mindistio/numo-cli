import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { buildCommandSchema, REQUIRED_WITHOUT_TTY, ARG_ALTERNATIVES } from '../schema';
import { registerTasksCommands } from '../../commands/tasks';
import { registerPostsCommands } from '../../commands/posts';

const program = new Command();
registerTasksCommands(program);
registerPostsCommands(program);

function schemaFor(path: string) {
  const cmd = path.split(' ').reduce<Command | undefined>(
    (c, part) => c?.commands.find((sub) => sub.name() === part),
    program,
  );
  if (!cmd) throw new Error(`no such command: ${path}`);
  return buildCommandSchema(cmd, path) as {
    options: { flags: string; required: boolean; type: string }[];
    arguments: { name: string; required: boolean; alternatives?: string[] }[];
  };
}

describe('option.required', () => {
  // Contract: `required` answers "must the caller pass this?". Commander's own
  // Option.required answers "does this flag take a value?" — a different question,
  // and reading it here marked every valued option required.
  it('is false for an option that merely takes a value', () => {
    const opts = schemaFor('tasks create').options;
    for (const flag of ['--text <text>', '--due <date>']) {
      expect(opts.find((o) => o.flags === flag)?.required).toBe(false);
    }
  });

  it('is true only for an option declared mandatory', () => {
    const cmd = new Command('demo')
      .requiredOption('--must <v>', 'mandatory')
      .option('--may <v>', 'takes a value')
      .option('--flag', 'boolean');
    const opts = buildCommandSchema(cmd, 'demo').options as { flags: string; required: boolean; type: string }[];

    expect(opts.find((o) => o.flags === '--must <v>')?.required).toBe(true);
    expect(opts.find((o) => o.flags === '--may <v>')?.required).toBe(false);
    expect(opts.find((o) => o.flags === '--flag')?.required).toBe(false);
    expect(opts.find((o) => o.flags === '--flag')?.type).toBe('boolean');
  });
});

describe('argument.required', () => {
  // Contract: an agent has no TTY, so a positional it cannot supply any other way is
  // required for it — regardless of the `[optional]` form the prompt fallback needs.
  it('is true for positionals with no non-interactive alternative', () => {
    expect(schemaFor('posts replies').arguments.map((a) => [a.name, a.required])).toEqual([
      ['postId', true],
      ['commentId', true],
    ]);
    expect(schemaFor('tasks get').arguments[0].required).toBe(true);
  });

  it('is false, with the alternative named, when another input can carry it', () => {
    const id = schemaFor('tasks delete').arguments[0];
    expect(id.required).toBe(false);
    expect(id.alternatives).toEqual(['--stdin']);
  });

  it('is false for a positional that a flag can replace', () => {
    expect(schemaFor('tasks create').arguments[0]).toMatchObject({ name: 'text', required: false, variadic: true });
  });
});

describe('annotation drift', () => {
  // The annotations live apart from the command definitions, so an argument rename
  // would silently drop a requirement from the schema rather than fail anything.
  it('every annotated command and argument still exists', () => {
    const annotated: [string, readonly string[]][] = [
      ...Object.entries(REQUIRED_WITHOUT_TTY),
      ...Object.entries(ARG_ALTERNATIVES).map(([path, alts]): [string, string[]] => [path, Object.keys(alts)]),
    ];

    for (const [path, names] of annotated) {
      const declared = schemaFor(path).arguments.map((a) => a.name);
      for (const name of names) expect(declared).toContain(name);
    }
  });
});
