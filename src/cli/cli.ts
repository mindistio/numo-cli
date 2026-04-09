import { Command } from 'commander';
import pc from 'picocolors';
import { login } from './auth/login';
import { register } from './auth/register';
import { clearCredentials, loadCredentials } from './auth/credentials';
import { registerTasksCommands } from './commands/tasks';
import { requireUid } from './lib/uid';
import { createTask } from './services/tasks';
import { runCreate } from './lib/actions';
import { formatKarmaGain } from './lib/format';
import { SYM } from './lib/symbols';
import { parseHumanDate } from './lib/parse-date';
import type { TaskCreateResponse } from './types/api';

import { registerPostsCommands } from './commands/posts';
import { registerProfileCommands } from './commands/profile';
import { registerDoctorCommand } from './commands/doctor';
import { migrateIfNeeded } from './lib/dirs';
import { checkForUpdate } from './lib/update-check';
import { outputError, printJson } from './lib/output';
import { isInteractive } from './lib/tty';
import { ExitCode } from './lib/errors';

declare const __CLI_VERSION__: string;
const CLI_VERSION = typeof __CLI_VERSION__ !== 'undefined' ? __CLI_VERSION__ : '0.0.0-dev';

const program = new Command();

program
  .name('numo')
  .description('CLI for Numo — programmatic access for humans and AI agents')
  .version(CLI_VERSION)
  .option('--json [fields]', 'Output as JSON (optionally: comma-separated field names)')
  .option('-q, --quiet', 'Suppress interactive output, implies --json')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.optsWithGlobals();
    if (opts.quiet) {
      thisCommand.setOptionValue('json', true);
    }
  })
  .addHelpText('after', `
${pc.bold('Output modes:')}
  Interactive (TTY)     Tables, colors, spinners
  Piped / --json        Clean JSON for scripting and agents

${pc.bold('Examples:')}
  ${pc.dim('$')} numo login
  ${pc.dim('$')} numo tasks list --date 2025-01-15
  ${pc.dim('$')} numo tasks create --text "Buy groceries" --due 2025-01-16`);

program
  .command('login')
  .description('Login with your Numo account')
  .option('--phone', 'Login with phone number (SMS OTP)')
  .action(async (opts) => { await login(opts); })
  .addHelpText('after', `
Examples:
  $ numo login               # Interactive (email/password)
  $ numo login --phone       # SMS OTP flow`);

program
  .command('register')
  .description('Create a new Numo account')
  .option('--email <email>', 'Email address')
  .option('--password <password>', 'Password (min 6 chars; visible in ps/history — prefer interactive mode)')
  .action(async (opts) => { await register(opts); })
  .addHelpText('after', `
Examples:
  $ numo register                                        # Interactive
  $ numo register --email user@example.com --password s3cret   # Non-interactive`);

program
  .command('logout')
  .description('Clear stored credentials')
  .action(() => {
    clearCredentials();
    console.log(pc.green('Logged out.'));
  });

program
  .command('whoami')
  .description('Show current auth status (no API call)')
  .action(function(this: Command) {
    const opts = this.optsWithGlobals();
    const asJson = !!(opts.json || opts.quiet || !isInteractive());

    const creds = loadCredentials();

    if (!creds) {
      if (asJson) {
        console.error(JSON.stringify({ error: { message: 'Not logged in', code: 'AUTH_REQUIRED' } }));
      } else {
        console.error(`${pc.red('Not logged in')}\n\n  $ numo login\n`);
      }
      process.exit(ExitCode.NO_PERM);
      return;
    }

    const tokenValid = !!(creds.idToken && creds.idTokenExpiry && Date.now() < creds.idTokenExpiry);
    const expiresIn = creds.idTokenExpiry ? Math.max(0, Math.floor((creds.idTokenExpiry - Date.now()) / 1000)) : 0;
    const source = process.env.NUMO_TOKEN ? 'NUMO_TOKEN' : 'credentials_file';

    if (asJson) {
      printJson({ email: creds.email, uid: creds.uid, tokenValid, expiresIn, source });
    } else {
      console.log(`  ${pc.bold('Email')}  ${creds.email}`);
      console.log(`  ${pc.bold('UID')}    ${creds.uid}`);
      console.log(`  ${pc.bold('Token')}  ${tokenValid ? pc.green(`valid (expires in ${Math.floor(expiresIn / 60)}m)`) : pc.yellow('expired (will auto-refresh)')}`);
      console.log(`  ${pc.bold('Auth')}   ${source === 'NUMO_TOKEN' ? 'NUMO_TOKEN env var' : '~/.numo/credentials.json'}`);
    }
  });

