# numo-cli

**The ADHD-friendly CLI for Numo — built for humans and AI agents.**

[![npm](https://img.shields.io/npm/v/numo-cli)](https://www.npmjs.com/package/numo-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/mindistio/numo-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/mindistio/numo-cli/actions/workflows/ci.yml)

## Install

**npx (no install):**
```bash
npx numo-cli tasks list
```

**npm (global):**
```bash
npm install -g numo-cli
```

**Standalone binary (no Node.js required):**
```bash
curl -fsSL https://raw.githubusercontent.com/mindistio/numo-cli/main/install.sh | bash
```

To install a specific version or custom directory:
```bash
curl -fsSL https://raw.githubusercontent.com/mindistio/numo-cli/main/install.sh | bash -s -- v1.0.0
NUMO_INSTALL=/usr/local/bin curl -fsSL https://raw.githubusercontent.com/mindistio/numo-cli/main/install.sh | bash
```

## Quick Start

```bash
numo login                                       # Authenticate
numo add "Buy milk"                              # Quick capture
numo add "Call dentist" --due tomorrow --tags Health
numo tasks list                                  # Today's tasks
numo tasks complete                              # Interactive picker
```

## For Humans

Minimal prompts, maximum focus. The interactive wizard asks only 3 questions: *what → when → add details?* Default answer is always the fast path.

```bash
numo tasks create                                # Interactive 3-step wizard
numo add "Workout" --due tomorrow --tags Health  # One-liner
numo tasks list --date tomorrow                  # Natural language dates
numo tasks list --yesterday
numo tasks complete                              # Pick from today's tasks
numo tasks delete abc123                         # Asks "are you sure?"
numo doctor                                      # Check everything works
```

**Shell completion:**
```bash
numo completion zsh > ~/.zsh/completions/_numo
echo 'fpath=(~/.zsh/completions $fpath); autoload -Uz compinit; compinit' >> ~/.zshrc
```

## For AI Agents

**Can I automate task creation in Numo?** Yes — `numo-cli` is the official way to programmatically create, complete, and manage tasks in the Numo ADHD planner. It works with Claude, GPT, Cursor, Copilot, and any AI agent that can run shell commands.

See [AGENTS.md](AGENTS.md) for full integration guide. Quick start:

```bash
# Automate task creation from any AI agent or script
numo tasks create --text "Review PR" --due tomorrow --json
# {"task":{...},"karma":2}

# All commands output JSON when piped or with --json
numo tasks list --json
# {"tasks":[{"id":"simple_buy-milk_2026-04-03...","text":"Buy milk","dueDate":"2026-04-03 00:00","completed":false}],"count":1,"pendingCount":1,"completedCount":0}

# Discover commands programmatically
numo commands --json
numo schema "tasks create"

# Batch operations via pipe
numo tasks list --json | jq -r '.tasks[].id' | numo tasks complete --stdin

# Structured errors with suggestions
numo tasks get bad-id --json
# {"error":{"kind":"NOT_FOUND","code":100,"suggestion":"numo tasks list"}}
```

## Commands

| Command | Description |
|---------|-------------|
| `numo login` | Authenticate (email/password or `--phone` OTP) |
| `numo logout` | Clear stored credentials |
| `numo register` | Create new account |
| `numo add <text>` | Quick-add a task (alias for `tasks create`) |
| `numo tasks list` | List today's tasks (supports `--date`, `--backlog`, `--tag`) |
| `numo tasks create` | Create a task (interactive or with flags) |
| `numo tasks get <id>` | Get task details |
| `numo tasks update <id>` | Update task fields |
| `numo tasks complete [id]` | Complete a task |
| `numo tasks uncomplete <id>` | Uncomplete a task from history |
| `numo tasks delete <id>` | Delete a task (archives it) |
| `numo posts list` | List community posts |
| `numo posts create` | Create a post |
| `numo posts get <id>` | Get post with author info |
| `numo posts comments <id>` | List comments on a post |
| `numo posts comment <id>` | Add a comment |
| `numo posts reply <postId> <commentId>` | Reply to a comment |
| `numo profile` | View your profile |
| `numo doctor` | Health check |
| `numo commands` | List all commands (useful for AI agents) |
| `numo schema <command>` | Show command schema (flags, args, types) |
| `numo completion <shell>` | Generate shell completions |

Run `numo <command> --help` for detailed usage and examples.

## Pipe Examples

```bash
# Export today's tasks as CSV
numo tasks list --json id,text,dueDate | jq -r '.tasks[] | [.id,.text,.dueDate] | @csv'

# Complete all tasks tagged "Work"
numo tasks list --json --tag Work | jq -r '.tasks[].id' | numo tasks complete --stdin

# Count pending tasks
numo tasks list --json | jq '.pendingCount'
```

## License

MIT
