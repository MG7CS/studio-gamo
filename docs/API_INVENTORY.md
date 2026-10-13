# Gamo Studios — HTTP API inventory and reconciliation

Updated 2026-10-13. Authoritative contract: [../openapi/root.yaml](../openapi/root.yaml); workflow: [OPENAPI_ARCHITECTURE.md](OPENAPI_ARCHITECTURE.md).

The source baseline was **cb97c37**, with a clean worktree on main, four commits ahead of origin/main. Inspection found **10 API source files and 12 method/path operations**: Web 2, Worship 2, Live 6, Admin 2; Academy and Production 0. All 12 are now specified and exercised over isolated loopback HTTP. This is initial contract coverage, not certification of full business behavior, Worker deployment or provider integration. No future endpoint is represented as implemented.

## Reconciliation table

| Endpoint (owning app) | Implemented | Specified | Contract Match | Test Status |
| --- | --- | --- | --- | --- |
| Web POST /api/auth/session | Local demo only | Yes | Wire matches; verified identity absent; production 403 | HTTP success/validation/production denial |
| Web DELETE /api/auth/session | Yes | Yes | Wire matches; idempotent revoke | HTTP cookie clearing and no-cookie success |
| Live GET /api/events | Yes | Yes | Wire matches; fixed 50-row truncation, no cursor | HTTP schema/filter/cap/order |
| Live POST /api/events | Yes | Yes | Wire matches; tenant guard repaired; retry safety absent | HTTP success/400/401/403/demo-header denial |
| Live GET /api/events/{id} | Yes | Yes | Wire matches; unpublished detail now hidden | HTTP 200/404 including draft |
| Live POST /api/events/{id}/register | Partial | Yes | Wire matches; privacy, user binding and capacity behavior incomplete | HTTP 201/duplicate 200/400/404/409 |
| Live POST /api/checkout/session | Sandbox prototype | Yes | Wire matches; inventory/organizer approval/idempotency absent | HTTP mock success/400/404/409; no Stripe network |
| Live POST /api/webhook/stripe | Partial | Yes | Wire matches tested branches; fulfillment/retry/refund gaps | HTTP signature/live rejection, ignored event/dedup; no Stripe network |
| Worship POST /api/check-in/confirm | Redirect demo stub | Yes | Actual 303 documented, no business behavior | HTTP 303/Location |
| Worship POST /api/check-in/fail | Redirect demo stub | Yes | Actual 303 documented, no dispatch | HTTP 303/Location |
| Admin GET /api/events/pending | Partial | Yes, internal | Wire matches; Access boundary only, unbounded | HTTP middleware 401 HTML and synthetic emergency-credential success |
| Admin POST /api/events/{id}/review | Partial | Yes, internal | Wire matches; revision_requested becomes rejected; staff mapping/RBAC absent | HTTP 200/400/401/404 with explicit demo reviewer fixture |

Counts: specified-and-implemented/stub **12**; initial contract-tested **12**; specified-but-unimplemented **0**; wire mismatches remaining in tested branches **0**. Four operations have substantive business/security reconciliation findings (registration, checkout, webhook, admin review), plus identity demo, admin listing and Worship stub limitations. A schema match is not authorization or production functionality.

## Per-operation contracts and evidence

All paths below are relative to `apps/<app>/src/pages/api/`. Responses are exact component names under OpenAPI; all dates serialize as RFC3339. `LegacyError` describes shared JSON failures, `SimpleError` flat payment failures. The test runner is [../scripts/api/contract.test.ts](../scripts/api/contract.test.ts); preexisting coverage is service-level only unless stated.

