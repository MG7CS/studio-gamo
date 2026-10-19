# Admin — requirements and design lock (draft, 2026-10-19)

The previous admin (`apps/admin`) and the first rebuild were deleted. This is the plan for the new one. Status: **approved by the owner 2026-10-19** (including the contrast deviations, palette exception, Inter only, CSS-only decoration, no dark mode); nothing below is built yet.

## 1. Principles

- **One admin, one account.** No roles, staff management, audit trail, passwords, sessions or sign-in/sign-out pages.
- **Cloudflare Access alone.** Every request must carry a valid Access assertion whose email equals `ADMIN_EMAIL` (the admin's own address, separate from any product user). Anything else, or any error, is denied. Sign-out is Access's logout link. Local development uses an explicit, loopback-only dev identity from `.dev.vars` (fatal outside `ENVIRONMENT=local`, like the other local-only flags).
- **Recovery** is changing the Access policy in Cloudflare. No in-app backdoor, no break-glass variables.
- **No fake data, ever.** Every number, badge and list comes from a real query; empty states say so honestly. Nothing appears in navigation without a working page behind it.
- **Keep the old worker live** (`gamo-admin`, `admin.gamostudio.org`) until the new one replaces it, after the owner has signed in through a preview deployment with real Access.

## 2. v1 scope (replaces the live admin)

| Screen | What the admin does | Data |
|---|---|---|
| Inbox (home) | See everything waiting, at a glance | counts and the oldest waiting items, from the four queues below |
| Church verification | schedule the in-person meeting, verify, request changes, reject, suspend, reinstate | `provider_profiles` (role church), `verification_records` |
| Provider review (+ profile page) | the same decisions for musicians, technicians, teachers, artists, agents | same |
| Event review (Gamo Live) | approve / ask for changes / reject with a note; the organization's owners are emailed; first approval recorded | Live database: `events`, `organizations`, `review_decisions` |
| Organizations (Gamo Live) | verify / remove verification, suspend (note required) / reinstate, "review every event" switch, decision history | Live database: `organizations`, `memberships`, `review_decisions` |
| Catalog (Gamo Live) | approve and publish, hide, mark featured (labeled) the editorial external listings | Live database: `events` (origin `catalog`), `catalog_sources` |
| Participation requests | read, reply (visible to the participant), mark reviewed or closed | `participation_inquiries` |
| Legal (read-only) | terms versions, review status, acceptance counts | `terms_documents`, `terms_acceptances`, registry |

Not in v1: charts or trends (no history table to draw them from), search, notifications bell, messages, analytics, reports, users, roles, settings, billing.
v1.1: email outbox (failed and suppressed emails, retry). Later, on real demand: Live orders and refunds, Academy registrations, mission reporting.

Decision emails to providers and organizers stay as they are today; failures become visible in v1.1.

## 3. Design lock — claymorphism

Source: `design-reference/claymorphism-admin-ui/` (three images: dashboard overview and mobile, desktop dashboard, design system sheet). The admin UI uses this style throughout; it is the **only** visual system for admin pages. Public sites keep the booklet system (terracotta, charcoal, cream); `packages/ui` tokens are not changed.

**Palette (owner decision 2026-10-19, replaces the lavender of the sheet):** admin pages use the same app palette as every other app: the shared tokens in `packages/ui/src/styles/tokens.css` (terracotta `#B34E24`, deep `#8F3B18`, soft `#D98B62`, ink `#18181B`, cream `#F9F6F0`, sand `#EDE6DA`, tan `#D8C5AE`, line `#DCD3C6`, muted `#57534E`, Inter). `apps/admin/src/styles/clay.css` imports them and only adds the clay shape language: the accent scale mapped onto the palette (50 cream, 100 sand, 300 tan, 500 soft, 600 terracotta, 700 deep, 800 `#6F2D12`), page cream, white surfaces, body text `#44403C`, control borders `#8A8176`, the 10/16/24/32/48 radii, an 8 px grid, and warm versions of the soft / card / inset / button shadows. No gradients anywhere (owner decision): one flat page color, white cards. Status words keep green / amber / red tints so meaning does not depend on terracotta.

Contrast (WCAG 2.2 AA, all computed): ink on white 17.7:1; body `#44403C` on white 10.3:1 (on cream 9.5:1); muted on white 7.6:1 (on sand 6.2:1); white on deep terracotta (primary buttons) 7.5:1; deep terracotta on sand (active nav) 6.0:1; control border 3.8:1; success text `#1F7A52` 5.3:1.

Components taken: sidebar (collapsible to an icon rail; the official Gamo Studios logo with an "Admin" label, and only the official Gamo symbol when collapsed; no invented mark) with the active item raised, top bar with admin chip, stat cards, list cards with icon chips, primary/secondary/ghost buttons, inputs and selects with inset shadow and a visible focus ring, checkbox/radio/switch, tags (New, Success, Warning, Danger), progress bar, pagination, mobile bottom tab bar, no decorative blobs.

Taken from the design and **dropped** because there is no real data or no purpose: revenue/customer/conversion numbers, sparklines and charts, trend arrows ("+12.5%"), "Upgrade to Pro", Help Center, Google sign-in and the login page, search, bell, "Good morning" copy that implies activity.

### Accessibility

Targets ≥ 44 × 44 px, visible focus ring, one `<h1>` per page, no horizontal overflow at 360 px, axe serious/critical clean, and soft shadows are never the only separator (inputs keep a 3:1 border).

## 4. Layout and states

- **Shell:** the dashboard is the page itself (full viewport, no floating panel and nothing behind it, owner decision 2026-10-19): sidebar (Inbox, Participation requests, Church verification, Provider review, Event review, Organizations, Catalog, Legal; the phone tab bar groups the three Gamo Live screens under one "Live" tab; below it the admin's email and a Sign out link to Access's logout), top bar with the page title and admin chip, mobile bottom tab bar. Badges only for real counts above zero.
- **Every list:** loading is server-rendered (no spinners), honest empty state, "showing the first N" when truncated, filters as links.
- **Every decision:** plain form POST with a redirect and a result message; errors explain what to fix; nothing is saved silently.
- **Errors:** 404 and 500 render in the same shell; unauthenticated is a plain 401/403 (Access handles login).
- **Security:** same CSP as today (no inline scripts, no external origins), no-store caching, same-origin check on every write, every handler checks the gate itself.

## 5. Backend cleanup that goes with it (separate commits)

**Done 2026-10-19:** admin-password and gate-cookie code, `requireStaff`/`requireSuperadmin`/`verifyStaffBoundaryIdentity`, `provisionStaffIdentity` and its schema and OpenAPI schemas, the review form handlers (the meeting-time helper moved to `services/meeting-time.ts`), break-glass and `ADMIN_*` variables (`ADMIN_EMAIL` added). Also done: product-level `superadmin` overrides and `isStaffOrAdmin`, and every `audit_logs` write (tables stay until an approved drop migration). **Still to do:** the `staff_reviewer` role check, self-review rules and actor signatures (decided with each screen), a one-time backfill of `users.person_link_opt_out_at` from old `person.unlinked` audit rows before `audit_logs` is dropped, and the drop migration for `audit_logs` and `admin_credentials`.

Remove: `admin_credentials` use and the admin-password code, the gate cookie, staff roles and provisioning (`staff_reviewer`, `superadmin`, `provisionStaffIdentity`, `requireStaff`, `requireSuperadmin`, `verifyStaffBoundaryIdentity` and Access-subject bindings), break-glass and `ADMIN_*` variables, `audit_logs` writes in services, self-review rules. Change: review services take the admin's email as the actor name instead of a staff user ID. Keep: `verification_records` (providers see their decision history). Migrations already applied are never edited; dropping tables or columns, if wanted, is a new migration.

## 6. Build order

1. ~~Gate and shell in the clay style~~ (done 2026-10-19).
2. ~~Inbox and the real counts~~ (done 2026-10-19; links to the queues are added as each queue page is built).
3. ~~Church verification and provider review~~ (done 2026-10-19).
4. ~~First-event review~~ (done 2026-10-19), rebuilt on Gamo Live's own database with Organizations and Catalog (2026-10-19).
5. ~~Participation requests~~ (done 2026-10-19).
6. ~~Legal~~ (done 2026-10-19).
7. ~~Built-worker checks~~ (done 2026-10-19: `tests/e2e/admin.spec.ts`).
8. Preview deployment, owner signs in through real Access, then cutover (delete the old worker).

Each step: screenshots from the running UI compared with the design, axe and 360 px checks, tests written alongside (run only when the owner asks).

## 7. Decisions (all approved 2026-10-19)

1. Approve the contrast deviations above and the palette exception.
2. Inter only (no Plus Jakarta Sans, which the sheet also lists), to avoid a new font dependency?
3. Decorative blobs: CSS-only soft shapes (no image assets) on the shell background. OK?
4. Dark mode: not in the designs, so not in v1.
