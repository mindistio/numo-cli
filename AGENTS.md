# AGENTS.md — numo-cli for AI Agents

Instructions for AI agents (Claude, GPT, Cursor, Copilot, etc.) integrating with numo-cli.

## What is numo-cli?

A CLI for the **Numo ADHD planner app**. It provides programmatic access to tasks, community posts, and user profiles. Same service layer as the iOS app.

## Install

```bash
# Option 1: standalone binary (recommended, no Node.js required)
curl -fsSL https://raw.githubusercontent.com/mindistio/numo-cli/main/install.sh | bash

# Option 2: npx (no install)
npx numo-cli --version

# Option 3: global install
npm install -g numo-cli
```

## Authentication

```bash
numo login
```
Interactive login (email/password or `--phone` OTP). One-time setup — credentials are stored locally.

## JSON Mode

All commands output JSON when:
1. stdout is piped (automatic detection)
2. `--json` flag is passed
3. `-q` / `--quiet` flag is passed (implies `--json`, suppresses interactive output)

## Core Commands

### Tasks

```bash
# List today's tasks
numo tasks list --json
# → {"tasks":[...],"count":N,"pendingCount":N,"completedCount":N}

# List by date
numo tasks list --date 2026-04-03 --json

# List backlog (undated tasks)
numo tasks list --backlog --json

# Create a task
numo tasks create --text "Buy groceries" --due "2026-04-03" --json
numo tasks create --text "Weekly review" --due "next monday" --repeat weekly --json
# → {"task":{...},"karma":2}

# Quick add (alias)
numo add "Call dentist" --due tomorrow --tags Health --json

# Get task details
numo tasks get <taskId> --json

# Update a task
numo tasks update <taskId> --text "New text" --due "2026-04-05" --json

# Complete a task
numo tasks complete <taskId> --json
# → {"completed":true,"taskHistory":{...},"karma":N,"checksInRow":N}

# Uncomplete (restore from history)
numo tasks uncomplete <historyId> --json

# Delete a task (archives it)
numo tasks delete <taskId> --json
```

### Posts & Comments

```bash
numo posts list --json
numo posts create --title "My post" --body "Content" --tag general --json
# → {"post":{...},"karma":10}

numo posts comments <postId> --json
numo posts comment <postId> --text "Great post!" --json
# → {"comment":{...},"karma":10}

numo posts reply <postId> <commentId> --text "Thanks!" --json
# → {"reply":{...},"karma":10}
```

### Profile & Discovery

```bash
numo profile --json           # Current user profile
numo commands --json           # List all available commands
numo schema "tasks create"     # Show schema for a specific command
numo doctor --json             # Health check
```

## Batch Operations

```bash
# Complete multiple tasks via stdin
echo -e "taskId1\ntaskId2" | numo tasks complete --stdin --json

# Pipe task IDs from list
numo tasks list --json --tag Work | jq -r '.tasks[].id' | numo tasks complete --stdin
```

## Error Handling

All errors return structured JSON:
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

Error kinds: `NOT_FOUND`, `INVALID_INPUT`, `AUTH_REQUIRED`, `AUTH_FORBIDDEN`, `NETWORK`, `INTERNAL`, `RATE_LIMITED`.

Exit codes: `0` success, `1` general error, `2` usage error, `64` auth required, `77` forbidden, `100` not found.

## Tips for Agents

- Always use `--json` or `-q` flags to get structured output
- Use `numo commands --json` to discover available commands at runtime
- Use `numo schema <command>` to get flag/argument schemas
- Natural language dates work: `"tomorrow"`, `"next monday"`, `"in 3 days"`
- Task IDs are stable and can be stored for later reference
- Karma is awarded automatically for task/post/comment creation and completion
