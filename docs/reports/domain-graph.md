# `@gamo/domain` dependency graph

Written for WO1 (phase 1) from the code on branch `platform-layers`. It was generated with the TypeScript compiler API (imports, re-exports and who uses which export through the `@gamo/domain` barrels), not by hand, by a throwaway script that is not kept in the repo. It is a snapshot: the files move in WO2 to WO4 and phase 5.

How to read it:

- **Imports** are the other domain files a file imports (`type` marks a type-only import), then the outside packages it uses.
- **Imported by** is `domain` files that import it (tests counted separately), then who outside the package uses at least one of its exports through the barrels `@gamo/domain`, `/security`, `/types`, `/terms` and `/page-middleware`: `live(5)` is five files in `apps/live`, `pkg:db(1)` one file in `packages/db`, `scripts(2)` two files in `scripts/`.
- **UNUSED** means no app, package or script reaches the file: it is not used by anything outside `domain`, and no used `domain` file imports it. `UNUSED (tests only)` means only a test uses it. `test support` is a fixture file that only tests import.
- **old schema** lists tables from the old shared schema (`packages/db/schema.ts`, not in the Live migrations) that the file reads or writes in SQL or through `@gamo/db`.
- **UNCLEAR HOME** is a file where the proposed home needs your decision; the reason is in the list near the top.

## Summary

- 156 files, 42,971 lines (29,451 outside tests; 54 test files).
- Unused files: 9. Files that read the old schema: 7. Unclear homes: 29 files (their tests follow them).
- Import cycles: 0 between files (0 when type-only imports are ignored).
- Imports that would point upward once the homes are applied: 2.

| Proposed home | Files | of which tests | Lines |
| --- | --- | --- | --- |
| live | 112 | 44 | 35,864 |
| partners | 4 | 0 | 1,496 |
| core | 8 | 3 | 1,463 |
| platform/security | 14 | 5 | 1,380 |
| platform/email | 3 | 1 | 1,107 |
| deleted | 8 | 0 | 885 |
| platform/terms | 4 | 1 | 579 |
| site | 1 | 0 | 101 |
| platform/db | 1 | 0 | 66 |
| config | 1 | 0 | 30 |

## Unused or old-schema files

### Unused

- `api/defer` (34 lines): UNUSED; UNCLEAR HOME. waitUntil helper that keeps sign-in answers constant-time (timing oracle, D-119).
- `api/validation` (239 lines): UNUSED; UNCLEAR HOME. old API request schemas (zod); nothing imports them and the routes they described no longer exist.
- `live/seo` (125 lines): UNUSED (tests only); UNCLEAR HOME. schema.org event data.
- `security/signed-value` (47 lines): UNUSED (tests only); UNCLEAR HOME. signed values and the Turnstile check; unused today, wanted by the sign-in flows of the other products.
- `security/turnstile` (97 lines): UNUSED (tests only); UNCLEAR HOME. signed values and the Turnstile check; unused today, wanted by the sign-in flows of the other products.
- `services/notifications` (326 lines): UNUSED; old schema: event_registrations, events, notification_jobs; UNCLEAR HOME. nothing imports it and it reads the old notification tables; delete, or revive as part of platform/email.
- `services/verified-catalog-2026-10-15` (1014 lines): UNUSED; UNCLEAR HOME. a dated data file of the verified listings (1,014 lines).
- `types/policy` (356 lines): UNUSED (tests only). old ticketing types and policy; imported only by types/index.ts and types.test.ts.
- `types/ticketing` (191 lines): UNUSED (tests only). old ticketing types and policy; imported only by types/index.ts and types.test.ts.

### Reads the old schema

- `services/email-outbox`: email_log, email_suppressions → proposed home platform/email
- `services/notifications`: event_registrations, events, notification_jobs → proposed home platform/email
- `services/participation`: participation_inquiries → proposed home partners
- `services/provider-review`: persons, provider_profiles, verification_records → proposed home partners
- `services/providers`: provider_profiles, verification_records → proposed home partners
- `terms/acceptance`: marketing_consents → proposed home platform/terms
- `terms/sync`: terms_documents → proposed home platform/terms

