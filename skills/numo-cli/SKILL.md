---
name: numo-cli
description: Manage ADHD tasks, routines and community via Numo CLI
version: 1.5.0 # x-release-please-version
license: MIT
---

# numo-cli

CLI for [Numo](https://www.npmjs.com/package/numo-cli) — the ADHD planner app. Tasks, routines, community. For humans and AI agents.

## Protocol

- **Server:** Set `NUMO_API_URL=https://api.numo.ai` (or your API server). All data and auth goes through this endpoint. A custom (non-`numo.ai`, non-loopback) host requires `NUMO_ALLOW_CUSTOM_HOST=1` — a guard against sending credentials to an untrusted host.
- **Auth:** `numo login` or set `NUMO_TOKEN=<idToken>` env var. Check: `numo whoami --json`. Credentials at `~/.config/numo/` (or `NUMO_CONFIG_DIR`).
- **Output:** Non-TTY auto-outputs JSON. Use `--json` to force. Field selection: `--json id,text,completed`.
- **Dates:** Accepts ISO (`2026-03-27`) and natural language (`tomorrow`, `next monday`, `in 3 days`).
- **Errors:** Structured JSON to stderr: `{ error: { kind, code, message, suggestion, retryable } }`. Semantic exit codes (77=auth, 100=not found, 2=usage).
- **Batch:** `numo tasks list --json | jq -r '.tasks[].id' | numo tasks complete --stdin` — NDJSON output; one error won't stop the rest, but any failure makes the process exit non-zero.
- **Idempotency:** `numo tasks create "..." --client-task-id <stable-id>` — retrying with the same id returns the existing task (`idempotentReplay: true`) instead of creating a duplicate. Use it whenever an agent may retry.
- **Diagnostics:** `numo doctor --json` checks auth, connectivity, Node version.
- **Discovery:** `numo commands --json` lists all commands. `numo schema "tasks create"` returns option `type`/`enum`/`repeatable`/`default` — enough to build a call without guessing.

## Commands

```bash
# Create (positional text or --text; private + inserted at top by default)
numo tasks create "Buy milk"                           # Today, private
numo tasks create "Meeting" --due "tomorrow 14:30" --tags Work
numo tasks create "Standup" --repeat weekly --weekdays Mon,Wed,Fri
numo tasks create "Pay rent" --repeat monthly --month-days 1
numo tasks create "Read later" --backlog               # Someday / no due date
numo tasks create "Trip" --subtask "Book hotel" --subtask "Pack"   # repeatable
numo tasks create "Deploy" --client-task-id abc-123    # idempotent (safe to retry)

# Tasks
numo tasks list                                        # Today (includes overdue carry-over)
numo tasks list --date 2026-03-27 --json id,text       # Field selection
numo tasks list --yesterday                            # also --tomorrow
numo tasks list --backlog --tag Work                   # Filtered
numo tasks get <id>                                    # detail incl. subtasks
numo tasks update <id> --text "..." --due 2026-03-28
numo tasks update <id> --repeat none                   # stop repeating
numo tasks update <id> --backlog                       # clear due date
numo tasks delete <id> --yes                           # Skip confirmation
numo tasks delete --stdin                              # Batch from pipe (NDJSON)
numo tasks complete <id> --date "2026-03-27 09:00"     # today/yesterday only
numo tasks complete --stdin                            # Batch from pipe
numo tasks uncomplete <historyId>

# Community (read-only)
numo posts list                                        # --cursor/--limit for pages
numo posts get <id>
numo posts comments <postId>
numo posts replies <postId> <commentId>

# Auth & Utils
numo login [--phone]
numo logout
numo whoami --json
numo doctor --json
numo profile --json

# Discovery (drive the CLI without guessing)
numo commands --json                     # list every command
numo schema "tasks create"               # option types / enums / defaults for one command
```

## Common Mistakes

1. **Not logged in** — Run `numo login` first. CI/agents: `export NUMO_TOKEN=<idToken>`.
2. **Wrong date format** — Use ISO `YYYY-MM-DD` or natural language. `03/27/2026` won't work.
3. **Ignoring exit codes** — 0=success, 77=auth required, 100=not found, 2=bad usage. Always check.
4. **Large unfiltered lists** — Use `--date`, `--tag`, `--backlog`, or `--json id,text` to reduce output.
