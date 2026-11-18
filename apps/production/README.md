# Gamo Production

`apps/production` · production host `production.gamostudio.org` · local port 4325

The program site for technical ministry (audio, video, lighting, livestream): services and training. Its apply and request forms live on the main site (`/production/apply`, `/production/request`).

## Run it

From the repository root:

```sh
pnpm --filter apps-production dev          # http://127.0.0.1:4325 (or `pnpm dev:all` for every app)
pnpm --filter apps-production build        # production build into ./dist (deploys use `make deploy-production`, which sets the environment)
```

Hosts and ports come from `packages/config/apps.ts`; cross-app links come from `siteUrl()` in `packages/ui/src/lib/sites.ts`. Never hard-code an origin.

## Test it

```sh
pnpm exec tsx --test <file>                                            # the unit or audit test for what you changed
E2E_APPS=production pnpm exec playwright test tests/e2e/<spec>.spec.ts      # after building this app
```

Run the full `pnpm check` once per merge, not in a loop (`AGENTS.md`, "Test economy").

## Read more

[`AGENTS.md`](../../AGENTS.md) (rules), [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) (what the code does), [`docs/FRONTEND_ARCHITECTURE.md`](../../docs/FRONTEND_ARCHITECTURE.md) (shared UI rules), [`docs/RUNBOOK.md`](../../docs/RUNBOOK.md) (deploys, secrets, owner actions).