| App/source | Method/path and purpose | Authentication / permission | Request | Response and errors | Data dependencies / baseline tests |
| --- | --- | --- | --- | --- | --- |
| web `auth/session.ts` | POST /api/auth/session, demo identity provisioning | Public only with explicit local demo config; **not verified login** | SessionInput: email, optional displayName, JSON | 200 SessionResponse + Set-Cookie; 400/403/500 LegacyError | users/sessions; auth crypto tests did not test issuance route |
| web `auth/session.ts` | DELETE /api/auth/session, revoke | Optional signed cookie; no-cookie logout permitted | No body | 200 LogoutResponse + cleared cookie; 500 LegacyError | sessions; existing cookie-helper tests |
| live `events/index.ts` | GET /api/events, approved discovery | Public | category enum, exact city; no date/cursor/limit | 200 EventListResponse; 400/500 LegacyError | events/organizer_profiles/organizations/ticket_tiers/event_registrations; live-slice service tests |
| live `events/index.ts` | POST /api/events, proposal | Browser session; active owner/admin of organizationId or superadmin | CreateEvent incl tiers; RFC3339 and IANA timezone | 201 CreateEventResponse; 400/401/403/500 LegacyError | events/organizer_profiles/ticket_tiers/memberships/users/sessions/roles; service tests lacked route auth |
| live `events/[id]/index.ts` | GET /api/events/{id}, approved details | Public | Path ID or slug | 200 EventResponse; 400/404/500 LegacyError | same discovery tables; no original route test |
| live `events/[id]/register.ts` | POST /api/events/{id}/register, free attendance | Public; legacy userId is untrusted, unresolved | RegisterAttendee: name/email, quantity 1–10, optional tierId/userId | 201 or duplicate 200 RegistrationResponse; 400/404/409/500 LegacyError | event_registrations/ticket_tiers/events; Resend mock or external when credentials exist; service sequential duplicate tests |
| live `checkout/session.ts` | POST /api/checkout/session, sandbox checkout | Public; paid approved server-priced event, organizer permission missing | CheckoutInput: eventId, integer tierIndex >=0, quantity 1–10, optional email | 200 CheckoutResponse; 400/404/409/500 SimpleError | events/ticket_tiers; Stripe mock/test client; adapter tests only before this phase |
| live `webhook/stripe.ts` | POST /api/webhook/stripe, provider events | Raw-body Stripe Signature, HMAC timestamp; livemode false | StripeEvent; provider object extensible | 200 WebhookResponse; 400/500 SimpleError | stripe_webhook_events/payment_records/ledger_entries/audit_logs; crypto + sequential service dedup tests |
| worship `check-in/confirm.ts` | POST /api/check-in/confirm, demo redirect | None implemented; future assigned-musician permission required | Ignored body | 303 Location /check-in/success, no JSON | None; no baseline test |
| worship `check-in/fail.ts` | POST /api/check-in/fail, demo redirect | None implemented; future scoped staff/dispatch permission required | Ignored body | 303 Location /check-in/standby-notified, no JSON | None; no baseline test |
| admin `events/pending.ts` | GET /api/events/pending, moderation queue | Access middleware or explicit conditional emergency credentials; no domain role lookup | No body/filters | 200 PendingResponse; middleware 401 text/html; 500 LegacyError | events/organizer_profiles/organizations; live service tests, no original middleware HTTP test |
| admin `events/[id]/review.ts` | POST /api/events/{id}/review, moderation | Same boundary; Access sub not mapped to D1 user; demo reviewer fallback | ReviewDecision: approved/rejected/revision_requested, optional notes | 200 ReviewResponse; 400/404/500 LegacyError; 401 text/html | events/moderation_reviews/audit_logs/users; service approval tests |

No general API token scheme, GET /api/auth/me, HTTP media upload, refund, scan or organizer reporting route exists. R2 adapter/service methods and dashboard queries are not REST endpoints. The frontend demos currently issue no REST fetch calls; service tests did not establish a browser-to-Worker end-to-end workflow.

## Findings and disposition

