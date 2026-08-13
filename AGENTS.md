# AGENTS.md — numo-cli for AI Agents

Instructions for AI agents (Claude, GPT, Cursor, Copilot, etc.) integrating with [numo-cli](https://www.npmjs.com/package/numo-cli).

## What is numo-cli?

`numo` is the command-line client for the **Numo ADHD planner** — programmatic access to tasks, community posts, and profiles for any agent that can run shell commands. Invoke it as `numo <command>`; assume it is already installed and on `PATH`.

## Authentication

### No account yet

```bash
numo register            # or the hidden alias: numo signup
```

Creates the account and signs in, so the next command is already authenticated. A
verification link is emailed to the address — see **Email verification** below for
what it gates.

If the address is already registered under a different password, `register` exits
`101` / `CONFLICT`. A password reset may have been mailed to the address; the CLI
cannot see whether one went out and does not claim otherwise.

Running bare `numo` with no credentials prints this same choice and exits `77`. It
never starts a login flow on its own.

### Interactive (humans)

```bash
numo login
```
Prompts for email + password, or use `--phone` for SMS OTP. Credentials are stored locally.

`numo login --phone` with a number that has no account **creates one**. It is a
registration path as much as a login one.

### Non-interactive (agents / CI)

**For long-running sessions (recommended) — email + password via env vars:**

```bash
export NUMO_LOGIN_EMAIL="you@example.com"
export NUMO_LOGIN_PASSWORD="..."
numo login --json        # or: numo register --json, same two variables
# stdout: {"ok":true,"uid":"...","email":"...","idToken":"...","idTokenExpiry":...}
```

Credentials are cached locally and the ID token is refreshed **lazily** — the next
command that needs a token renews it if the stored one is close to expiry. Nothing
runs in the background, so a session left idle for hours still works on its next
command.

> **Both of these put secrets where they are easy to leak.** `NUMO_LOGIN_PASSWORD`
> is a real account password in the environment, and `login --json` prints
> `idToken` on stdout, which lands in CI logs. Redact them, or prefer a short-lived
> `NUMO_TOKEN` for one-shot work.

**For one-shot calls — pre-existing ID token:**

```bash
export NUMO_TOKEN="<id-token>"
numo tasks list --json
```

`NUMO_TOKEN` does **not** auto-refresh — it is treated as opaque, single-use credentials. When the ID token expires (typically ~1 hour after issue), API calls will start returning 401 with no recovery path. Use this only for short scripts; otherwise prefer the email/password path above. Inspect remaining validity with `numo whoami --json` (decodes the JWT `exp` claim and reports `autoRefresh: false`).

### Email verification

Accounts created after the requirement was introduced need a verified email (or a
verified phone) before `numo tasks create` will work; older accounts are exempt and
keep working unverified. Everything else — listing, editing, completing, deleting —
is never gated.

A phone account satisfies the requirement without any email at all, which makes
`numo login --phone` a way past it. That carve-out is deliberate: a phone number is
only ever stored after an OTP, so it is already a verified identity.

```bash
numo verify-email --json                 # resend the verification email
numo verify-email --code <oobCode>       # redeem the code from the link
```

`--code` takes the `oobCode` query parameter of the link in the verification email.
It removes the need for a **browser**, not for an inbox: an agent that can read the
mailbox can finish verification in the terminal.

**Do not gate your own calls on `numo whoami`.** Its `emailVerified` is read from
the stored token, whose claim is fixed when the token is minted and stays stale for
up to an hour after the link is clicked — the payload says so via
`emailVerifiedSource: "cached_token"` and `emailVerifiedStale: true`. The
authoritative answer is the response to the request you actually make; `numo doctor`
asks the server live and reports it as the `verification` check.

### Ending a session

```bash
numo logout --json       # → {"loggedOut":true,"envTokenStillSet":false}
```

Deletes the stored credentials. `NUMO_TOKEN` is an environment variable and is not
cleared — `envTokenStillSet: true` means the process is still authenticated through
it and you must unset it separately.

**Custom server host:** by default credentials are only sent to `*.numo.ai` (or loopback). To point `NUMO_API_URL` at a self-hosted/staging host, set `NUMO_ALLOW_CUSTOM_HOST=1` — otherwise credential-sending commands fail with a `CONFIG_ERROR` (exit 78). Offline commands (`commands`, `schema`, `--help`) are never gated.

**Where credentials live:** `$NUMO_CONFIG_DIR`, else `$XDG_CONFIG_HOME/numo`, else
`~/.config/numo` (a legacy `~/.numo` is migrated on first run). The file is written
`0600`. Set `NUMO_CONFIG_DIR` to keep parallel sessions — or a test account — from
overwriting each other.

## JSON Mode

All commands output JSON when:
1. stdout is piped (automatic detection)
2. `--json` flag is passed
3. `-q` / `--quiet` flag is passed (implies `--json`, suppresses interactive output)

`--json` also takes a comma-separated field list to trim the payload:

```bash
numo tasks list --json id,text,dueDate
```

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
numo doctor --json            # Health check (DNS, TLS, /api/health, auth, verification)
numo guide                    # This document
numo completion zsh           # Shell completion script (zsh only)
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
    "kind": "AUTH_FORBIDDEN",
    "code": 77,
    "message": "Please verify your email before creating tasks. Check your inbox, or run: numo verify-email",
    "retryable": false
  }
}
```

`message` is whatever the server said, verbatim. `suggestion` (a command to run) and
`hint` are added by the CLI and are not always present — branch on `kind` and the
exit code, never on the wording.

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
| `130`| Interrupted (SIGINT) |
| `143`| Terminated (SIGTERM) |

## Tips for Agents

- Always pass `--json` or `-q` for structured output.
- Use `numo commands --json` and `numo schema <command>` for runtime introspection. Both payloads include `schemaVersion` and `cliVersion` at the root — agents that pin behavior should branch on `schemaVersion`. The two are versioned independently; `numo schema` is at `"2"`.
- In `numo schema`, `required: true` means **you must supply this** — nothing else can. Some positionals are declared optional only so an interactive run can prompt for them; for an agent they are still required, and the schema says so. A positional with `alternatives` (e.g. `["--stdin"]`) is genuinely optional: supply it, or use what `alternatives` names.
- Natural language dates work for both `--date` and `--due`: `"tomorrow"`, `"next monday"`, `"in 3 days"`.
- Task IDs are stable; store them for later operations.
- **Retrying `tasks create` safely:** pass `--client-task-id <your-id>`. A retry with the same id returns the task already created instead of a duplicate — use it whenever a create might be replayed after a timeout.
- `numo tasks create` defaults to **private** in every mode (see "JSON Mode" above) and inserts new tasks at the top of the list. Pass `--public` to make a task public.
- For rate-limited errors (`429`), the response includes `retryAfter` (seconds) and `retryable: true`.
- **PII in profile output:** `numo profile --json` includes `photoURL`, a signed storage URL containing a long-lived access token in the query string. Do not pipe `profile` output to public logs, build outputs, or screenshots — the URL grants read access to the avatar bytes for as long as it stays valid.