The three Community services (`providers`, `provider-review`, `participation`), `terms/acceptance` and `email-outbox` read tables that stay in the platform database when the old schema is cut down (people, partner profiles, participation, terms, email log). `services/notifications.ts` reads old notification tables with no live user.

## Homes that are not clear

- `api/defer` → **platform/security**: unused today; keep for the other products' sign-in flows or delete.
- `api/response` → **config**: could be `site` (it is imported by page-middleware); config chosen because platform folders need it too.
- `api/validation` → **deleted**: unused: safe to delete now.
- `live/clerk` → **live**: file must be split; the line between generic and Live-specific needs a look in WO4.
- `live/fees` → **live**: the Gamo fee as its own line is `payments` in the plan; keep in live until phase 6.
- `live/ledger` → **live**: ledger definitions are `payments`, each product keeps its table; decide in phase 6.
- `live/money` → **core**: duplicates ui/lib/format.ts formatUsd; WO2 step 3 decides the merge.
- `live/organizers` → **live**: sessions and sign-in may belong to platform/identity (the "one person record"); decide in WO4.
- `live/paid-types` → **live**: mixes Live enums with generic money/ledger types.
- `live/payment-settings`, `live/payouts` → **live**: funds-flow settings are platform-wide in the plan (`payments`/admin); decide in phase 6.
- `live/payments/index`, `live/payments/mode-a`, `live/payments/mode-b`, `live/payments/money-testing`, `live/payments/resolve`, `live/payments/shared`, `live/payments/signature`, `live/payments/standin`, `live/payments/stripe-http`, `live/payments/types` → **live**: the plan puts this in `payments`; it exists in live today, move in phase 6.
- `live/qr` → **live**: qrSvg is generic (uqr); core has no dependencies, so it stays in live until a second product needs it.
- `live/seo` → **live**: only its own test uses it; the Live event page is a protected marketing page, so ask before wiring or deleting it.
- `live/staff-links` → **live**: AGENTS.md says door staff links are built for other apps to reuse; keep in live until a second product uses them.
- `live/webhooks` → **live**: signature check and event envelope are generic (`payments`); handlers stay in live.
- `security/signed-value`, `security/turnstile` → **platform/security**: unused today (only tests): keep for phase 7 or delete.
- `services/notifications` → **platform/email**: unused and old schema: delete or keep? (owner decision).
- `services/verified-catalog-2026-10-15` → **live**: nothing imports it; archive it as data or delete (owner decision).

## Imports that would point upward once the homes are applied

A file whose proposed home is in a lower layer than a file it imports. Each needs untangling (move the shared piece down, or pass it in) before the move.

- **core → live** (2): `live/money.test`→`live/gifts`, `live/money.test`→`live/paid-types`

### Imports between platform folders

These are the sibling edges the `platform` boundary rule has to allow or remove (WO3 and WO4):

- **platform/security → platform/db** (2): `security/rate-limit.test`→`security/sql-database`, `security/rate-limit`→`security/sql-database`
- **platform/email → platform/security** (3): `services/email-outbox`→`security/crypto`, `services/email-outbox`→`security/env-secret`, `services/email-outbox`→`security/pii-hash`
- **platform/email → platform/db** (1): `services/email-outbox`→`security/sql-database`
- **platform/terms → platform/security** (2): `terms/acceptance`→`security/pii-hash`, `terms/registry`→`security/crypto`
- **platform/terms → platform/db** (2): `terms/acceptance`→`security/sql-database`, `terms/sync`→`security/sql-database`

## Import cycles

Between files, counting every import:

None.

Counting only imports that survive compilation (type-only imports ignored):

None.

## Every file

### Top level (`index.ts`, `src/index.ts`, `calendar`)

