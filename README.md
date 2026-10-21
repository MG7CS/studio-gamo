# Gamo Studios

Gamo Studios is a Christian, mission-driven Public Benefit Corporation. This repository holds its websites and apps: the organization site and four programs — **Gamo Worship**, **Gamo Academy**, **Gamo Live** and **Gamo Production** — plus a private admin.

**Status (2026-10-19): rebuild in progress.** The four products launch together. Gamo Live and the admin are rebuilt first and are the reference for the others: Live has organizer accounts, free events and registration, check-in, and paid ticketing online and at the door (Stripe test mode only); the admin runs reviews, verification by meeting and Live payments. Worship, Academy and Production show their marketing pages while their product side is rebuilt. See [`docs/REBUILD_PLAN.md`](docs/REBUILD_PLAN.md). Rules for working here are in [`AGENTS.md`](AGENTS.md).

| App | Production host | Local | What is current |
| --- | --- | --- | --- |
| `apps/web` | gamostudio.org | http://127.0.0.1:4321 | marketing pages (home, mission, live, get started, get involved, support, FAQ, contact, partners, legal) |
| `apps/worship` | worship.gamostudio.org | http://127.0.0.1:4322 | marketing pages (home, opportunities) |
| `apps/academy` | academy.gamostudio.org | http://127.0.0.1:4323 | marketing pages (home, instruments, lessons, instructors, sponsored) |
| `apps/live` | live.gamostudio.org | http://127.0.0.1:4324 | marketing pages (home, events, artists, venues); free registration and ticket pages; paid checkout, order pages and find-my-tickets; organizer area (`/organizer`: events, tickets, orders, door, check-in, organization, payments, settings); door staff links (`/door`) |
| `apps/production` | production.gamostudio.org | http://127.0.0.1:4325 | marketing pages (home, services, training) |
| `apps/admin` | admin.gamostudio.org (old admin still live) | http://127.0.0.1:4326 | the rebuilt single-admin dashboard behind Cloudflare Access: Overview, Community, Gamo Live (review, organizations, catalog, payments, settings), Legal |

The public apps other than Live have only marketing pages until their products are rebuilt.

**Stack:** Astro 7 (server output) on Cloudflare Workers, Tailwind CSS 4, D1, KV, R2, TypeScript (strict). pnpm workspace, Node 22.

## Run it locally

```sh
nvm use                 # Node 22 (.nvmrc)
corepack enable         # pnpm (package.json "packageManager")
pnpm install
pnpm db:migrate:local   # local D1 for each app
make dev-all            # all six apps; or make dev-web, dev-live, dev-admin, …
make open-all           # open all six local sites in the browser
```

Local settings go in each app's `apps/<app>/.dev.vars` (see its `.dev.vars.example`). The admin needs `ADMIN_EMAIL` and, locally, `ALLOW_LOCAL_ADMIN_IDENTITY="true"`.

## Commands

| Command | Does |
| --- | --- |
| `make dev-<app>` / `make dev-all` / `make open-all` | Dev servers (fixed ports) and opening them |
| `pnpm build` | Build all apps |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | Static checks (ESLint with zero warnings, Prettier) |
| `pnpm lint:layers` | Import-boundary report (never fails), writes `docs/reports/layers.md` |
| `pnpm test` / `pnpm test:e2e` / `pnpm check` | Tests — run only when the owner asks (`AGENTS.md` §2) |
| `pnpm db:migrate:local` / `db:seed:local` / `db:reset:local` | Local D1 database |

## Deploying

Deploys, secrets, DNS and database changes are owner-only. The procedure is in [`docs/RUNBOOK.md`](docs/RUNBOOK.md). The public apps are frozen in production until each rebuilt product is ready.

## Documentation

- [`AGENTS.md`](AGENTS.md) — rules for working in this repository
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — how the repository is organized today
- [`DESIGN.md`](DESIGN.md) — the design system
- [`SECURITY.md`](SECURITY.md) — security and trust baselines
- [`docs/REBUILD_PLAN.md`](docs/REBUILD_PLAN.md) — the rebuild: inventory, decisions, phases
- [`docs/ADMIN_REQUIREMENTS.md`](docs/ADMIN_REQUIREMENTS.md) — the admin
- [`docs/LIVE_REQUIREMENTS.md`](docs/LIVE_REQUIREMENTS.md), [`docs/LIVE_DATA_MODEL.md`](docs/LIVE_DATA_MODEL.md), [`docs/LIVE_SCREENS.md`](docs/LIVE_SCREENS.md), [`docs/LIVE_PAYMENTS.md`](docs/LIVE_PAYMENTS.md) — Gamo Live
- [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — deploy, rollback, Cloudflare setup, Live catalog import
- [`docs/GAMO_NONPROFIT_MODEL.md`](docs/GAMO_NONPROFIT_MODEL.md), [`docs/NONPROFIT_TRANSITION_CHECKLIST.md`](docs/NONPROFIT_TRANSITION_CHECKLIST.md) — mission and legal prerequisites (historical file names; the PBC statement in `AGENTS.md` prevails)
- [`docs/DECISIONS.md`](docs/DECISIONS.md), [`docs/BUILD_LOG.md`](docs/BUILD_LOG.md) — history logs (not rules)
