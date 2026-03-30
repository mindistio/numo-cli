# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

numo-cli is a CLI for the Numo ADHD planner app. It provides programmatic access for both humans and AI agents. Single package with two source modules under `src/`: `shared` (types), `cli` (Commander.js CLI that talks directly to Firestore REST API).

## Build & Run

```bash
# Install dependencies
npm install

# Build CLI
npm run build

# Run CLI locally (dev mode, no build needed)
npm run dev

# Run CLI from build output
node dist/cli.cjs

# Type-check without emitting
npm run typecheck
```

## Architecture

### Source Layout

- **`src/shared/`** — TypeScript types (`ITask`, `IPost`, `IComment`, `IReply`) and constants. No runtime dependencies.
- **`src/cli/`** — Commander.js CLI binary (`numo`). Dual-mode output: TTY gets tables/colors, pipes/agents get JSON. Global flags: `--json` (force JSON output), `-q, --quiet` (suppress interactive output, implies `--json`).
  - **`src/cli/commands/`** — Command registration (tasks, posts, profile). Each file exports a `register*Commands(program)` function.
  - **`src/cli/services/`** — Business logic layer (tasks, posts, comments, replies, profile). Each service calls Firestore REST API directly.
  - **`src/cli/lib/`** — Shared utilities:
    - `firestore.ts` — Firestore REST API client (serialization, CRUD, queries, batch writes).
    - `actions.ts` — Generic action runners (`runGet`, `runList`, `runCreate`, `runWrite`, `runDelete`) that wrap service calls with spinner + output formatting.
    - `config.ts` — Firebase config and credential paths.
    - `output.ts` — JSON/table/record output and error formatting.
    - `format.ts` — Display formatting helpers.
    - `table.ts` — TTY table renderer.
    - `spinner.ts` — Async spinner wrapper.
    - `pagination.ts` — Cursor-based pagination helpers.
    - `prompts.ts` — Interactive prompts (`@clack/prompts`). Used by commands to prompt for missing arguments in TTY mode. In non-TTY mode, throws with a message to use flags instead.
    - `tty.ts` — TTY detection and Unicode support detection.
    - `uid.ts` — `requireUid()` helper — loads credentials and returns uid or throws.
    - `dirs.ts` — XDG Base Directory config resolution (`NUMO_CONFIG_DIR` > `XDG_CONFIG_HOME` > `~/.numo/` fallback).
    - `errors.ts` — Structured errors (`CliError`, `ErrorKind`, `ExitCode`) for consistent JSON error output.
    - `update-check.ts` — Background npm update check with interval-based notification.
    - `stdin.ts` — Read lines from stdin for piped batch operations.
    - `validation.ts` — Input validation (Firestore document IDs, path traversal, length limits).
    - `http.ts` — HTTP retry logic with timeout handling and retryable status codes.
    - `parse-date.ts` — Natural language date parsing via chrono-node (`"tomorrow"`, `"next monday"` → `YYYY-MM-DD HH:mm`).
    - `symbols.ts` — Unicode symbols (✓, ✗, ○, ↻) with ASCII fallbacks for non-Unicode terminals.
  - **`src/cli/auth/`** — Authentication: `login.ts` (entry point), `phone-login.ts` (phone OTP flow), `local-server.ts` (local HTTP callback server for phone auth), `credentials.ts` (token storage/refresh).

### Build Target

CLI is bundled via esbuild → `dist/cli.cjs`. Target: Node 18. Single-file output.

### Authentication

`numo login` authenticates via Firebase (email/password or phone OTP via `--phone`). Phone login starts a local HTTP server and opens the browser for the OTP flow. Credentials (`refreshToken`) are stored at `~/.numo/credentials.json`. `numo logout` clears stored credentials. All Firestore REST API calls use Firebase ID tokens (auto-refreshed from the stored refresh token) via `Authorization: Bearer <idToken>`.

### Key Patterns