| File | Lines | Imports | Imported by | Flags | Proposed home |
| --- | --- | --- | --- | --- | --- |
| `(domain index.ts)` | 1 | index | — |  | deleted |
| `calendar.test` | 274 | calendar; `node:*` | — |  | core |
| `calendar` | 434 | — | index, live/admin-schedule, live/event-page-view, live/schedule-view; tests 1; outside: live(1) |  | core |
| `index` | 76 | api/response, api/validation, api/defer, services/providers, services/provider-review, services/email-outbox, live/catalog, live/catalog-import, live/registration, live/mail, live/clerk, live/organizers, live/events, live/admin, live/qr, live/seo, live/cleanup, live/organization-setup, calendar, live/organization-page, live/settings, live/checkin-view, live/event-page-view, live/admin-schedule, live/schedule-view, live/register-form, live/ticket, live/visibility-mail, live/paid-types, live/money, live/fees, live/gifts, live/ledger, live/payments/index, live/payments/standin, live/webhooks, live/payment-settings, live/reports, live/payouts, live/event-ticketing, live/ticket-types, live/pricing, live/codes, live/orders, live/checkout, live/email-typo, live/paid-event-rules, live/tickets, live/order-links, live/find-tickets, live/transfers, live/refunds, live/disputes, live/order-events, live/order-routing, live/payments-runtime, live/admin-orders, live/holder-notices, live/paid-mail, live/staff-links, live/cash-sessions, live/readers, live/door-sales, live/verification-meetings, live/verification-mail, services/notifications, services/meeting-time, http/security-headers, services/participation, services/live-external-discovery, services/verified-catalog-2026-10-15, terms/index, security/sql-database, security/crypto; `@gamo/config` | (domain index.ts) |  | deleted |

### `api/`

| File | Lines | Imports | Imported by | Flags | Proposed home |
| --- | --- | --- | --- | --- | --- |
| `defer` | 34 | — | index | UNUSED; UNCLEAR HOME | platform/security |
| `page-middleware` | 101 | response, http/security-headers; `@gamo/auth, @gamo/config` | outside: academy(2) live(2) production(2) web(2) worship(2) scripts(2) |  | site |
| `response` | 30 | `@gamo/config` | page-middleware, index; outside: admin(17) live(8) web(1) | UNCLEAR HOME | config |
| `validation` | 239 | `zod` | index | UNUSED; UNCLEAR HOME | deleted |

### `http/`

| File | Lines | Imports | Imported by | Flags | Proposed home |
| --- | --- | --- | --- | --- | --- |
| `security-headers` | 196 | — | api/page-middleware, index; outside: admin(1) live(18) scripts(1) |  | platform/security |

### `live/`

