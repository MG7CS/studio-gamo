# API compatibility decisions

> **Status (2026-10-19):** the previous admin app (`apps/admin`: pages, `/api/*` staff routes, `scripts/admin/*`, `staff:account:sql`, `make *-admin`) was deleted and a new admin is being designed from scratch. What this describes about it is historical. Still in the repo: the shared backend (`@gamo/auth` staff and admin-password code, `AdminService`, `ParticipationService`, the review handlers in `@gamo/domain`), the `admin` entries in `@gamo/config`, the `adminCredentials` table (migration 0005) and the admin Cloudflare resources.


## Unreleased — Gamo Live ticketing (Phase 12c, Agent B; the lead assigns the version)

Breaking changes (no external client is known; the Live UI is the only consumer and was rewritten with them):
- `POST /api/events/{id}/register` (`registerAttendee`): the body is now `OrderInput` (`items[]` of `categoryId`/`sectionId`/`quantity`, `purchaserName`, `email`, `emailConfirm`, `termsAccepted`, `termsDocuments`, `idempotencyKey`, Turnstile token) instead of `{ attendeeName, attendeeEmail, quantity }`. It answers `202` with a `confirmToken` (identical for every address, no `201`/`200` split) instead of `201`/`200` + `isDuplicate`; tickets are issued only after `POST /api/orders/confirm`. New errors: `403` (security check), `413`, `415`, `429`, `503`; `409` carries `details.remaining`.
- `POST /api/checkout/session` (`createTestCheckout`): body is `TicketCheckoutInput` (`eventId` + `OrderInput`) instead of `{ eventId, tierIndex, quantity, customerEmail, … }`; answers `200 { status: 'checkout', checkoutUrl, … }` or `202` for a free total. Always `503` in production (code path); error envelope is `TicketingError`.
- `POST /api/tickets/lookup` (`lookupTicketRecords`): no longer returns tickets or accepts a sign-in code; it always answers `202` with the same message and emails a 30-minute link. The old response (`registrations`, `tickets`, raw `qrToken`) is gone.
- `POST /api/orders/{id}/refund` (`processOrderRefund`): body is `{ ticketIds?, reason }` (per-ticket, cumulative) instead of `{ reason, amountCents? }`; response `RefundResponse`.
- `POST /api/webhook/stripe`: financial events are now processed (no more blanket `503`); `409` while another delivery of the same event is in flight; `503` only without `STRIPE_WEBHOOK_SECRET`; errors use the standard envelope.
- `POST /api/events` (`proposeEvent`): additionally accepts the organizer form shape (`EventEditInput`: venue-local `start`, `policy`, `categories`) and answers `201 { eventId, slug, status, message }`; the old shape (`startsAt`) still works and always goes to review.

Additive: `POST /api/orders/confirm`, `POST /api/tickets/{id}/transfer`, `POST /api/tickets/{id}/reissue`, `POST /api/events/{id}/changes`, `POST /api/events/{id}/waitlist`, `POST /api/webhook/resend`, `PATCH /api/events/{id}`; security scheme `CustomerSession` (cookie `__gamo_customer`).
- Verification: `pnpm api:check`, contract tests (63 operations over loopback HTTP).

## 2.1.0

Base: 1d4bbad
Base: 35d233d
Base: HEAD

Additive/corrective changes (cleanup pass Phase 3, `docs/CLEANUP_LOG.md` F-06, F-17, F-28):
- `POST /api/checkout/session`: added `403` (cross-origin browser request) and removed the never-returned `404`; description now matches behavior (503 when paid checkout is unconfigured outside local, before any hold is created; 503 when the order/inventory/authorization gate is closed; idempotency key is honored).
- `POST /api/events/{id}/register`: added `403` (cross-origin browser request; the route now calls `requireSameOrigin`).
- `POST /api/tickets/lookup` and `DELETE /api/auth/session`: documented the `403` that `requireSameOrigin` already returned; `POST /api/tickets/lookup` also documents `429` (verification code locked after too many attempts), which it already returned.
- `StripeEvent.data` now allows additional properties: real `*.updated` events carry `data.previous_attributes` and were rejected with `400`, making Stripe retry indefinitely.
- Live private operations now require a Gamo Live product account (`403` was already declared); unauthenticated requests are rejected before body validation (`401` instead of `400`).
- Affected consumers: none in the repository besides the Live UI, which already sends same-origin requests.
- Verification: `pnpm api:check`.

