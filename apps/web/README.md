# Gamo Studios main site

`apps/web` · production host `gamostudio.org` · local port 4321

The organization site and the home of everything people send to us:

- Marketing pages: home, mission, get started, get involved, partners, support, FAQ, legal.
- **Public forms**, rendered from the published forms staff edit in admin (`src/lib/form-page.ts` → `FormPageView` / `FormPanel` → the shared `DynamicForm`): `/worship/apply`, `/worship/request`, `/production/apply`, `/production/request`, and the forms on `/contact` and `/partners/interest`. Until a form is published (open admin **Forms** once) its page answers 404, except `/contact` and `/partners/interest`, which show only their email card.
- The emailed **offer page** `/worship/offers/[token]` (`src/lib/offer-page.ts`): opening it changes nothing; Accept or Decline posts once.
- API routes: chunked file uploads (`/api/forms/...`), and the Resend and Stripe webhooks (`/api/webhook/...`).
- The daily job (`src/worker.ts`): email retry, upload cleanup, offer expiry and data retention (`packages/domain/src/jobs/daily.ts`).
- `/preview/*`: private design catalogs (noindex, disallowed in `robots.txt`).

## Run it

From the repository root:

```sh
pnpm --filter apps-web dev          # http://127.0.0.1:4321 (or `pnpm dev:all` for every app)
pnpm --filter apps-web build        # production build into ./dist (deploys use `make deploy-web`, which sets the environment)
```

Hosts and ports come from `packages/config/apps.ts`; cross-app links come from `siteUrl()` in `packages/ui/src/lib/sites.ts`. Never hard-code an origin.

## Test it

```sh
pnpm exec tsx --test <file>                                            # the unit or audit test for what you changed
E2E_APPS=web pnpm exec playwright test tests/e2e/<spec>.spec.ts      # after building this app
```

Run the full `pnpm check` once per merge, not in a loop (`AGENTS.md`, "Test economy").

## Read more

[`AGENTS.md`](../../AGENTS.md) (rules), [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) (what the code does), [`docs/FRONTEND_ARCHITECTURE.md`](../../docs/FRONTEND_ARCHITECTURE.md) (shared UI rules), [`docs/RUNBOOK.md`](../../docs/RUNBOOK.md) (deploys, secrets, owner actions).
