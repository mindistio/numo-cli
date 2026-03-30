# numo-cli

**The ADHD-friendly CLI for Numo — built for humans and AI agents.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/numoapp/numo-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/numoapp/numo-cli/actions/workflows/ci.yml)

## Why

- **ADHD-first design** — 3-step task creation, quick capture (`numo add "Buy milk"`), zero decision fatigue
- **AI agent ready** — structured JSON errors with suggestions, `--json` field selection, `--stdin` batch ops, `numo schema` for tool discovery
- **One binary, full access** — tasks, routines, community, profile. Same service layer as the iOS app

## Install

**Standalone binary (no Node.js required):**

```bash
curl -fsSL https://raw.githubusercontent.com/mindistio/numo-cli/main/install.sh | bash
```

This downloads the latest release for your platform (macOS/Linux, x64/arm64), verifies checksums, and adds `numo` to your PATH.

To install a specific version:

```bash
curl -fsSL https://raw.githubusercontent.com/mindistio/numo-cli/main/install.sh | bash -s -- v1.0.0
```

Custom install directory:

```bash
NUMO_INSTALL=/usr/local/bin curl -fsSL https://raw.githubusercontent.com/mindistio/numo-cli/main/install.sh | bash
```

**Via npm:**

```bash
npm install -g numo-cli
```

## Quick Start

```bash
# Login
numo login

# Quick capture — thought to task in one command
numo add "Buy milk"
numo add "Call dentist" --due tomorrow --tags Health

# View today's tasks
numo tasks list

# Complete a task (interactive picker if no ID)
numo tasks complete
```

## For Humans

**Minimal prompts, maximum focus.** The interactive wizard asks only 3 questions: *what → when → add details?* Default answer is always the fast path.

```bash
numo tasks create                                    # Interactive 3-step wizard
numo add "Workout" --due tomorrow --tags Health      # One-liner, no wizard
numo tasks list --date tomorrow                      # Natural language dates
numo tasks list --yesterday
numo tasks complete                                  # Pick from today's tasks
numo tasks delete abc123                             # Asks "are you sure?"
numo doctor                                          # Check everything works
```

**Shell completion:**
```bash
numo completion zsh > ~/.zsh/completions/_numo
echo 'fpath=(~/.zsh/completions $fpath); autoload -Uz compinit; compinit' >> ~/.zshrc
```

## For AI Agents

**Structured output, semantic errors, tool discovery.**

```bash
# Auth without interaction
export NUMO_TOKEN=<idToken>

# JSON with field selection (fewer tokens = cheaper)
numo tasks list --json id,text,completed

# Discover all commands programmatically
numo commands --json
numo schema "tasks create"

# Batch operations via pipe
numo tasks list --json | jq -r '.tasks[].id' | numo tasks complete --stdin

# Structured errors with suggestions
numo tasks get bad-id --json
# { "error": { "kind": "NOT_FOUND", "code": 100, "suggestion": "numo tasks list" } }

# Health check
numo doctor --json
```

## Commands

Run `numo <command> --help` for examples and options.

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