## 2.0.0

Base: 1d4bbad
Base: 35d233d
Base: HEAD

Breaking removal of two demo stubs (cleanup pass, `docs/CLEANUP_LOG.md` F-33/F-46):
- Removed `POST /api/check-in/confirm` (`demoCheckinConfirm`) and `POST /api/check-in/fail` (`demoCheckinFail`) from `apps/worship`. Both were `x-status: demo-stub`: unauthenticated, ignored their input, persisted nothing and only answered `303`. The UI never called them (the check-in pages linked with plain `GET` links).
- Affected consumers: none found in the repository; no external client is known.
- Replacement: none yet. The `/check-in/[id]` page now states that online check-in is not available and that arrival is confirmed with the on-site coordinator. A real check-in endpoint must be designed with authentication, assignment ownership and idempotency before it is added back.
- Also corrected `info.description` to the approved Public Benefit Corporation wording.
- Verification: `pnpm api:check` (regenerated bundles, types and validators; contract tests updated: the stub test removed, coverage counts reduced by the two operations).

## 1.5.0

Base: 2be582c
Base: 1d17ee6
Base: 6103121
Base: HEAD

Additive product-specific account registration, sign-in intent, and product membership isolation contracts in `1.5.0`:
- `POST /api/auth/challenge` (`AuthChallengeInput`) and `POST /api/auth/verify` (`AuthVerifyInput`): Added optional `intent` (`signin | signup | recover`) and `product` (`web | worship | academy | live | production`) fields while keeping existing `{ email, displayName, purpose }` and `{ email, code, displayName }` payloads backward-compatible.
- `GET /api/auth/me` (`AuthMeResponse`): Added optional `products` (active product memberships for the authenticated user) and `product` (the product scope for the active session) fields, plus `403` (`LegacyError`) when a session from one product is presented to another product where the user has not established a product account.

## 1.4.0

Base: 2be582c
Base: 1d17ee6
Base: 6103121
Base: HEAD

Additive Gamo Live public concert discovery and external ticket referral contracts in `1.4.0`:
- `GET /api/events` (`EventFilters`): Added optional `metro`, `q`, `dateTo`, and `weekend` query parameters while keeping existing `category`, `city`, `artist`, `venue`, and `dateFrom` query filters backward-compatible.
- `Event` and `EventDetails` (`GET /api/events`, `POST /api/events`, `GET /api/events/{id}`, `GET /api/events/pending`, `POST /api/events/{id}/review`): Added optional external discovery provenance, attribution, and referral fields (`listingType`, `importKey`, `metroSlug`, `startDateLocal`, `startTimeLocal`, `publishedByLabel`, `publishedByUserId`, `originalOrganizerName`, `externalDestinationKind`, `externalTicketProvider`, `externalOnly`, `priceMinCents`, `currency`, `ticketAvailability`, `sourceUrlsJson`, `lastVerifiedAt`, `artworkUrl`, `artworkRightsVerified`, `artworkLicenseCredit`, `editorialStatus`, `editorialNotes`, `independentDisclosure`, `isFeatured`) plus optional `performers` list on `EventDetails`. External discovery listings remain strictly outbound referrals (`admissionType: 'external'`, `externalOnly: true`) and never enter Gamo Live checkout or registration.

## 1.3.0

Base: 1d17ee6
Base: 6103121
Base: HEAD