| ID / priority | Classification | Evidence and disposition |
| --- | --- | --- |
| C01 / high | Missing authentication | Email-only POST could create a session for any existing email. Now explicitly local-demo-only; production/preview 403. Verified identity flow is **deferred**, not invented. Shared auth signing fallback remains audit input. |
| C02 / high | Missing authentication/authorization | Event submission accepted x-demo-organizer and lacked tenant enforcement. **Fixed** with requireOrgAccess, regression HTTP 401/403 including forged demo header. |
| C03 / high | Missing authorization | Public detail returned pending/rejected events. **Fixed** to approved-only, regression 404 on pending event. |
| C04 / high | Incorrect validation/business behavior | Checkout coerced quantity and fabricated $25 fallback pricing for unknown event/tier. **Fixed** strict JSON contract, approved paid event lookup, valid tier; browser amount fields denied. No inventory hold or organizer authorization exists; those remain blockers. |
| C05 / high | Inconsistent error handling | Shared and checkout 500 responses leaked exception messages. **Fixed** generic message and negative regression. Log content remains for the independent audit. |
| C06 / high | Incomplete business behavior/privacy | Free registration returns an existing pass/PII based only on email, accepts userId without authentication, lacks atomic capacity enforcement and concurrent duplicate recovery. **Deferred** privacy/access design and serialized reservation authority; paid/external and cross-event/nonfree tiers now rejected. Never expose this slice to unrestricted real users. |
| C07 / high | Missing authorization/identity mapping | Admin trusts Access boundary, not per-operation staff permissions. Access sub is stored as reviewerUserId but FK points to users.id. Emergency/local fallback uses staff_reviewer_demo, absent in production. Local middleware can fall through even when REQUIRE_ADMIN_AUTH is set. **Deferred** real mapping, staff RBAC and dev configuration hardening to subsequent audit/approved auth design. Fixture success does not prove real staff flow. |
| C08 / high | Incomplete business behavior/idempotency | Webhook records processed before effects, non-atomic select/insert dedup, no transaction across records, failed retries may be skipped. No actual ticket issuance/hold release/refund reversal. Currency in ledger fixed usd; loose session payment object validation/state gate. **Deferred** payment state machine and accounting reconciliation. |
| C09 / high | Governance/sandbox discrepancy | Webhook applied unapproved 5% allocation and estimated processing deduction. **Fixed** both deductions to zero pending approved policy/actual accounting. Signed live events now rejected before D1 writes. No fee or live payment enabled. |
| C10 / medium | Incorrect response semantics | reviewDecision allows revision_requested, service maps it to rejected. **Deferred** approved state/notification policy; explicitly described in contract. |
| C11 / medium | Missing pagination/filter implementation | Discovery lacks cursor/date filter (old inventory falsely advertised dates); pending queue unbounded. **Documented accurately**, deterministic startsAt/id list order added. Future paging requires contract-first consumer review. |
| C12 / high | Worker/runtime mismatch | Production db client imported node:sqlite and missing binding yielded unmigrated DB. **Fixed** test-only @gamo/db/testing; production requires explicit D1 binding. D1 schema/migration drift remains audit input (e.g. user_roles PK and missing schema indexes not reflected in older SQL). |
| C13 / medium | Missing implementation/auth | Worship check-in operations only redirect, no session/ownership/dispatch or persistence. **Specified as demos**, no functionality invented. |
| C14 / high | Missing protective behavior | Rate limits and CSRF/origin enforcement absent; auth role lookup ignores stored role scope; domain writes not uniformly transactional; registration HTML interpolation and Resend delivery reporting incomplete. **Deferred** to independent security/reliability audit after this foundation. No 429 enforcement claim made. |

These findings are reconciliation evidence, not the broader independent security/reliability audit. No new provider, policy decision, production access or remote mutation was authorized by schema generation.

## Planned but unimplemented capabilities

The previous inventory listed **34 candidate future operations** below. They remain **proposals with unresolved request/response, roles and policy**; none is added to OpenAPI paths or generated clients. The old admin `/api/admin` prefixes and any terminology in this list are historical candidates, not approved route contracts. Write an authoritative contract only when implementing an approved slice. Media upload-ticket/confirm workflow in the older backend architecture is also conceptual; no HTTP media route exists.

