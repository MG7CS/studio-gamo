# Gamo Studios admin

`apps/admin` · production host `admin.gamostudio.org` · local port 4326

The only signed-in surface, for staff. Access is Cloudflare Access plus the admin password; the site is never indexed.

- Home (counts), Submissions (inbox, detail, export, file viewer), Forms (builder, publish, versions; the first visit publishes the six default forms), Roster, Requests (match and send offers), Invoices, Registrations, Security, Legal.
- Every route checks the staff session first, then the same origin on writes (`src/lib/admin-page.ts`).
- Local sign-in and the first staff account: `docs/RUNBOOK.md` section 8.

## Run it

From the repository root:

```sh
pnpm --filter apps-admin dev          # http://127.0.0.1:4326 (or `pnpm dev:all` for every app)
pnpm --filter apps-admin build        # production build into ./dist (deploys use `make deploy-admin`, which sets the environment)
```

Hosts and ports come from `packages/config/apps.ts`; cross-app links come from `siteUrl()` in `packages/ui/src/lib/sites.ts`. Never hard-code an origin.

## Test it

```sh
pnpm exec tsx --test <file>                                            # the unit or audit test for what you changed
E2E_APPS=admin pnpm exec playwright test tests/e2e/<spec>.spec.ts      # after building this app
```

Run the full `pnpm check` once per merge, not in a loop (`AGENTS.md`, "Test economy").

## Read more

[`AGENTS.md`](../../AGENTS.md) (rules), [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) (what the code does), [`docs/FRONTEND_ARCHITECTURE.md`](../../docs/FRONTEND_ARCHITECTURE.md) (shared UI rules), [`docs/RUNBOOK.md`](../../docs/RUNBOOK.md) (deploys, secrets, owner actions).
