# AGENTS.md — numo-cli for AI Agents

Instructions for AI agents (Claude, GPT, Cursor, Copilot, etc.) integrating with [numo-cli](https://www.npmjs.com/package/numo-cli).

## What is numo-cli?

`numo` is the command-line client for the **Numo ADHD planner** — programmatic access to tasks, community posts, and profiles for any agent that can run shell commands. Invoke it as `numo <command>`; assume it is already installed and on `PATH`.

## Authentication

### Interactive (humans)

```bash
numo login
```
Prompts for email + password, or use `--phone` for SMS OTP. Credentials are stored locally.

### Non-interactive (agents / CI)

**For long-running sessions (recommended) — email + password via env vars:**

```bash
export NUMO_LOGIN_EMAIL="you@example.com"
export NUMO_LOGIN_PASSWORD="..."
numo login --json
# stdout: {"ok":true,"uid":"...","email":"...","idToken":"...","idTokenExpiry":...}
```

This path caches credentials locally and auto-refreshes the ID token in the background — every subsequent `numo` invocation in the session keeps working past the ~1-hour ID-token expiry.

**For one-shot calls — pre-existing ID token:**

```bash
export NUMO_TOKEN="<id-token>"
numo tasks list --json
```

`NUMO_TOKEN` does **not** auto-refresh — it is treated as opaque, single-use credentials. When the ID token expires (typically ~1 hour after issue), API calls will start returning 401 with no recovery path. Use this only for short scripts; otherwise prefer the email/password path above. Inspect remaining validity with `numo whoami --json` (decodes the JWT `exp` claim and reports `autoRefresh: false`).

**Custom server host:** by default credentials are only sent to `*.numo.ai` (or loopback). To point `NUMO_API_URL` at a self-hosted/staging host, set `NUMO_ALLOW_CUSTOM_HOST=1` — otherwise credential-sending commands fail with a `CONFIG_ERROR` (exit 78). Offline commands (`commands`, `schema`, `--help`) are never gated.

## JSON Mode

All commands output JSON when:
1. stdout is piped (automatic detection)
2. `--json` flag is passed
3. `-q` / `--quiet` flag is passed (implies `--json`, suppresses interactive output)

`numo tasks create` defaults to **private** tasks (`isPublic: false`) in every mode — interactive shells, JSON mode, scripts. Public tasks require an explicit `--public` flag (or picking "Public" in the interactive Visibility prompt). This is a stability guarantee per W-121 — the CLI must not accidentally expose tasks to the public community feed. New tasks are always inserted at the **top** of the list (`listPosition: 'top'`).

## Core Commands

### Tasks

```bash
# List today's tasks
numo tasks list --json
# → {"tasks":[...],"count":N,"pendingCount":N,"completedCount":N}

# List by date (accepts natural language: tomorrow, next monday, in 3 days)
numo tasks list --date "next monday" --json

# List backlog (undated tasks)
numo tasks list --backlog --json

# Create a task (positional text or --text; private + inserted at top by default)
numo tasks create "Buy groceries" --due "2026-04-03" --json
numo tasks create --text "Weekly review" --due "next monday" --json
# → {"task":{...},"karma":N}

# Quick add (today, private), and recurring routines
numo tasks create "Call dentist" --due tomorrow --tags Health --json
numo tasks create "Standup" --repeat weekly --weekdays Mon,Wed,Fri --json
numo tasks create "Read later" --backlog --json
numo tasks create "Trip" --subtask "Book hotel" --subtask "Pack" --json   # repeatable --subtask

# Get task details
numo tasks get <taskId> --json

# Update a task
numo tasks update <taskId> --text "New text" --due "2026-04-05" --json
numo tasks update <taskId> --no-time --json   # strip time-of-day (all-day task)

# Complete a task
numo tasks complete <taskId> --json
# → {"completed":true,"task":{...}|null,"taskHistory":{...},"karma":N,"checksInRow":N}

# Uncomplete (restore from history)
numo tasks uncomplete <historyId> --json

# Delete a task (archives it)
numo tasks delete <taskId> --json
```

### Recurring reminders (natural-language requests)

A request like *"remind me to plan my week every Monday"* maps to a recurring task. There is no separate "reminder" entity — a reminder **is** a task with a `remindDate`. Resolve two things the phrasing leaves implicit:

1. **Anchor the first occurrence.** `--repeat weekly --weekdays Mon` alone sets `dueDate` to *today*, so the first instance can land before the intended weekday. Pass `--due "next monday"` to anchor it.
2. **"Remind" needs a time.** An all-day task has `remindDate: null` (no notification fires). Add a time so the app derives `remindDate` (default lead ~3h before due).

```bash
# "remind me to plan my week every Monday" →
numo tasks create "Plan my week" --due "next monday 09:00" --repeat weekly --weekdays Mon --json
# → dueDate 2026-06-22 09:00, remindDate 2026-06-22 06:00, repeat weekly on Mon
```

Pick a sensible default time (e.g. 09:00) or ask the user. `--due` accepts natural language (`"next monday"`, `"next monday 09:00"`).

### Community (read-only)

```bash
numo posts list --json                       # list posts (with commentsCount + likesCount)
numo posts get <postId> --json               # post details
numo posts comments <postId> --json          # list comments on a post
numo posts replies <postId> <commentId> --json   # list replies to a comment
```

### Profile & Discovery

```bash
numo profile --json           # Current user profile
numo commands --json          # List all available commands
numo schema "tasks create"    # JSON schema for a specific command
numo doctor --json            # Health check (DNS, TLS, /api/health, auth)
```

## Batch Operations

```bash
# Complete multiple tasks via stdin (one ID per line)
echo -e "taskId1\ntaskId2" | numo tasks complete --stdin --json

# Pipe IDs from list
numo tasks list --json --tag Work | jq -r '.tasks[].id' | numo tasks complete --stdin
```

## Error Handling

All errors return structured JSON on stderr:

```json
{
  "error": {
    "kind": "NOT_FOUND",
    "code": 100,
    "message": "Task not found",
    "suggestion": "numo tasks list"
  }
}
```

### Error kinds

`AUTH_REQUIRED`, `AUTH_EXPIRED`, `AUTH_FORBIDDEN`, `INVALID_INPUT`, `MISSING_ARGUMENT`, `NOT_FOUND`, `CONFLICT`, `NETWORK_ERROR`, `TIMEOUT`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`, `CONFIG_ERROR`, `INTERNAL`, `UNKNOWN`.

### Exit codes

| Code | Meaning |
|------|---------|
| `0`  | OK |
| `1`  | General error |
| `2`  | Usage error (missing argument, invalid input) |
| `69` | Service unavailable (network, server down) |
| `75` | Temporary failure (timeout, rate limit) |
| `77` | No permission (auth required / forbidden) |
| `78` | Configuration error (missing env var, etc.) |
| `100`| Not found |
| `101`| Conflict |

## Tips for Agents

- Always pass `--json` or `-q` for structured output.
- Use `numo commands --json` and `numo schema <command>` for runtime introspection. Both payloads include `schemaVersion` and `cliVersion` at the root — agents that pin behavior should branch on `schemaVersion`.
- Natural language dates work for both `--date` and `--due`: `"tomorrow"`, `"next monday"`, `"in 3 days"`.
- Task IDs are stable; store them for later operations.
- `numo tasks create` defaults to **private** in every mode (see "JSON Mode" above) and inserts new tasks at the top of the list. Pass `--public` to make a task public.
- For rate-limited errors (`429`), the response includes `retryAfter` (seconds) and `retryable: true`.
- **PII in profile output:** `numo profile --json` includes `photoURL`, a signed storage URL containing a long-lived access token in the query string. Do not pipe `profile` output to public logs, build outputs, or screenshots — the URL grants read access to the avatar bytes for as long as it stays valid.