| File | Lines | Imports | Imported by | Flags | Proposed home |
| --- | --- | --- | --- | --- | --- |
| `admin-orders` | 89 | security/sql-database, paid-types (type) | index; outside: admin(1) |  | live |
| `admin-schedule.test` | 229 | admin-schedule; `@gamo/db, node:*` | — |  | live |
| `admin-schedule` | 254 | calendar, security/sql-database | index; tests 1; outside: admin(4) |  | live |
| `admin.test` | 156 | admin, paid-types, paid-testing, verification-meetings; `node:*` | — |  | live |
| `admin` | 955 | security/ids, security/sql-database, events, verification-meetings | index; tests 2; outside: admin(15) scripts(2) |  | live |
| `cash-sessions.test` | 252 | security/sql-database, cash-sessions, paid-testing, paid-types, staff-links (type); `node:*` | — |  | live |
| `cash-sessions` | 348 | security/ids, security/sql-database, paid-types, staff-links | index, door-sales; tests 2; outside: live(7) |  | live |
| `catalog-import` | 163 | services/live-external-discovery, security/ids, security/sql-database | index; tests 1; outside: admin(1) scripts(2) |  | live |
| `catalog.test` | 409 | catalog, events, catalog-import, services/live-external-discovery (type); `@gamo/db, node:*` | — |  | live |
| `catalog` | 809 | services/live-external-discovery, security/sql-database, events (type) | index, seo; tests 1; outside: live(15) web(2) |  | live |
| `checkin-view.test` | 56 | checkin-view, events; `node:*` | — |  | live |
| `checkin-view` | 70 | events (type), registration (type) | index; tests 1; outside: live(2) |  | live |
| `checkout.test` | 469 | security/sql-database, checkout, codes, event-ticketing, fees, paid-testing, paid-types, payments/types, tickets; `node:*` | — |  | live |
| `checkout` | 391 | security/env-secret, security/pii-hash, security/rate-limit, security/sql-database, email-typo, gifts, orders, paid-types, payments/types, security/ids, tickets, event-ticketing (type) | index; tests 1; outside: live(3) scripts(2) |  | live |
| `cleanup.test` | 140 | cleanup, paid-testing; `@gamo/db, node:*` | — |  | live |
| `cleanup` | 153 | security/sql-database, security/rate-limit, orders, registration | index; tests 1; outside: admin(1) |  | live |
| `clerk.test` | 262 | clerk; `node:*` | — |  | live |
| `clerk` | 270 | security/crypto; `@gamo/config` | index; tests 1; outside: live(4) | UNCLEAR HOME | live |
| `codes.test` | 210 | codes, paid-testing, paid-types; `node:*` | — |  | live |
| `codes` | 308 | security/ids, security/sql-database, money, paid-types | index, orders; tests 3; outside: live(3) |  | live |
| `disputes` | 192 | security/ids, security/sql-database, ledger, paid-types, tickets | index, order-events |  | live |
| `door-sales.test` | 723 | cash-sessions, door-sales, orders, paid-testing, paid-types, payments/types, staff-links (type); `node:*` | — |  | live |
| `door-sales` | 961 | security/sql-database, cash-sessions, orders, refunds, tickets, paid-types, payments/types, readers, security/ids, staff-links | index; tests 1; outside: live(8) scripts(1) |  | live |
| `email-typo.test` | 38 | email-typo; `node:*` | — |  | live |
| `email-typo` | 110 | security/pii-hash | index, checkout; tests 1 |  | live |
| `event-page-view.test` | 77 | event-page-view; `node:*` | — |  | live |
| `event-page-view` | 87 | calendar, events (type) | index; tests 1; outside: live(1) |  | live |
| `event-ticketing.test` | 204 | event-ticketing, paid-testing, paid-types; `node:*` | — |  | live |
| `event-ticketing` | 301 | security/sql-database, gifts, paid-types | index, checkout, orders, tickets; tests 2; outside: live(3) scripts(1) |  | live |
| `events.test` | 1357 | events, organizers, admin, paid-types, paid-testing, registration; `@gamo/db, node:*` | — |  | live |
| `events` | 1661 | services/live-external-discovery, services/meeting-time, security/crypto, security/ids, security/sql-database, registration, organizers, paid-types, payments/resolve, terms/registry | index, admin, catalog, checkin-view, event-page-view +5; tests 4; outside: live(22) scripts(1) |  | live |
| `fees.test` | 166 | fees, paid-types; `node:*` | — |  | live |
| `fees` | 146 | money, paid-types | index, orders; tests 2; outside: live(1) | UNCLEAR HOME | live |
| `find-tickets` | 105 | security/env-secret, security/pii-hash, security/rate-limit, security/sql-database, mail (type), paid-types (type), paid-mail, tickets | index; tests 1; outside: live(1) |  | live |
| `gifts` | 64 | money, paid-types | index, checkout, event-ticketing, orders; tests 1 |  | live |
| `holder-notices.test` | 33 | holder-notices, paid-testing; `node:*` | — |  | live |
| `holder-notices` | 101 | security/sql-database, events, mail, orders, paid-mail, paid-types, tickets | index; tests 1; outside: admin(1) live(1) |  | live |
| `ledger.test` | 157 | security/sql-database, ledger, paid-testing; `node:*` | — |  | live |
| `ledger` | 407 | security/ids, security/sql-database (type), paid-types (type) | index, disputes, orders, payments/money-testing, payouts +2; tests 2 | UNCLEAR HOME | live |
| `mail.test` | 86 | mail; `node:*` | — |  | live |
| `mail` | 230 | `@studio-gamo/integrations` | index, find-tickets, holder-notices, order-events, paid-mail +4; tests 2; outside: admin(2) live(11) |  | live |
| `money.test` | 40 | money, gifts, paid-types; `node:*` | — | UNCLEAR HOME | core |
| `money` | 33 | — | index, codes, fees, gifts, orders +2; tests 1; outside: admin(11) live(23) | UNCLEAR HOME | core |
| `order-events` | 454 | security/sql-database, disputes, mail, order-links, order-routing, orders, paid-types, paid-mail, payments/types (type), refunds, security/ids, tickets | index, payments-runtime; tests 1; outside: live(1) |  | live |
| `order-links` | 270 | security/sql-database, paid-types (type), paid-mail, refunds, tickets, transfers | index, order-events; tests 1; outside: admin(2) live(4) |  | live |
| `order-routing` | 58 | security/sql-database, paid-types (type), live/payments/index, payments/mode-a, payments/mode-b, payments/types (type) | index, order-events, payments-runtime |  | live |
| `orders.test` | 871 | security/sql-database, codes, orders, paid-testing, paid-types; `node:*` | — |  | live |
| `orders` | 1434 | security/base32, security/crypto, security/env-secret, security/ids, security/pii-hash, security/sql-database, codes, events, event-ticketing, fees, gifts, ledger, money, payments/resolve, pricing, paid-types | index, checkout, cleanup, door-sales, holder-notices +2; tests 5; outside: admin(3) live(12) scripts(2) |  | live |
| `organization-page.test` | 28 | organization-page; `node:*` | — |  | live |
| `organization-page` | 46 | organizers | index; tests 1; outside: live(1) |  | live |
| `organization-setup.test` | 73 | organization-setup; `node:*` | — |  | live |
| `organization-setup` | 103 | organizers | index; tests 1; outside: live(6) |  | live |
| `organizers.test` | 483 | organizers; `@gamo/db, node:*` | — |  | live |
| `organizers` | 673 | security/crypto, security/env-secret, security/ids, security/pii-hash, security/rate-limit, security/sql-database | index, events, organization-page, organization-setup; tests 3; outside: live(29) | UNCLEAR HOME | live |
| `paid-event-rules.test` | 67 | paid-event-rules, paid-testing; `node:*` | — |  | live |
| `paid-event-rules` | 87 | security/sql-database, terms/registry, paid-types (type), payments/resolve, payments/types (type) | index; tests 1; outside: live(3) scripts(1) |  | live |
| `paid-mail.test` | 89 | paid-mail; `node:*` | — |  | live |
| `paid-mail` | 389 | money, mail, paid-types (type) | index, find-tickets, holder-notices, order-events, order-links +1; tests 1; outside: admin(2) live(6) |  | live |
| `paid-testing` | 110 | security/sql-database (type), paid-types (type); `@gamo/db, node:*` | payments/money-testing; tests 25; outside: live(3) scripts(2) |  | live |
| `paid-types` | 446 | security/sql-database (type) | index, admin-orders, cash-sessions, checkout, codes +38; tests 18; outside: admin(5) live(24) scripts(4) | UNCLEAR HOME | live |
| `payment-settings.test` | 272 | paid-testing, payment-settings, payments/money-testing, payments/resolve, payments/standin; `node:*` | — |  | live |
| `payment-settings` | 481 | security/ids, security/sql-database, paid-types, live/payments/index, payments/resolve, payments/shared, payments/types (type) | index, payments-runtime, payouts; tests 1; outside: admin(4) live(2) | UNCLEAR HOME | live |
| `payments-runtime` | 77 | security/sql-database (type), readers, order-events, order-routing, paid-types (type), payment-settings, live/payments/index, payments/standin, payments/types (type), webhooks | index; outside: admin(1) live(14) scripts(2) |  | live |
| `payouts.test` | 225 | paid-testing, payments/mode-b, payments/money-testing, payments/standin, payments/stripe-http, payments/types, payouts, reports; `node:*` | — |  | live |
| `payouts` | 331 | security/ids, security/sql-database, ledger, paid-types, payment-settings, live/payments/index, payments/resolve, payments/shared, payments/types | index; tests 1; outside: admin(1) live(2) | UNCLEAR HOME | live |
| `pricing.test` | 33 | paid-testing, pricing; `node:*` | — |  | live |
| `pricing` | 57 | security/sql-database | index, orders, ticket-types; tests 1; outside: live(1) |  | live |
| `qr` | 9 | `uqr` | index; outside: live(3) | UNCLEAR HOME | live |
| `readers.test` | 314 | paid-testing, paid-types, payments/types, readers; `node:*` | — |  | live |
| `readers` | 419 | security/crypto, security/ids, security/sql-database, paid-types, payments/types | index, door-sales, payments-runtime; tests 1; outside: live(2) |  | live |
| `refunds.test` | 738 | security/sql-database, mail (type), order-events, orders, paid-testing, paid-types, payments/types, refunds, tickets; `node:*` | — |  | live |
| `refunds` | 1006 | security/ids, security/pii-hash, security/env-secret, security/rate-limit, security/sql-database, ledger, paid-types, payments/types, tickets | index, door-sales, order-events, order-links; tests 1; outside: admin(1) live(4) scripts(2) |  | live |
| `register-form.test` | 138 | register-form; `node:*` | — |  | live |
| `register-form` | 192 | security/pii-hash | index; tests 1; outside: live(5) |  | live |
| `registration.test` | 237 | registration; `@gamo/db, node:*` | — |  | live |
| `registration` | 556 | security/base32, security/crypto, security/env-secret, security/ids, security/pii-hash, security/rate-limit, security/sql-database | index, checkin-view, cleanup, events, tickets; tests 2; outside: live(8) |  | live |
| `reports.test` | 420 | security/sql-database, ledger, paid-testing, payments/mode-a, payments/mode-b, payments/money-testing, payments/standin, reports; `node:*` | — |  | live |
| `reports` | 539 | security/sql-database, ledger, paid-types, live/payments/index, payments/types (type), webhooks | index; tests 2; outside: admin(1) live(3) |  | live |
| `schedule-view.test` | 103 | schedule-view, events (type); `node:*` | — |  | live |
| `schedule-view` | 129 | calendar, events | index; tests 1; outside: live(4) |  | live |
| `seo.test` | 147 | seo; `node:*` | — |  | live |
| `seo` | 125 | catalog (type) | index; tests 1 | UNUSED (tests only); UNCLEAR HOME | live |
| `settings.test` | 118 | organizers, settings; `@gamo/db, node:*` | — |  | live |
| `settings` | 136 | security/crypto, security/sql-database, events | index; tests 1; outside: live(5) |  | live |
| `staff-links.test` | 259 | paid-testing, paid-types, staff-links; `node:*` | — |  | live |
| `staff-links` | 516 | security/crypto, security/env-secret, security/ids, security/pin, security/rate-limit, security/sql-database, paid-types | index, cash-sessions, door-sales; tests 3; outside: live(7) | UNCLEAR HOME | live |
| `ticket-types.test` | 334 | security/sql-database, orders, paid-testing, paid-types, ticket-types; `node:*` | — |  | live |
| `ticket-types` | 515 | security/ids, security/sql-database, money, orders, pricing, paid-types | index; tests 1; outside: live(10) scripts(2) |  | live |
| `ticket.test` | 117 | ticket; `node:*` | — |  | live |
| `ticket` | 188 | — | index; tests 1; outside: live(3) |  | live |
| `tickets.test` | 401 | security/sql-database, find-tickets, order-links, orders, paid-testing, paid-types, tickets, transfers; `node:*` | — |  | live |
| `tickets` | 624 | security/base32, security/crypto, security/env-secret, security/ids, security/sql-database, event-ticketing, events, paid-types, registration | index, checkout, disputes, door-sales, find-tickets +5; tests 3; outside: admin(2) live(9) scripts(3) |  | live |
| `transfers` | 255 | security/base32, security/env-secret, security/ids, security/pii-hash, security/rate-limit, security/sql-database, mail (type), paid-types, paid-mail, tickets | index, order-links; tests 1; outside: live(1) |  | live |
| `verification-mail` | 152 | mail, paid-types (type) | index, verification-meetings; tests 1; outside: admin(1) |  | live |
| `verification-meetings.test` | 374 | paid-types, paid-testing, verification-meetings, verification-mail; `node:*` | — |  | live |
| `verification-meetings` | 776 | security/ids, security/sql-database, services/meeting-time, mail (type), paid-types, verification-mail | index, admin; tests 2; outside: admin(6) live(1) scripts(1) |  | live |
| `visibility-mail` | 21 | mail | index; outside: admin(1) |  | live |
| `webhooks.test` | 268 | paid-testing, paid-types (type), payments/resolve, webhooks; `node:*` | — |  | live |
| `webhooks` | 189 | security/crypto, security/sql-database, paid-types, payments/resolve, payments/signature, payments/types | index, payments-runtime, payments/money-testing, reports; tests 2 | UNCLEAR HOME | live |

