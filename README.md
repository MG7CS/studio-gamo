# Gamo Studios (`studio-gamo`)

Gamo Studios is a Christian, mission-driven Public Benefit Corporation. This repository holds the five web applications for its three programs — **Gamo Academy**, **Gamo Worship** and **Gamo Production** — plus the organization site and the staff admin app.

> **2026-11-16:** Gamo Live (events, ticketing, scanner) was removed after the owner's conversations with church ministers and pastors. Its last state is preserved at branch `archive/four-programs-2026-11-16` / tag `four-programs-snapshot`. 

> **2026-11-16 (second cleanup, in progress):** public accounts, sign-in, Clerk, onboarding, provider profiles and per-program dashboards are removed. Academy, Worship and Production become public pages, staff-editable forms, emails and invoices; the admin app is the only dashboard. Spec: [`docs/superpowers/specs/2026-11-16-forms-emails-invoices-design.md`](docs/superpowers/specs/2026-11-16-forms-emails-invoices-design.md).

> Read [`AGENTS.md`](AGENTS.md) before changing anything: it holds the organization's rules for copy, legal wording, payments and data. [`docs/GAMO_NONPROFIT_MODEL.md`](docs/GAMO_NONPROFIT_MODEL.md) is the organizational reference (its file name is historical; the PBC statement above prevails).

## Applications

| App | Host | Local | What it is |
| --- | --- | --- | --- |
| `apps/web` | gamostudio.org | http://127.0.0.1:4321 | Organization site, mission, partnerships, contact and partner-interest forms |
| `apps/academy` | academy.gamostudio.org | http://127.0.0.1:4323 | Gamo Academy: instruments, instructors, a simple interest form (dormant account-free registration pages) |
| `apps/worship` | worship.gamostudio.org | http://127.0.0.1:4322 | Gamo Worship: musician application and church request forms, offer links |
| `apps/production` | production.gamostudio.org | http://127.0.0.1:4325 | Gamo Production: technical ministry support, technician application and request forms |
| `apps/admin` | admin.gamostudio.org | http://127.0.0.1:4326 | The only dashboard: forms, submissions, roster, requests, offers, invoices; behind Cloudflare Access + admin password |

Shared packages: `@studio-gamo/ui` (components, layouts, design tokens), `@gamo/domain` (services, API helpers, middleware), `@gamo/auth` (staff sessions, CSRF, Cloudflare Access), `@gamo/db` (Drizzle schema, migrations), `@studio-gamo/integrations` (Stripe, Resend, R2), `@gamo/config` (hosts, ports, env, brand), `@gamo/api-contracts` (generated from `openapi/`). See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

**Stack:** Astro 7 (SSR) on Cloudflare Workers, Tailwind CSS 4, D1 + Drizzle, KV, R2, Turnstile, Stripe (test mode only), Resend. pnpm workspace, Node 22.

## Quick start

```sh
nvm use                       # Node 22.22.3 (.nvmrc)
corepack enable               # pnpm 11.28.5 (package.json "packageManager")
pnpm install
cp .env.example .env          # fill in ENVIRONMENT=local and a 32+ char SESSION_SECRET
pnpm db:migrate:local         # create each app's local D1 database
pnpm dev:all                  # all five apps; or `pnpm dev` for apps/web only
```

Per-app secrets (Stripe test keys, Turnstile, Cloudflare Access) go in `apps/<app>/.dev.vars` — see each `.dev.vars.example`. Everything works locally without them: paid checkout returns 503, email is simulated locally.

## Commands

| Command | Does |
| --- | --- |
| `pnpm dev` / `pnpm dev:all` | Dev server for web / all five apps (fixed ports, isolated local state) |
| `pnpm check` | **Everything CI runs:** typecheck → lint → format check → unit/integration tests → OpenAPI checks → build → browser journeys → browser smoke tests |
| `pnpm typecheck` | `astro check` for every app + `tsc` for packages and scripts |
| `pnpm lint` / `pnpm lint:fix` | ESLint (TypeScript, Astro, a11y); zero warnings allowed |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm test` | Unit and integration tests (`node --test` via tsx) |
| `pnpm test:e2e` | Playwright smoke suite against production builds (`pnpm build` first) |
| `pnpm test:journeys` | Browser journeys on built Workers (Miniflare) |
| `pnpm api:check` | OpenAPI lint, generated-artifact drift, route coverage, HTTP contract tests |
| `pnpm build` | Build all five apps (local configuration) |
| `pnpm db:migrate:local` / `db:reset:local` | Local D1 (see [`docs/DATABASE.md`](docs/DATABASE.md)) |
| `pnpm knip` | Report unused files, exports and dependencies |

## Deploying

Deploys, secrets, DNS and database changes are **owner-only** operations. The procedure — preview first, order of apps, rollback, required secrets per app, post-deploy checks — is in [`docs/RUNBOOK.md`](docs/RUNBOOK.md). `make deploy-<app>` / `make preview-<app>` wrap the build with the right `CLOUDFLARE_ENV`.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — apps, packages, request flow, auth, payments, hosting
- [`docs/FRONTEND_ARCHITECTURE.md`](docs/FRONTEND_ARCHITECTURE.md) — shared front-end rules, rationale and gaps
- [`docs/superpowers/specs/2026-11-16-forms-emails-invoices-design.md`](docs/superpowers/specs/2026-11-16-forms-emails-invoices-design.md) and [plan](docs/superpowers/plans/2026-11-16-forms-emails-invoices.md) — forms, emails, invoices (cleanup two)
- [`docs/superpowers/plans/2026-11-16-frontend-foundation.md`](docs/superpowers/plans/2026-11-16-frontend-foundation.md) — front-end foundation plan
- [`docs/RUNBOOK.md`](docs/RUNBOOK.md) — deploy, rollback, env vars, Cloudflare checks
- [`docs/DATABASE.md`](docs/DATABASE.md) — schema, migrations, local database
- [`docs/OPENAPI_ARCHITECTURE.md`](docs/OPENAPI_ARCHITECTURE.md), [`docs/API_COMPATIBILITY.md`](docs/API_COMPATIBILITY.md) — HTTP contract
- [`docs/CLEANUP_LOG.md`](docs/CLEANUP_LOG.md) — the 2026-10 foundation pass: decisions, findings, open owner questions
- [`SECURITY.md`](SECURITY.md), [`DESIGN.md`](DESIGN.md), [`ROADMAP.md`](ROADMAP.md) — policy, design system and roadmap
