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
| First-event review | approve / ask for changes / reject; "review every event" switch per organizer | `events`, `organizer_profiles` |
| Participation requests | read, reply (visible to the participant), mark reviewed or closed | `participation_inquiries` |
| Legal (read-only) | terms versions, review status, acceptance counts | `terms_documents`, `terms_acceptances`, registry |

Not in v1: charts or trends (no history table to draw them from), search, notifications bell, messages, analytics, reports, users, roles, settings, billing.
v1.1: email outbox (failed and suppressed emails, retry). Later, on real demand: Live orders and refunds, Academy registrations, mission reporting.

Decision emails to providers and organizers stay as they are today; failures become visible in v1.1.

## 3. Design lock — claymorphism

Source: `design-reference/claymorphism-admin-ui/` (three images: dashboard overview and mobile, desktop dashboard, design system sheet). The admin UI uses this style throughout; it is the **only** visual system for admin pages. Public sites keep the booklet system (terracotta, charcoal, cream); `packages/ui` tokens are not changed.

Tokens read from the design system sheet (approximate, sampled from the image):

| Token | Value |
|---|---|
| primary 50 / 100 / 300 / 500 / 600 / 700 | `#f3ebfe` / `#eee6fd` / `#d4c5fa` / `#9e8bf1` / `#8d78ed` / `#6d59d6` |
| page background | `#f5f3fb`; surface `#ffffff`; surface soft `#f7f4fc` |
| text main | `#283354` |
| semantic fills | success `#9de5c2`, warning `#fdd29a`, danger `#fd969d`, mint `#bcefdb`, peach `#fdc8ba`, lavender `#e3d6fb` |
| type | Inter (self-hosted, already in the repo); display 48/800, H1 40/800, H2 32/700, H3 24/700, body 16/400, small 14/500, caption 12/500 |
| spacing | 8 px grid (4 8 12 16 24 32 40 48 64 80) |
| radius | 10 / 16 / 24 / 32 / 48 / 999 |
| shadows | soft `12px 12px 32px rgba(78,64,120,.12), -8px -8px 24px rgba(255,255,255,.9)`; card `0 18px 45px rgba(81,65,130,.16)`; input inset `inset 4px 4px 10px rgba(88,78,120,.08), inset -4px -4px 10px rgba(255,255,255,.9)`; button `0 14px 28px rgba(104,71,232,.32)` |

Components taken: sidebar (collapsible to an icon rail; the official Gamo Studios logo with an "Admin" label, and only the official Gamo symbol when collapsed; no invented mark) with the active item raised, top bar with admin chip, stat cards, list cards with icon chips, primary/secondary/ghost buttons, inputs and selects with inset shadow and a visible focus ring, checkbox/radio/switch, tags (New, Success, Warning, Danger), progress bar, pagination, mobile bottom tab bar, no decorative blobs.

Taken from the design and **dropped** because there is no real data or no purpose: revenue/customer/conversion numbers, sparklines and charts, trend arrows ("+12.5%"), "Upgrade to Pro", Help Center, Google sign-in and the login page, search, bell, "Good morning" copy that implies activity.

### Required deviations (accessibility is not optional here)

The sheet's text colors fail WCAG 2.2 AA: body text `#a0a4c3` is 2.4:1 on white, muted `#d3d5e6` is 1.5:1, and white on primary 500/600 is 2.8:1 and 3.5:1. The admin therefore uses:

| Use | Value | Contrast |
|---|---|---|
| main text | `#283354` | 12.4:1 |
| body/secondary text | `#5a6283` | 6.0:1 (5.4:1 on page background) |
| muted/caption text | `#646a8c` | 5.3:1 |
| primary button fill and links | `#6d59d6`, white text | 5.2:1 |
| status text | success `#1f7a52`, warning `#8a5a00`, danger `#b3303c` | 5.3 / 5.9 / 6.2:1 |

Pastel fills (success, warning, danger, mint, peach, lavender) are backgrounds only, never the only carrier of meaning (every status also has a word). Also required: targets ≥ 44 × 44 px, visible focus ring, one `<h1>` per page, no horizontal overflow at 360 px, axe serious/critical clean, and soft shadows must not be the only separator between cards (keep a 1 px border at ≥ 3:1 for inputs).

This is an owner-approved exception to the repo's single-palette UI rule (AGENTS.md "UI"). Recorded in `docs/DECISIONS.md` and AGENTS.md.

## 4. Layout and states

- **Shell:** the dashboard is the page itself (full viewport, no floating panel and nothing behind it, owner decision 2026-10-19): sidebar (Inbox, Church verification, Provider review, First-event review, Participation requests, Legal; below it the admin's email and a Sign out link to Access's logout), top bar with the page title and admin chip, mobile bottom tab bar. Badges only for real counts above zero.
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
4. ~~First-event review~~ (done 2026-10-19).
5. ~~Participation requests~~ (done 2026-10-19).
6. ~~Legal~~ (done 2026-10-19).
7. Preview deployment, owner signs in through real Access, then cutover (delete the old worker).

Each step: screenshots from the running UI compared with the design, axe and 360 px checks, tests written alongside (run only when the owner asks).

## 7. Decisions (all approved 2026-10-19)

1. Approve the contrast deviations above and the palette exception.
2. Inter only (no Plus Jakarta Sans, which the sheet also lists), to avoid a new font dependency?
3. Decorative blobs: CSS-only soft shapes (no image assets) on the shell background. OK?
4. Dark mode: not in the designs, so not in v1.
