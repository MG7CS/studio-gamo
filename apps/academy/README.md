# Gamo Academy

`apps/academy` · production host `academy.gamostudio.org` · local port 4323

The program site for students, parents and families: instruments, instructors and a simple interest form.

- There is no lessons catalog. Each instrument page has a Register link that opens the web interest form (`/academy/interest` on the main site) with the instrument ticked; `/lessons` answers with a 301 to `/instruments`.
- The `/registrations/...` pages (signed manage links, no account) and the enrollment machinery behind them are dormant: nothing creates new registrations from this site. Paid checkout stays unavailable (503) until real charges are approved.

## Run it

From the repository root:

```sh
pnpm --filter apps-academy dev          # http://127.0.0.1:4323 (or `pnpm dev:all` for every app)
pnpm --filter apps-academy build        # production build into ./dist (deploys use `make deploy-academy`, which sets the environment)
```

Hosts and ports come from `packages/config/apps.ts`; cross-app links come from `siteUrl()` in `packages/ui/src/lib/sites.ts`. Never hard-code an origin.

## Test it

```sh
pnpm exec tsx --test <file>                                            # the unit or audit test for what you changed
E2E_APPS=academy pnpm exec playwright test tests/e2e/<spec>.spec.ts      # after building this app
```

Run the full `pnpm check` once per merge, not in a loop (`AGENTS.md`, "Test economy").

## Read more

[`AGENTS.md`](../../AGENTS.md) (rules), [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) (what the code does), [`docs/FRONTEND_ARCHITECTURE.md`](../../docs/FRONTEND_ARCHITECTURE.md) (shared UI rules), [`docs/RUNBOOK.md`](../../docs/RUNBOOK.md) (deploys, secrets, owner actions).