### `live/payments/`

| File | Lines | Imports | Imported by | Flags | Proposed home |
| --- | --- | --- | --- | --- | --- |
| `index` | 50 | security/sql-database (type), live/paid-types (type), mode-a, mode-b, resolve, standin, stripe-http, types | index, live/order-routing, live/payment-settings, live/payments-runtime, live/payouts +1 | UNCLEAR HOME | live |
| `mode-a` | 66 | live/paid-types, shared, types (type) | live/order-routing, live/payments/index; tests 3 | UNCLEAR HOME | live |
| `mode-b` | 68 | live/paid-types, shared, types (type) | live/order-routing, live/payments/index; tests 4 | UNCLEAR HOME | live |
| `money-testing` | 143 | security/sql-database, live/ledger, live/paid-testing, live/paid-types (type), live/webhooks, standin (type) | tests 4 | test support; UNCLEAR HOME | live |
| `resolve.test` | 79 | live/paid-testing, resolve; `node:*` | — |  | live |
| `resolve` | 178 | security/sql-database, live/paid-types (type), types (type) | live/events, live/orders, live/paid-event-rules, live/payment-settings, live/payments/index +4; tests 4; outside: admin(1) live(3) scripts(1) tests(1) | UNCLEAR HOME | live |
| `shared` | 75 | live/paid-types, types | live/payment-settings, mode-a, mode-b, live/payouts | UNCLEAR HOME | live |
| `signature` | 83 | security/crypto, live/paid-types (type), types (type) | standin, live/webhooks, live/webhooks; outside: tests(1) | UNCLEAR HOME | live |
| `standin.test` | 398 | live/paid-testing, live/paid-types (type), live/webhooks, mode-a, mode-b, money-testing, resolve, standin, types; `node:*` | — |  | live |
| `standin` | 1179 | security/crypto, security/sql-database, live/paid-types (type), resolve, signature, types | index, live/payments-runtime, live/payments/index, money-testing; tests 4; outside: live(1) scripts(4) | UNCLEAR HOME | live |
| `stripe-http.test` | 296 | mode-a, mode-b, stripe-http, types; `node:*` | — |  | live |
| `stripe-http` | 363 | security/crypto, types | live/payments/index; tests 2 | only via barrel; UNCLEAR HOME | live |
| `types` | 327 | live/paid-types (type) | live/checkout, live/door-sales, live/order-events, live/order-routing, live/paid-event-rules +16; tests 7; outside: admin(1) live(10) | UNCLEAR HOME | live |