- **Interactive prompts:** In TTY mode, commands prompt for missing required arguments and offer optional fields to fill. All positional args are optional (`[id]` not `<id>`). In non-TTY/agent mode, missing required args throw errors with instructions to use flags.
- **Direct Firestore access:** CLI → axios → Firestore REST API (`firestore.googleapis.com`). No backend proxy. Queries fetch all documents and filter client-side to avoid composite index requirements.
- **Firestore serialization:** `toFirestoreFields()` converts JS objects to Firestore value format. `fromFirestoreDoc()` converts back. Both in `src/cli/lib/firestore.ts`.
- **Service layer:** Each service in `src/cli/services/` encapsulates business logic (validation, date calculations, batch writes) that was previously in Cloud Functions.
- **Task completion:** Matches iOS app flow. Simple tasks: deleted from `tasks`, written to `tasksHistory`. Recurring tasks: advanced to next dueDate in `tasks`, snapshot written to `tasksHistory`. Uncomplete reverses the process.
- **Task list display:** `tasks list` fetches from both `tasks` and `tasksHistory` collections, groups into pending (sorted: timed → repeating → regular) and completed sections, with iOS-style indicators (✓/↻/○). Supports `--date`, `--backlog`, and `--tag` filters.
- **XDG config:** Config directory resolved as `NUMO_CONFIG_DIR` > `XDG_CONFIG_HOME/numo/` > `~/.numo/` (legacy fallback with auto-migration). Credentials stored with `0o600` permissions.

## Testing

```bash
npm test              # vitest run (single run)
npm run test:watch    # vitest (watch mode)
```

- Tests live in `src/**/__tests__/*.test.ts`
- Config: `vitest.config.ts` — globals enabled, node environment, 10s timeout

## Code Style

- Strict TypeScript.
- CLI: ESNext/bundler, bundled to CJS via esbuild.
- New services follow the pattern in `src/cli/services/` and use the Firestore client from `src/cli/lib/firestore.ts`.

## Environment Variables

- `NUMO_FIREBASE_API_KEY` — Firebase Web API key override
- `NUMO_FIREBASE_PROJECT_ID` — Firebase project ID override (used for phone login)
- `NUMO_FIREBASE_APP_ID` — Firebase app ID override (used for phone login)
- `NUMO_TOKEN` — Override auth token (skips credentials file; useful for AI agents and CI)
- `NUMO_NO_UPDATE_CHECK` — Disable automatic npm update checks
- `NUMO_CONFIG_DIR` — Custom config directory (highest priority)
- `XDG_CONFIG_HOME` — XDG fallback for config directory (default: `~/.config/numo/`)

## Firebase

- Project: `mindist-well` (see `.firebaserc`)
- Firestore collections: `users/{uid}/tasks`, `users/{uid}/tasksHistory`, `posts/{postId}/comments/{commentId}/replies/{replyId}`

## CI/CD & Release

- **CI:** `.github/workflows/ci.yml` — typecheck + build + test on Node 18/20/22, runs on every push to `main` and PRs
- **Release:** `.github/workflows/release-please.yml` — conventional commits → Release Please PR → `npm publish --provenance` + standalone binaries
- **GitHub Secrets:** `NPM_TOKEN`, `NUMO_FIREBASE_API_KEY`, `NUMO_FIREBASE_PROJECT_ID`, `NUMO_FIREBASE_APP_ID`
- **Versioning:** `fix:` → patch, `feat:` → minor, `BREAKING CHANGE:` → major

## Publishing

- **Automatic:** merge conventional commits to `main` → Release Please creates a version PR → merge that PR → npm publish + GitHub Release with binaries
- **Manual:** `npm publish` (runs `prepublishOnly`: typecheck + build)
- **Binaries:** `scripts/build-binaries.sh` (requires Bun) → 5 targets: macOS arm64/x64, Linux x64/arm64, Windows x64. Outputs to `dist/release/` with checksums

## Best Practices Reference

**Before making any changes, adding features, or refactoring — consult `.context/research/SUMMARY.md`.**

This folder contains deep research from 33 agents covering:
- `.context/research/best-practices/` — 20 topics (UX, reliability, security, agent experience, testing, distribution, etc.)
- `.context/research/cli-analyses/` — 10 top CLI tools analyzed (Resend, Stripe, GitHub CLI, Vercel, Supabase, Cloudflare, Fly.io, Railway, Firebase, modern trends)
- `.context/research/audit/` — Project audit scores: UX 153/200, Reliability 76/200, Security 111/200
- `.context/research/SUMMARY.md` — Master document with prioritized action items and key patterns

Every recommendation includes specific file:line references, code examples, and implementation estimates.
