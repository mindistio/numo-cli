# CLAUDE.md

Entry point for Claude Code working in this repo. It links out rather than duplicating detail.

**numo-cli** is a Commander.js CLI (`numo`) for the Numo planner — a pure HTTP client to the Numo API (`NUMO_API_URL`). TTY users get tables/colors; pipes and agents get JSON.

## Public repo
This repo and the npm package are public, and release-please turns commit messages into the public CHANGELOG. Commit messages, PR titles and descriptions, branch names, code comments and test names say only what changed for CLI users: no ticket IDs, no internal details, no security reasoning. Keep PR descriptions to a few lines.

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
- How tests are written here, and why → `TESTING.md`
- npm scripts (build / test / typecheck) → `package.json`
- Which other Numo repos call the same numo-api endpoints → `../numo-context/SYSTEM.md` (read `../numo-context/skills/numo-system/SKILL.md` first; no `../numo-context` → `gh repo clone mindistio/numo-context ../numo-context`, otherwise `git -C ../numo-context pull`)
- Agent Plugin package: root `plugin.json` + `skills/` per [Agent Plugins v1](https://agent-plugins.org); `.claude-plugin/plugin.json` mirrors it for Claude Code, and release-please keeps both versions on `package.json`

The published npm package ships only `dist/cli.cjs` (single-file esbuild bundle, Node 20) + `LICENSE`. Community endpoints are read-only; `tasks create` defaults to private.