Additive standalone Gamo Live consumer platform contracts in `1.3.0`:
- `GET /api/events` (`EventFilters`): Added optional `artist`, `venue`, and `dateFrom` query filters while keeping existing `category` and `city` filters backward-compatible.
- `POST /api/events/{id}/team` (`apps/live`): Assigns role-scoped event team permissions (`event_team_members`). Enforces separation between publishing/content authority and refund/settlement authority.
- `POST /api/tickets/lookup` (`apps/live`): Verified self-service order, receipt, and QR pass lookup requiring both `email` and a verified 6-digit email challenge code (`verificationCode`).
- `POST /api/tickets/scan` (`apps/live`): Door admission QR check-in endpoint requiring `scan_tickets` permission, enforcing replay protection (`409 REPLAY_BLOCKED`), and recording scan audit records (`ticket_scans`).
- `GET /api/artists` and `POST /api/artists` (`apps/live`): Public artist directory and verified artist profile creation (`artist_profiles`) with optional `musicianProfileId` link that keeps Gamo Worship rankings separate.
- `POST /api/artists/{id}/representatives` and `POST /api/representations/{id}/revoke` (`apps/live`): Scoped artist representation authorizations (`representation_authorizations`) with conflict detection for active exclusive representation (`409 REP_EXCLUSIVE_CONFLICT`) and audit-preserving revocation.
- `POST /api/bookings/inquiries`, `POST /api/bookings/inquiries/{id}/offers`, and `POST /api/bookings/offers/{id}/accept` (`apps/live`): End-to-end artist booking inquiry, counteroffer negotiation, and immutable engagement confirmation (`performance_engagements`) separating artist fee, agent commission, and platform administrative allocation while keeping deposits disabled pending policy approval.
- `POST /api/checkout/session`, `POST /api/webhook/stripe`, and `POST /api/orders/{id}/refund` (`apps/live`): Extended `CheckoutInput`, `CheckoutResponse`, and `WebhookResponse` with optional order/hold fields. Unverified organizers and unbacked webhook events continue to fail closed (`503`), while verified, ticketing-authorized organizers support atomic expiring `ticket_holds`, `ticket_orders`, idempotent sandbox webhook fulfillment (`tickets`, `settlement_records`), and permission-scoped refunds (`refund_records`).
- `GET /api/events/{id}/production-requests` and `POST /api/events/{id}/production-requests` (`apps/live`): Links Gamo Production requests (`production_requests.event_id`) directly to an event without duplicating event identity or exposing financial/attendee records.

## 1.2.0

Base: 6103121
Base: HEAD

Additive verified-identity, organization-onboarding, and staff-provisioning contracts in `1.2.0`:
- `POST /api/auth/challenge` (`apps/web`): Issues a time-bounded 6-digit email verification code (stored as a SHA-256 hash in `auth_challenges`) and dispatches it via email (`AuthChallengeInput` -> `AuthChallengeResponse`). Rate-limited per email (5 challenges per 15 minutes -> `429`).
- `POST /api/auth/verify` (`apps/web`): Verifies the 6-digit email challenge code against `auth_challenges` (10-minute expiry, 5-attempt lockout -> `401`/`429`), sets `users.verified_email_at`, rotates any presented prior session cookie, and issues a host-only `HttpOnly` `__session` cookie (`AuthVerifyInput` -> `SessionResponse`).
- `GET /api/auth/me` (`apps/web`): Validates the active D1 session cookie and returns the authenticated user profile (`verifiedEmailAt`), global system roles, and active organization memberships (`AuthMeResponse`).
- `POST /api/organizations` (`apps/web`): Requires an active D1 session with a verified email address (`401`/`403`), creates the organization (`409` on duplicate slug), assigns the caller as active `owner` in `organization_members`, initializes an unverified `organizer_profiles` row, and records an `audit_logs` entry (`CreateOrganizationInput` -> `CreateOrganizationResponse`).
- `POST /api/staff/provision` (`apps/admin`, `x-internal: true`): Restricted to active `superadmin` users behind the Admin Access boundary (`401`/`403`). Creates/updates the target staff user, binds their immutable Cloudflare Access `sub` in `external_identities` (`409` on subject conflict), assigns a global staff role (`staff_reviewer`, `finance_manager`, `superadmin`), and records an `audit_logs` entry (`ProvisionStaffInput` -> `ProvisionStaffResponse`).
- Updated `openapi/root.yaml` `info.description` to be legal-structure-neutral while Gamo Studios' final incorporation and tax status remain undecided.
- Existing `1.1.0` operations and schemas remain backward-compatible.

