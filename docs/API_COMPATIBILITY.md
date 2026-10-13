# API compatibility decisions

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
