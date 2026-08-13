import type { Command } from 'commander';

/** Bump whenever the meaning of a field in the schema payload changes. */
export const SCHEMA_VERSION = '2';

// Allowed values for options that accept a closed set — surfaced so agents don't guess.
const OPTION_ENUMS: Record<string, ReadonlyArray<string | number>> = {
  '--repeat': ['daily', 'weekly', 'monthly', 'none'],
  '--difficulty': [0, 1, 2, 3],
};

/**
 * Positionals declared `[optional]` so a TTY user gets a prompt, with no flag to pass
 * them instead. Marking them mandatory in Commander would remove that prompt, so the
 * requirement is stated here instead — it is real for every non-interactive caller.
 */
export const REQUIRED_WITHOUT_TTY: Record<string, readonly string[]> = {
  'tasks get': ['id'],
  'tasks update': ['id'],
  'posts get': ['id'],
  'posts comments': ['postId'],
  'posts replies': ['postId', 'commentId'],
};

/** Positionals that stay genuinely optional because another input can carry them. */
export const ARG_ALTERNATIVES: Record<string, Record<string, readonly string[]>> = {
  'tasks delete': { id: ['--stdin'] },
  'tasks complete': { id: ['--stdin'] },
  'tasks uncomplete': { id: ['--stdin'] },
};

export function buildCommandSchema(cmd: Command, fullName: string): Record<string, unknown> {
  const requiredWithoutTty = REQUIRED_WITHOUT_TTY[fullName] ?? [];
  const alternatives = ARG_ALTERNATIVES[fullName] ?? {};

  return {
    name: fullName,
    description: cmd.description(),
    arguments: (cmd as any).registeredArguments?.map((a: any) => {
      const arg: Record<string, unknown> = {
        name: a.name(),
        required: a.required || requiredWithoutTty.includes(a.name()),
        variadic: a.variadic,
        description: a.description,
      };
      if (alternatives[a.name()]) arg.alternatives = alternatives[a.name()];
      return arg;
    }) ?? [],
    options: cmd.options.map((o: any) => {
      const takesValue = o.required || o.optional;
      const repeatable = Array.isArray(o.defaultValue);
      const opt: Record<string, unknown> = {
        flags: o.flags,
        description: o.description,
        type: takesValue ? (repeatable ? 'string[]' : 'string') : 'boolean',
        // `o.required` on an Option means "this flag takes a value", not "you must pass
        // this flag" — reading it as the latter marked every valued option required.
        required: o.mandatory === true,
        default: o.defaultValue,
      };
      if (repeatable) opt.repeatable = true;
      if (OPTION_ENUMS[o.long]) opt.enum = OPTION_ENUMS[o.long];
      return opt;
    }),
  };
}