| Method | Historical candidate path | Status | Intended audience | Purpose |
| --- | --- | --- | --- | --- |
| `GET` | `/api/organizer/events` | **Planned** | Organizer Role | Lists events belonging to the caller's organization. |
| `GET` | `/api/organizer/events/[id]/stats` | **Planned** | Organizer Role | Returns attendee counts, ticket tier allocations, and headcount analytics. |
| `POST` | `/api/organizer/verify` | **Planned** | Organizer Role | Submits ministry documentation for ticketing authorization. |
| `POST` | `/api/tickets/[token]/scan` | **Planned** | Scanner / Staff | Idempotently scans and admits an attendee QR token. |
| `POST` | `/api/promote/request` | **Planned** | Organizer Role | Requests manual campaign promotion assistance from Gamo staff. |
| `POST` | `/api/apply/musician` | **Planned** | Candidate | Submits musician profile, instruments, home zone, and audition links. |
| `POST` | `/api/gigs/request` | **Planned** | Church Admin | Submits worship service staffing request with required instrument slots. |
| `GET` | `/api/gigs` | **Planned** | Church Admin | Lists active, confirmed, and pending church service requests. |
| `POST` | `/api/gigs/[id]/assign` | **Planned** | Staff / Worship Leader | Assigns vetted primary and standby musicians to open positions. |
| `POST` | `/api/musicians/[id]/availability`| **Planned** | Musician Role | Updates musician blackout calendar and radius preferences. |
| `GET` | `/api/musician/assignments` | **Planned** | Musician Role | Lists upcoming gig assignments, rehearsal times, and setlists. |
| `POST` | `/api/standby/respond` | **Planned** | Standby Musician | Accepts or declines emergency dispatch request. |
| `GET` | `/api/classes` | **Planned** | Public | Lists group classes, instrument clinics, and instructor availability. |
| `GET` | `/api/instructors` | **Planned** | Public | Lists vetted music instructors with bios and teaching specialties. |
| `POST` | `/api/enrollments/register` | **Planned** | Student / Guardian | Enrolls student into a lesson or class with sliding-scale/sponsor tracking. |
| `POST` | `/api/instructors/apply` | **Planned** | Candidate | Submits instructor application and background check consent. |
| `POST` | `/api/scholarships/apply` | **Planned** | Student / Guardian | Submits assistance request for community-funded music tuition. |
| `GET` | `/api/student/enrollments` | **Planned** | Student / Guardian | Displays active courses, lesson times, and instructor communications. |
| `POST` | `/api/consultations/request` | **Planned** | Church / Ministry | Intakes audio, livestream, acoustics, or lighting consultation requests. |
| `GET` | `/api/projects/[id]` | **Planned** | Client Church | Tracks milestones, equipment recommendations, and training schedules. |
| `POST` | `/api/training/request` | **Planned** | Church Volunteer | Schedules technical volunteer development workshops. |
| `GET` | `/api/portfolio` | **Planned** | Public | Returns verified church case studies and technical transformation logs. |
| `GET` | `/api/auth/me` | **Planned** | Authenticated | Returns current profile, organization memberships, and active roles. |
| `POST` | `/api/organizations` | **Planned** | Authenticated | Creates a new church, ministry, or organizer entity. |
| `POST` | `/api/partnerships/inquire` | **Planned** | Church Leader | Inquires about church partnership, hosting, or mutual support. |
| `POST` | `/api/contact` | **Planned** | Public | General inquiry intake routed to appropriate program director. |
| `POST` | `/api/admin/auditions/[id]/review` | **Planned** | Worship Director | Evaluates musician audition recordings against musical rubric. |
| `POST` | `/api/admin/organizers/[id]/verify` | **Planned** | Staff Reviewer | Authorizes organizer for ticket sales upon identity/legal review. |
| `GET` | `/api/admin/radar` | **Planned** | Operations Staff | Sunday morning live check-in monitoring and emergency standby radar. |
| `GET` | `/api/admin/ledger` | **Planned** | Finance Director | Nonprofit fund accounting entries, program breakdowns, and payables. |
| `POST` | `/api/admin/placements` | **Planned** | Staff Reviewer | Schedules homepage editorial, sponsored, and program placements. |
| `GET` | `/api/admin/audit-logs` | **Planned** | Superadmin | Paginated audit trail of all administrative mutations. |
| `POST` | `/api/admin/dispatches/[id]/override` | **Planned** | Operations Staff | Manual dispatch reassignment override for Sunday worship. |
| `GET` | `/api/admin/metrics` | **Planned** | Executive Director | High-level non-financial impact metrics across all four programs. |

Production blockers: verified identity issuance and signing configuration; staff mapping/scoped permissions; CSRF/rate limits; serialized registration/ticket inventory and privacy-safe pass retrieval; payment/refund/retry state machine; approved fees/accounting/refund policy; real provider sandbox verification; Cloudflare bindings/local edge verification; legal and safeguarding prerequisites. Live donations, memberships and sponsorship processing remain disabled.