registerTasksCommands(program);

program
  .command('add [text...]')
  .description('Quick-add a task (today, public, no wizard)')
  .option('--due <date>', 'Due date YYYY-MM-DD (default: today)')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--public', 'Make task public (default)')
  .option('--private', 'Make task private')
  .action(async function (this: Command, textParts?: string[]) {
    const opts = this.optsWithGlobals();
    const uid = requireUid();
    const text = textParts?.join(' ');
    if (!text) {
      console.error('Usage: numo add "task text"');
      process.exit(ExitCode.USAGE);
    }
    const body: Record<string, unknown> = {
      text,
      dueDate: opts.due ? (parseHumanDate(opts.due) ?? opts.due) : new Date().toISOString().slice(0, 10),
    };
    if (opts.tags) body.tags = opts.tags.split(',');
    if (opts.public) body.isPublic = true;
    if (opts.private) body.isPublic = false;

    await runCreate({
      global: opts,
      fn: () => createTask(uid, body),
      dataKey: 'task',
      spinnerMessage: 'Creating task...',
      onInteractive: (_task, payload: TaskCreateResponse) => {
        const { task, karma } = payload;
        const check = pc.green(SYM.check);
        console.log(`\n  ${check} Created  ${task.text}  ${pc.dim(task.id)}`);
        if (karma) console.log(`    ${formatKarmaGain(karma)}`);
        console.log('');
      },
    });
  });

registerPostsCommands(program);
registerProfileCommands(program);
registerDoctorCommand(program);

program
  .command('commands')
  .description('List all available commands')
  .action(function (this: Command) {
    const opts = this.optsWithGlobals();
    const useJson = !!(opts.json || opts.quiet || !isInteractive());

    const commands: { name: string; description: string; options: string[] }[] = [];
    function walk(cmd: Command, prefix: string) {
      for (const sub of cmd.commands) {
        const fullName = prefix ? `${prefix} ${sub.name()}` : sub.name();
        if (sub.commands.length > 0) {
          walk(sub, fullName);
        } else {
          commands.push({
            name: fullName,
            description: sub.description(),
            options: sub.options.map((o: any) => o.flags),
          });
        }
      }
    }
    walk(program, '');

    if (useJson) {
      console.log(JSON.stringify({ commands }));
    } else {
      console.log('');
      let lastGroup = '';
      for (const cmd of commands) {
        const group = cmd.name.split(' ')[0];
        if (group !== lastGroup) {
          if (lastGroup) console.log('');
          console.log(`  ${pc.bold(group.charAt(0).toUpperCase() + group.slice(1) + ':')}`);
          lastGroup = group;
        }
        console.log(`    numo ${cmd.name.padEnd(30)} ${pc.dim(cmd.description)}`);
      }
      console.log(`\n  ${pc.dim('Run numo <command> --help for details.')}\n`);
    }
  });

function buildCommandSchema(cmd: Command, fullName: string): Record<string, unknown> {
  return {
    name: fullName,
    description: cmd.description(),
    arguments: (cmd as any).registeredArguments?.map((a: any) => ({
      name: a.name(),
      required: a.required,
      description: a.description,
    })) ?? [],
    options: cmd.options
      .filter((o: any) => !['--json', '-q, --quiet'].includes(o.flags))
      .map((o: any) => ({
        flags: o.flags,
        description: o.description,
        required: o.required,
        default: o.defaultValue,
      })),
  };
}

