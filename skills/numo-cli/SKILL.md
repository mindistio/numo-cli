---
name: numo-cli
description: Manage ADHD tasks, routines and community via Numo CLI
version: 1.0.1 # x-release-please-version
license: MIT
---

# numo-cli

CLI for [Numo](https://www.npmjs.com/package/numo-cli) — the ADHD planner app. Tasks, routines, community. For humans and AI agents.

## Protocol

- **Server:** Set `NUMO_API_URL=https://api.numo.ai` (or your API server). All data and auth goes through this endpoint.
- **Auth:** `numo login` or set `NUMO_TOKEN=<idToken>` env var. Check: `numo whoami --json`. Credentials at `~/.config/numo/` (or `NUMO_CONFIG_DIR`).
- **Output:** Non-TTY auto-outputs JSON. Use `--json` to force. Field selection: `--json id,text,completed`.
- **Dates:** Accepts ISO (`2026-03-27`) and natural language (`tomorrow`, `next monday`, `in 3 days`).
- **Errors:** Structured JSON to stderr: `{ error: { kind, code, message, suggestion, retryable } }`. Semantic exit codes (77=auth, 100=not found, 2=usage).
- **Batch:** `numo tasks list --json | jq -r '.tasks[].id' | numo tasks complete --stdin` — NDJSON output, one error won't stop the rest.
- **Diagnostics:** `numo doctor --json` checks auth, connectivity, Node version.
- **Discovery:** `numo commands --json` lists all commands. `numo schema tasks create` returns option schema.

## Commands

```bash
# Quick capture
numo add "Buy milk"                                    # Today, public, no wizard
numo add "Meeting" --due tomorrow --tags Work
numo add "Secret" --due friday --private

# Tasks
numo tasks list                                        # Today's tasks
numo tasks list --date 2026-03-27 --json id,text       # Field selection
numo tasks list --yesterday                            # Yesterday's tasks
numo tasks list --tomorrow                             # Tomorrow's tasks
numo tasks list --backlog --tag Work                   # Filtered
numo tasks get <id>
numo tasks create --text "..." --due "next monday" --tags Health --difficulty 2
numo tasks create --text "..." --private --note "details" --priority 0.5 --duration 30
numo tasks update <id> --text "..." --due 2026-03-28
numo tasks update <id> --public --note "updated" --priority 1 --duration 60
numo tasks delete <id> --yes                           # Skip confirmation
numo tasks delete --stdin                              # Batch from pipe
numo tasks complete <id>
numo tasks complete --stdin                            # Batch from pipe
numo tasks uncomplete <historyId>

# Auth & Utils
numo login [--phone]
numo register --email user@example.com --password ******
numo logout
numo whoami
numo doctor
numo profile
```

## Discovery & Completions

```bash
numo commands --json                     # List all available commands
numo schema tasks create                 # JSON schema for a command (for AI agents)
numo completion zsh                      # Shell completions (zsh)
```

## Common Mistakes

1. **Not logged in** — Run `numo login` first. CI/agents: `export NUMO_TOKEN=<idToken>`.
2. **Wrong date format** — Use ISO `YYYY-MM-DD` or natural language. `03/27/2026` won't work.
3. **Ignoring exit codes** — 0=success, 77=auth required, 100=not found, 2=bad usage. Always check.
4. **Large unfiltered lists** — Use `--date`, `--tag`, `--backlog`, or `--json id,text` to reduce output.
