# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

numo-cli is a CLI for the Numo ADHD planner app. It provides programmatic access for both humans and AI agents. Pure HTTP client — all data and auth goes through the Numo API server (`NUMO_API_URL`).

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

- **`src/cli/`** — Commander.js CLI binary (`numo`). Dual-mode output: TTY gets tables/colors, pipes/agents get JSON. Global flags: `--json` (force JSON output), `-q, --quiet` (suppress interactive output, implies `--json`).
  - **`src/cli/commands/`** — Command registration (tasks, posts, profile). Each file exports a `register*Commands(program)` function.
  - **`src/cli/services/`** — API service layer (tasks, posts, comments, replies, profile). Each service calls the API server via `api-client.ts`.
  - **`src/cli/lib/`** — Shared utilities:
    - `api-client.ts` — HTTP client for API server calls. Uses `getIdToken()` for auth. Base URL from `NUMO_API_URL`.
    - `actions.ts` — Generic action runners (`runGet`, `runList`, `runCreate`, `runWrite`, `runDelete`) that wrap service calls with spinner + output formatting.
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
    - `validation.ts` — Input validation (document IDs, path traversal, length limits).
    - `http.ts` — HTTP retry logic with timeout handling and retryable status codes. Used by auth flows.
    - `parse-date.ts` — Natural language date parsing via chrono-node (`"tomorrow"`, `"next monday"` → `YYYY-MM-DD HH:mm`).
    - `symbols.ts` — Unicode symbols (✓, ✗, ○, ↻) with ASCII fallbacks for non-Unicode terminals.
  - **`src/cli/auth/`** — Authentication via API server: `login.ts` (entry point), `phone-login.ts` (phone OTP via browser), `credentials.ts` (token storage/refresh).

### Build Target

CLI is bundled via esbuild → `dist/cli.cjs`. Target: Node 20. Single-file output. No env vars required at build time.

### Authentication

`numo login` authenticates via the API server (email/password or phone OTP via `--phone`). Phone login opens a browser to the API server's verification page. Credentials (`refreshToken`) are stored at `~/.config/numo/credentials.json`. `numo logout` clears stored credentials. All API calls use ID tokens (auto-refreshed via `POST /api/auth/refresh`) sent as `Authorization: Bearer <idToken>`.

### Key Patterns

- **Interactive prompts:** In TTY mode, commands prompt for missing required arguments and offer optional fields to fill. All positional args are optional (`[id]` not `<id>`). In non-TTY/agent mode, missing required args throw errors with instructions to use flags.
- **API client:** CLI → `api-client.ts` → API server (`NUMO_API_URL`). CLI is a pure HTTP client with no direct database access.
- **Service layer:** Each service in `src/cli/services/` makes HTTP calls to the API server. Business logic (validation, karma, streaks) is on the server.
- **Task list display:** `tasks list` groups into pending (sorted: timed → repeating → regular) and completed sections, with iOS-style indicators (✓/↻/○). Supports `--date`, `--backlog`, and `--tag` filters.
- **XDG config:** Config directory resolved as `NUMO_CONFIG_DIR` > `XDG_CONFIG_HOME/numo/` > `~/.numo/` (legacy fallback with auto-migration). Credentials stored with `0o600` permissions.
- **Admin commands:** Posts write commands (create, update, delete, comment, reply) are always registered but the server enforces admin access via `NUMO_ADMIN_UIDS`. Non-admins get a 403 error.

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
- New services follow the pattern in `src/cli/services/` and use `api-client.ts`.

## Environment Variables

- `NUMO_API_URL` — API server URL (default: `http://localhost:3000`)
- `NUMO_TOKEN` — Override auth token (skips credentials file; useful for AI agents and CI)
- `NUMO_NO_UPDATE_CHECK` — Disable automatic npm update checks
- `NUMO_CONFIG_DIR` — Custom config directory (highest priority)
- `XDG_CONFIG_HOME` — XDG fallback for config directory (default: `~/.config/numo/`)

## CI/CD & Release

- **CI:** `.github/workflows/ci.yml` — typecheck + build + test on Node 18/20/22, runs on every push to `main` and PRs
- **Release:** `.github/workflows/release-please.yml` — conventional commits → Release Please PR → `npm publish --provenance` + standalone binaries
- **GitHub Secrets:** `NPM_TOKEN`
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