### `security/`

| File | Lines | Imports | Imported by | Flags | Proposed home |
| --- | --- | --- | --- | --- | --- |
| `base32` | 71 | — | live/orders, live/registration, live/tickets, live/transfers, ids +1; tests 1 |  | core (the brief only named ids.ts) |
| `codecs.test` | 132 | base32, crypto, ids; `node:*` | — |  | platform/security |
| `crypto` | 120 | — | index, live/clerk, live/events, live/orders, live/organizers +16; tests 2; outside: live(13) |  | platform/security |
| `env-secret` | 39 | crypto | live/checkout, live/find-tickets, live/orders, live/organizers, live/refunds +6 |  | platform/security |
| `ids` | 84 | base32 | live/admin, live/cash-sessions, live/catalog-import, live/checkout, live/codes +23; tests 1 |  | core |
| `index` | 14 | base32, crypto, ids, pii-hash, pin, rate-limit, signed-value, sql-database, turnstile, env-secret | — |  | deleted |
| `pii-hardening.test` | 58 | pii-hash; `node:*` | — |  | platform/security |
| `pii-hash` | 93 | crypto | live/checkout, live/email-typo, live/find-tickets, live/orders, live/organizers +7; tests 3; outside: live(2) |  | platform/security |
| `pin` | 75 | crypto | live/staff-links, security/index; tests 1; outside: live(1) |  | platform/security (generic, but its only user is Live door staff) |
| `rate-limit.test` | 95 | rate-limit, pii-hash, sql-database (type); `@gamo/db, node:*` | — |  | platform/security |
| `rate-limit` | 110 | sql-database | live/checkout, live/cleanup, live/find-tickets, live/organizers, live/refunds +4; tests 1 |  | platform/security |
| `secrets.test` | 147 | crypto, pii-hash, pin, signed-value; `node:*` | — |  | platform/security |
| `signed-value` | 47 | crypto | security/index; tests 1 | UNUSED (tests only); UNCLEAR HOME | platform/security |
| `sql-database` | 66 | `@gamo/db` | index, live/admin-orders, live/admin-schedule, live/admin, live/cash-sessions +46; tests 9; outside: admin(11) live(25) web(1) scripts(1) |  | platform/db |
| `turnstile.test` | 137 | turnstile; `node:*` | — | UNCLEAR HOME | platform/security |
| `turnstile` | 97 | — | security/index; tests 1 | UNUSED (tests only); UNCLEAR HOME | platform/security |

