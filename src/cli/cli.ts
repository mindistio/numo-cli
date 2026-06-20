import { Command } from 'commander';
import pc from 'picocolors';
import { login } from './auth/login';
import { clearCredentials, loadCredentials } from './auth/credentials';
import { getCredentialsPath } from './lib/dirs';
import { registerTasksCommands } from './commands/tasks';

import { registerPostsCommands } from './commands/posts';
import { registerProfileCommands } from './commands/profile';
import { registerDoctorCommand } from './commands/doctor';
import { migrateIfNeeded } from './lib/dirs';
import { checkForUpdate } from './lib/update-check';
import { outputError, printJson } from './lib/output';
import { collectCommands, formatCommandMap } from './lib/command-map';
import { getAgentGuide } from './lib/guide';
import { isQuietMode } from './lib/quiet';
import { ExitCode, Errors } from './lib/errors';

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
  ${pc.dim('$')} numo tasks list
  ${pc.dim('$')} numo tasks create --text "Buy groceries" --due tomorrow

${pc.bold('Environment:')}
  NUMO_API_URL              API server URL
  NUMO_TOKEN                Pre-existing ID token (skips local credentials)
  NUMO_LOGIN_EMAIL          Email for non-interactive login
  NUMO_LOGIN_PASSWORD       Password for non-interactive login
  NUMO_NO_UPDATE_CHECK      Disable update notifications`);

program
  .command('login')
  .description('Login with your Numo account')
  .option('--phone', 'Login with phone number (SMS OTP)')
  .action(async function (this: Command) { await login(this.optsWithGlobals(), program); })
  .addHelpText('after', `
Examples:
  $ numo login                                        # Interactive (email/password)
  $ numo login --phone                                # SMS OTP flow
  $ NUMO_LOGIN_EMAIL=… NUMO_LOGIN_PASSWORD=… numo login --json   # Non-interactive (CI/agents)`);

program
  .command('logout')
  .description('Clear stored credentials')
  .action(() => {
    clearCredentials();
    console.log(pc.green('Logged out.'));
    if (process.env.NUMO_TOKEN) {
      console.log(pc.yellow('\n  Note: NUMO_TOKEN env var is still set. Unset it to fully de-authenticate.'));
    }
  })
  .addHelpText('after', `
Examples:
  $ numo logout

If NUMO_TOKEN env var is set, it is not cleared by logout. Unset it separately:
  $ unset NUMO_TOKEN`);

program
  .command('whoami')
  .description('Show current auth status (no API call)')
  .addHelpText('after', `
Examples:
  $ numo whoami
  $ numo whoami --json   # → {"email":"...","uid":"...","tokenValid":true,"expiresIn":N,"source":"..."}`)
  .action(function(this: Command) {
    const opts = this.optsWithGlobals();
    const asJson = isQuietMode(opts);

    const envToken = process.env.NUMO_TOKEN;
    const creds = loadCredentials();

    // NUMO_TOKEN env path: no credentials file needed. Decode the JWT `exp`
    // claim so we can report real validity instead of "AUTH_REQUIRED".
    // NUMO_TOKEN tokens do NOT auto-refresh — long-running scripts must use
    // NUMO_LOGIN_EMAIL / NUMO_LOGIN_PASSWORD instead.
    if (!creds && envToken) {
      let tokenValid = false;
      let expiresIn = 0;
      let email: string | null = null;
      let uid: string | null = null;
      try {
        const payloadB64 = envToken.split('.')[1] ?? '';
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'));
        if (typeof payload.exp === 'number') {
          const expMs = payload.exp * 1000;
          tokenValid = Date.now() < expMs;
          expiresIn = Math.max(0, Math.floor((expMs - Date.now()) / 1000));
        }
        if (typeof payload.email === 'string') email = payload.email;
        if (typeof payload.user_id === 'string') uid = payload.user_id;
        else if (typeof payload.sub === 'string') uid = payload.sub;
      } catch {
        // Malformed token — leave tokenValid=false.
      }
      if (asJson) {
        printJson({ email, uid, tokenValid, expiresIn, source: 'NUMO_TOKEN', autoRefresh: false });
      } else {
        if (email) console.log(`  ${pc.bold('Email')}  ${email}`);
        if (uid) console.log(`  ${pc.bold('UID')}    ${uid}`);
        console.log(`  ${pc.bold('Token')}  ${tokenValid ? pc.green(`valid (expires in ${Math.floor(expiresIn / 60)}m)`) : pc.red('expired or malformed')}`);
        console.log(`  ${pc.bold('Auth')}   NUMO_TOKEN env var ${pc.dim('(no auto-refresh; use NUMO_LOGIN_EMAIL/PASSWORD for long sessions)')}`);
      }
      // An expired/malformed NUMO_TOKEN is not usable and does not auto-refresh —
      // exit NO_PERM so agents gating on the exit code don't treat it as authenticated.
      if (!tokenValid) process.exitCode = ExitCode.NO_PERM;
      return;
    }

    if (!creds) {
      outputError(Errors.authRequired(), asJson);
      return;
    }

    const tokenValid = !!(creds.idToken && creds.idTokenExpiry && Date.now() < creds.idTokenExpiry);
    const expiresIn = creds.idTokenExpiry ? Math.max(0, Math.floor((creds.idTokenExpiry - Date.now()) / 1000)) : 0;
    const source = 'credentials_file';

    if (asJson) {
      printJson({ email: creds.email, uid: creds.uid, tokenValid, expiresIn, source, autoRefresh: true });
    } else {
      console.log(`  ${pc.bold('Email')}  ${creds.email}`);
      console.log(`  ${pc.bold('UID')}    ${creds.uid}`);
      console.log(`  ${pc.bold('Token')}  ${tokenValid ? pc.green(`valid (expires in ${Math.floor(expiresIn / 60)}m)`) : pc.yellow('expired (will auto-refresh)')}`);
      console.log(`  ${pc.bold('Auth')}   ${getCredentialsPath()}`);
    }
  });