## 1.1.0 (2026-10-13 — Independent Backend Security & Reliability Audit)

Comparison baseline: `6103121` (`0.1.0` contract adoption).

Intentional protective and privacy contract updates in `1.1.0`:
- `POST /api/events/{id}/register` (`RegisterAttendee` / `RegistrationResponse`):
  - Removed untrusted client-supplied `userId` from `RegisterAttendee` request schema.
  - Removed `registration` object (attendee PII and `qrToken`) from `RegistrationResponse` on both initial (`201`) and duplicate (`200`) responses to prevent unauthenticated pass/PII harvesting by email enumeration.
  - Updated response message to state that confirmation is durably queued and email delivery is not yet enabled.
- `GET /api/events/pending` and `POST /api/events/{id}/review`:
  - Security requirements now require both a boundary credential (`CloudflareAccess` or explicit non-production break-glass credential) **and** `BrowserSession` (`__session` cookie belonging to an active D1 user with global `staff_reviewer` or `superadmin` role).
  - Added `403` (`LegacyError`) for missing staff role, mismatched Access vs. D1 email, or attempting to review an event belonging to the reviewer's own organization.
  - Added `409` (`LegacyError`) on `POST /api/events/{id}/review` when an event has already been reviewed.
  - Preserved `revision_requested` as a distinct status in `EventStatus` (`pending_review`, `approved`, `rejected`, `revision_requested`, `canceled`).
- `POST /api/checkout/session` and `POST /api/webhook/stripe`:
  - Added `503` (`SimpleError`) protective gate responses. Checkout requests validate `CheckoutInput` (`400` on invalid input) and return `503` while order/inventory/organizer-authorization authority is unbuilt. Financial Stripe webhook events (`checkout.*`, `charge.*`, `payment_intent.*`, `refund.*`) return `503` without marking the event processed in D1.
- `POST /api/auth/session` and `DELETE /api/auth/session`:
  - Enforced `requireSameOrigin` (`403` on cross-origin or sibling-subdomain mutations), loopback hostname restriction on demo session creation, prior-session rotation, and host-only cookies (no `.gamostudio.org` wildcard `Domain` attribute).

All generated bundles (`openapi/bundled/{public,internal}.json`), TypeScript declarations (`packages/api-contracts/src/{public,internal}.d.ts`), and standalone Worker validators (`packages/api-contracts/src/validators.js`) were regenerated via `pnpm api:types` and verified with `pnpm api:check`.

## 0.1.0

Initial OpenAPI adoption of existing unversioned routes; no prior specification baseline. Source baseline: cb97c37 on main, initially four commits ahead of origin/main; clean worktree.

URLs and legacy JSON envelopes remain. Intentional validation/security behavior changes: production email-only session creation denied (403); event proposals now require organization membership (401/403); unpublished detail returns 404; invalid checkout quantity/tier and extra fields return 400 instead of coercion; unknown/missing checkout events return 404 instead of default pricing; free registration rejects paid/external events and cross-event/nonfree tiers with 409; malformed JSON, wrong media types and non-RFC3339 timestamps rejected; unexpected exceptions no longer expose messages. Signed live webhook events rejected; unapproved 5% administrative allocation and estimated processor deductions removed. Missing D1 binding now produces an explicit failure instead of an unmigrated Node fallback. Local demo session clients must explicitly configure ENVIRONMENT=local and ALLOW_DEMO_SESSION=true.

Existing UI screens have no REST fetch consumers. Service integration tests and the new HTTP contract suite validate local behavior. Real clients and production availability have not been verified. No production rollout was performed. This is a pre-production correction, not a promise of a working identity or ticketing system.

Future entries must identify affected consumers, migration/deprecation plan, exact comparison Base SHA, verification evidence and owner authorization for policy changes. Bump contract info.version for changes to existing operations/schemas.