### `services/`

| File | Lines | Imports | Imported by | Flags | Proposed home |
| --- | --- | --- | --- | --- | --- |
| `email-outbox.test` | 303 | email-outbox; `@gamo/db, node:*` | — | old schema: email_log, email_suppressions | platform/email |
| `email-outbox` | 478 | types/enums (type), security/crypto, security/env-secret, security/ids, security/pii-hash, security/sql-database; `@gamo/config, @studio-gamo/integrations` | index, provider-review; tests 1 | old schema: email_log, email_suppressions | platform/email |
| `live-external-discovery` | 874 | — | index, live/catalog-import, live/catalog, live/events, verified-catalog-2026-10-15; tests 1; outside: live(12) web(1) scripts(2) |  | live |
| `meeting-time` | 53 | — | index, live/events, live/verification-meetings, live/verification-meetings; outside: admin(3) live(2) |  | partners |
| `notifications` | 326 | `@gamo/config, @gamo/db, @studio-gamo/integrations, drizzle-orm` | index | UNUSED; old schema: event_registrations, events, notification_jobs; UNCLEAR HOME | platform/email |
| `participation` | 78 | `@gamo/db, drizzle-orm, zod` | index; outside: admin(1) | old schema: participation_inquiries | partners |
| `provider-review` | 467 | security/ids, security/sql-database, types/enums (type), email-outbox, providers; `@gamo/config` | index; outside: admin(2) | old schema: persons, provider_profiles, verification_records | partners |
| `providers` | 898 | security/ids, security/sql-database, types/enums, terms/acceptance, terms/registry | index, provider-review; outside: admin(2) | old schema: provider_profiles, verification_records | partners |
| `verified-catalog-2026-10-15` | 1014 | live-external-discovery (type) | index | UNUSED; UNCLEAR HOME | live |

