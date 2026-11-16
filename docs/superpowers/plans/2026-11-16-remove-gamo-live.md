# Remove Gamo Live — execution plan

Spec: `docs/superpowers/specs/2026-11-16-remove-gamo-live-design.md`. Branch: `cleanup/remove-gamo-live`.

Executed by 9 parallel agents with disjoint file ownership (no agent commits; the lead commits, integrates,
runs `pnpm install`, typecheck, `pnpm check:quick`, then the full `pnpm check` once).

| Task | Owner scope |
|---|---|
| A | delete `apps/live`; root `package.json`, `Makefile`, `playwright.config.ts`, `scripts/**` app lists (not audit/api/journeys) |
| B | `packages/domain`, `packages/integrations`, `packages/config/brand.ts` |
| C | `packages/db` (drop migration `0018`, schema, tests), `docs/DATABASE.md` |
| D | `openapi/**`, `packages/api-contracts` (regenerate), `scripts/api/**`, API docs |
| E | `apps/web` Live surfaces |
| F | `apps/admin` event review + Live demo screens |
| G | `packages/ui`, `packages/auth`, `packages/config` (except brand.ts), other apps' `wrangler.toml`/`.dev.vars.example` |
| H | `scripts/audit/**`, `scripts/journeys`/Miniflare harness, `tests/e2e/**` |
| I | docs (except DATABASE/API docs), `AGENTS.md`, `README.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `prompts/` |

Integration (lead): `pnpm install` → `pnpm typecheck` → fix → `pnpm check:quick` → commit per area → `pnpm check` once.