registerTasksCommands(program);

registerPostsCommands(program);
registerProfileCommands(program);
registerDoctorCommand(program);

program
  .command('commands')
  .description('List all available commands')
  .action(function (this: Command) {
    const opts = this.optsWithGlobals();
    const useJson = isQuietMode(opts);

    const commands = collectCommands(program);

    if (useJson) {
      console.log(JSON.stringify({ schemaVersion: '1', cliVersion: CLI_VERSION, commands }));
    } else {
      console.log(`\n${formatCommandMap(commands)}`);
      console.log(`\n  ${pc.dim('Run numo <command> --help for details.')}\n`);
    }
  });

program
  .command('guide')
  .alias('agents')
  .description('Print the full agent integration guide (AGENTS.md)')
  .addHelpText('after', `
Examples:
  $ numo guide              # full agent guide (Markdown)
  $ numo agents             # alias
  $ numo guide --json       # → {"schemaVersion":"1","cliVersion":"...","guide":"..."}`)
  .action(function (this: Command) {
    const opts = this.optsWithGlobals();
    const useJson = isQuietMode(opts);
    const guide = getAgentGuide();

    if (useJson) {
      console.log(JSON.stringify({ schemaVersion: '1', cliVersion: CLI_VERSION, guide }));
    } else {
      console.log(guide);
    }
  });

// Allowed values for options that accept a closed set — surfaced so agents don't guess.
const OPTION_ENUMS: Record<string, ReadonlyArray<string | number>> = {
  '--repeat': ['daily', 'weekly', 'monthly', 'none'],
  '--difficulty': [0, 1, 2, 3],
};

function buildCommandSchema(cmd: Command, fullName: string): Record<string, unknown> {
  return {
    name: fullName,
    description: cmd.description(),
    arguments: (cmd as any).registeredArguments?.map((a: any) => ({
      name: a.name(),
      required: a.required,
      variadic: a.variadic,
      description: a.description,
    })) ?? [],
    options: cmd.options
      .filter((o: any) => !['--json', '-q, --quiet'].includes(o.flags))
      .map((o: any) => {
        const takesValue = o.required || o.optional;
        const repeatable = Array.isArray(o.defaultValue);
        const opt: Record<string, unknown> = {
          flags: o.flags,
          description: o.description,
          type: takesValue ? (repeatable ? 'string[]' : 'string') : 'boolean',
          required: o.required,
          default: o.defaultValue,
        };
        if (repeatable) opt.repeatable = true;
        if (OPTION_ENUMS[o.long]) opt.enum = OPTION_ENUMS[o.long];
        return opt;
      }),
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
      console.log(JSON.stringify({ schemaVersion: '1', cliVersion: CLI_VERSION, commands: schemas }, null, 2));
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
    console.log(JSON.stringify({ schemaVersion: '1', cliVersion: CLI_VERSION, ...buildCommandSchema(cmd, cmdPath) }, null, 2));
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

    const topLevel: { name: string; desc: string; subs: { name: string; desc: string; opts: string[] }[]; opts: string[] }[] = [];
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
      });
    }

    lines.push('  commands=(');
    for (const cmd of topLevel) {
      lines.push(`    '${cmd.name}:${cmd.desc}'`);
    }
    lines.push('  )', '');

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