### `terms/`

| File | Lines | Imports | Imported by | Flags | Proposed home |
| --- | --- | --- | --- | --- | --- |
| `acceptance` | 213 | types/enums, security/ids, security/pii-hash, security/sql-database, registry, sync | services/providers, terms/index; tests 1; outside: scripts(1) | old schema: marketing_consents | platform/terms |
| `index` | 4 | registry, acceptance, sync | index |  | deleted |
| `registry` | 133 | types/enums, security/crypto | live/events, live/paid-event-rules, services/providers, acceptance, terms/index +1; tests 1; outside: admin(1) live(5) web(3) scripts(2) |  | platform/terms |
| `sync` | 27 | security/ids, security/sql-database, registry | acceptance, terms/index; outside: scripts(1) | old schema: terms_documents | platform/terms |
| `terms.test` | 206 | types/enums, registry, acceptance; `@gamo/db, node:*` | — | old schema: terms_documents | platform/terms |

### `types/`

| File | Lines | Imports | Imported by | Flags | Proposed home |
| --- | --- | --- | --- | --- | --- |
| `enums` | 305 | — | services/email-outbox, services/provider-review, services/providers, terms/acceptance, terms/registry +4; tests 2; outside: admin(2) scripts(1) |  | core (the rest of the file is unused (WO2 deletes it)) |
| `index` | 4 | enums, policy, ticketing | — |  | deleted |
| `policy` | 356 | enums | types/index; tests 1 | UNUSED (tests only) | deleted |
| `ticketing` | 191 | enums (type) | types/index; tests 1 | UNUSED (tests only) | deleted |
| `types.test` | 222 | enums, policy, ticketing; `@gamo/db, node:*` | — | old schema: event_policies, organizer_profiles, persons, provider_profiles, ticket_scan_events | core |
