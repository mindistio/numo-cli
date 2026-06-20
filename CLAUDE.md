# CLAUDE.md

Entry point for Claude Code working in this repo. It links out rather than duplicating detail.

**numo-cli** is a Commander.js CLI (`numo`) for the Numo planner — a pure HTTP client to the Numo API (`NUMO_API_URL`). TTY users get tables/colors; pipes and agents get JSON.

## Where things live
- `src/cli/cli.ts` — program + global flags (`--json`, `-q/--quiet`) and discovery (`commands`, `schema`, `guide`/`agents`, `completion`); `guide` prints `AGENTS.md`, inlined into the bundle at build time via `lib/guide.ts`
- `src/cli/commands/` — command registration (`register*Commands(program)`)
- `src/cli/services/` — API calls via `lib/api-client.ts`
- `src/cli/lib/` — HTTP, output/tables, prompts (@clack), errors/exit-codes, dates, config dirs, API-base policy
- `src/cli/auth/` — login, phone OTP, credential storage/refresh
- `src/cli/types/api.ts` — the wire contract (request/response shapes)

## Pointers
- Agent/JSON contract (commands, auth, errors, discovery) → `AGENTS.md`
- Public overview → `README.md`
- npm scripts (build / test / typecheck) → `package.json`

The published npm package ships only `dist/cli.cjs` (single-file esbuild bundle, Node 20) + `LICENSE`. Community endpoints are read-only; `tasks create` defaults to private.