program
  .command('schema [command]')
  .description('Print JSON schema for a command (for AI agents)')
  .action(function (this: Command, cmdPath?: string) {
    if (!cmdPath) {
      const schemas: Record<string, unknown>[] = [];
      function walk(cmd: Command, prefix: string) {
        for (const sub of cmd.commands) {
          const fullName = prefix ? `${prefix} ${sub.name()}` : sub.name();
          if (sub.commands.length > 0) walk(sub, fullName);
          else schemas.push(buildCommandSchema(sub, fullName));
        }
      }
      walk(program, '');
      console.log(JSON.stringify({ commands: schemas }, null, 2));
      return;
    }

    const parts = cmdPath.split(' ');
    let cmd: Command = program;
    for (const part of parts) {
      const sub = cmd.commands.find((c: Command) => c.name() === part);
      if (!sub) {
        console.error(`Unknown command: ${cmdPath}`);
        console.error(`Available: ${cmd.commands.map((c: Command) => c.name()).join(', ')}`);
        process.exit(ExitCode.USAGE);
      }
      cmd = sub;
    }
    console.log(JSON.stringify(buildCommandSchema(cmd, cmdPath), null, 2));
  });

program
  .command('completion <shell>')
  .description('Generate shell completion script')
  .action(function (shell: string) {
    if (shell !== 'zsh') {
      console.error(`Unsupported shell: ${shell}. Currently only 'zsh' is supported.`);
      process.exit(ExitCode.USAGE);
    }

    const lines: string[] = ['#compdef numo', '', '_numo() {', '  local -a commands', ''];

    // Collect top-level commands
    const topLevel: { name: string; desc: string; subs: { name: string; desc: string; opts: string[] }[] }[] = [];
    for (const cmd of program.commands) {
      const subs: { name: string; desc: string; opts: string[] }[] = [];
      if (cmd.commands.length > 0) {
        for (const sub of cmd.commands) {
          subs.push({
            name: sub.name(),
            desc: sub.description().replace(/'/g, ''),
            opts: sub.options.map((o: any) => o.long || o.short).filter(Boolean),
          });
        }
      }
      topLevel.push({
        name: cmd.name(),
        desc: cmd.description().replace(/'/g, ''),
        subs,
        opts: cmd.options.map((o: any) => o.long || o.short).filter(Boolean),
      } as any);
    }

    // Top-level commands list
    lines.push('  commands=(');
    for (const cmd of topLevel) {
      lines.push(`    '${cmd.name}:${cmd.desc}'`);
    }
    lines.push('  )', '');

    // Main _arguments
    lines.push('  _arguments -C \\');
    lines.push("    '--json[Output as JSON]' \\");
    lines.push("    '-q[Suppress interactive output]' \\");
    lines.push("    '--quiet[Suppress interactive output]' \\");
    lines.push("    '1:command:->cmd' \\");
    lines.push("    '*::arg:->args'", '');

    lines.push('  case "$state" in');
    lines.push('    cmd)');
    lines.push('      _describe "command" commands');
    lines.push('      ;;');
    lines.push('    args)');
    lines.push('      case "${words[1]}" in');

    for (const cmd of topLevel) {
      if (cmd.subs.length > 0) {
        lines.push(`        ${cmd.name})`);
        lines.push('          local -a subcmds');
        lines.push('          subcmds=(');
        for (const sub of cmd.subs) {
          lines.push(`            '${sub.name}:${sub.desc}'`);
        }
        lines.push('          )');
        lines.push('          _describe "subcommand" subcmds');
        lines.push('          ;;');
      }
    }

    lines.push('      esac');
    lines.push('      ;;');
    lines.push('  esac');
    lines.push('}', '', 'compdef _numo numo');

    console.log(lines.join('\n'));
  })
  .addHelpText('after', `
Examples:
  $ numo completion zsh > ~/.zsh/completions/_numo
  $ echo 'fpath=(~/.zsh/completions $fpath); autoload -Uz compinit; compinit' >> ~/.zshrc`);

migrateIfNeeded();

// Graceful shutdown on SIGINT/SIGTERM — clean up spinner artifacts and exit
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    // Clear any in-progress spinner line on stderr
    process.stderr.write('\r\x1b[K');
    process.exit(128 + (signal === 'SIGINT' ? 2 : 15));
  });
}

program.parseAsync(process.argv)
  .catch((err) => {
    outputError(err, !!program.opts().json);
  })
  .finally(() => {
    checkForUpdate(CLI_VERSION);
  });
