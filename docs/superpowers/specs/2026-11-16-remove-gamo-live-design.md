# Remove Gamo Live — design (approved 2026-11-16)

## Intent
After talking with church ministers and pastors, the owner narrowed Gamo Studios to three programs:
**Gamo Academy, Gamo Worship and Gamo Production**. Gamo Live (events, ticketing, scanner, Promote/Explore
Events) is dropped. This is the first of two cleanups; the second (later, separately designed) turns the
remaining programs into simple forms, emails and invoices with the admin dashboard as the only dashboard.

## Snapshot (done)
The four-program state is preserved at commit `08c9b44`: branch `archive/four-programs-2026-11-16` and annotated
tag `four-programs-snapshot`, both pushed to GitHub (owner approved the push).

## Rule (owner's wording)
Remove the Live app and what is unique to it — including its database tables and APIs. Code that public pages
or the admin dashboard still use stays.

## Removed
- `apps/live` and its two workers (`gamo-live`, `gamo-live-preview`).
- Live-only domain code: `services/ticketing/*`, `services/live.ts`, `live-external-discovery.ts`,
  `verified-catalog-2026-10-15.ts`, `src/ticketing/*`, ticket QR / scanner PIN security, ticketing types,
  unused `PaymentService`, Stripe ticket/refund helpers.
- Database: one new forward migration dropping Live-only tables (events, ticketing, scanner, venues, artists/
  bookings, organizer profiles, external listings, `production_requests`) plus unused `payment_records`,
  `ledger_entries`, `stripe_webhook_events`. Production holds only test data (owner confirmed).
- OpenAPI: all `x-application: live` paths and Live/ticketing/payments/scanner schemas, plus admin's four event/
  organizer review paths; regenerate bundled + `packages/api-contracts`.
- Live surfaces elsewhere: web `/live` page, `components/live/*`, homepage Live spotlight, Live links in nav/footer/
  copy/sitemap/llms/JSON-LD; admin event review page/APIs and `data/admin/live.ts` demo screens.
- Live-only tests, scripts (`scripts/live/*`, Makefile/package.json targets) and docs.

## Kept (deferred to cleanup two)
Shared account, sign-in, Clerk, customer-link, email and Academy Stripe code. Where these merely mention
`'live'` (a product key in a type or list, a database CHECK value), it stays. Database CHECK constraints listing
`'live'` are not rebuilt (risky table rebuilds, harmless value).

## Unavoidable fixes
- Resend bounce/complaint webhook moves to `apps/web` (`/api/webhook/resend`) — done in commit `0a4fb0f`.
- Miniflare journey harness stops resolving wrangler from `apps/live` and stops using Live API routes.
- `persons.ts` stops reading `ticket_orders`.
- Sign-in email branding (`@gamo/config/brand`) becomes Gamo Studios instead of Gamo Live.
- Live links removed from shared nav/footer.

## Constraints
Nothing is deployed. The owner deletes the Live workers and `live.gamostudio.org` route in Cloudflare.
The drop migration is destructive and owner-approved. Quick checks per step; full `pnpm check` once at the end.
