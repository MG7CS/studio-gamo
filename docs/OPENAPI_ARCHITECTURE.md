# OpenAPI-first HTTP architecture

> **Status (2026-10-19):** the previous admin app (`apps/admin`: pages, `/api/*` staff routes, `scripts/admin/*`, `staff:account:sql`, `make *-admin`) was deleted and a new admin is being designed from scratch. What this describes about it is historical. Removed since: the admin-password and gate-cookie code, `requireStaff`/`requireSuperadmin`/`verifyStaffBoundaryIdentity`, `provisionStaffIdentity`, the review form handlers and the break-glass variables. The `superadmin` role overrides, `isStaffOrAdmin` and every `audit_logs` write were removed too. Still in the repo until the rebuild: the `staff_reviewer` role check, `AdminService`, `ParticipationService.review`, `provider-review.ts` (self-review rules), the `audit_logs` and `admin_credentials` tables (migration 0005) and the admin Cloudflare resources.


Adopted 2026-10-13. `openapi/root.yaml` is the authoritative HTTP contract. The organizational source of truth remains [GAMO_NONPROFIT_MODEL.md](GAMO_NONPROFIT_MODEL.md). Gamo Studios is a developing Christian nonprofit; contracts do not authorize fees, fundraising, production payments, or deployment.

## Ownership and scope

The maintainer of each owning application owns its operations; shared schemas require review of all consumers. Founder/board/counsel retain policy decisions. Contract adoption and reconciliation precede the independent security/reliability audit. Twelve existing method/path operations in ten route files are specified; no speculative endpoints were added. Domain services are not automatically HTTP endpoints. Academy, Production, Organizations/Memberships, Partnerships and Media currently have no HTTP operations. Planned capabilities remain in [API_INVENTORY.md](API_INVENTORY.md), not executable contracts.

Keep six Astro applications. Each Path Item declares its owning local server; `x-application` and `x-source` identify routing and implementation. There is no seventh API app. Consumers must use the owning origin, not treat root `servers` as a gateway. Administration paths are `/api/events/pending` and `/api/events/{id}/review` on **admin**, without the fictitious `/api/admin` prefix in the previous inventory.

## Files and generation

- `openapi/root.yaml`: OpenAPI **3.1.1**, JSON Schema 2020-12 dialect, canonical component registry.
- `openapi/paths/`: referenced path items, camelCase unique operation IDs, per-app server, request/response contracts and metadata.
- `openapi/components/schemas/{shared,identity,live,administration,payments}/`: one schema per file with relative references. Other domains are reserved until a real operation is approved.
- `openapi/components/{parameters,responses,security}/`: shared IDs, error responses and accurate security schemes.
- `openapi/bundled/internal.json`: complete generated engineering contract; restricted, never a public asset.
- `openapi/bundled/public.json`: generated filtered reference; removes internal, identity demo and Worship stub operations and unused components.
- `packages/api-contracts/src/{public,internal}.d.ts`: generated TypeScript. Browser exports use only public types; internal staff consumers deliberately opt into `@gamo/api-contracts/internal`.
- `packages/api-contracts/src/validators.js`: generated standalone Ajv validators. Never edit generated files manually.
- `docs/api-reference/{public,internal}.html`: browsable Redocly output; local files, **not published**. Internal is never copied into app `public/` or uploaded to public Pages, artifacts or hosting. Public reference is also a local preview, not an availability claim.

`openapi-typescript` 7.13.0 needs the TypeScript compiler API unavailable in the previously installed TypeScript 7 package. TypeScript 5.9.3 is used and the lockfile pins resolution. Redocly CLI 2.62.1, Ajv 8.20.0 and openapi-fetch 0.17.0 are locked. No paid provider or new deployed integration was added.

## Transport conventions and compatibility

Existing `/api` URLs remain unchanged. Contract `info.version` tracks releases; there is no forced `/v1` migration. Keep additive optional response fields compatible **only after** relaxing closed schemas and checking consumers. Required inputs, tighter limits, removed fields/statuses, renamed operations, changed auth, ordering or response envelopes require explicit compatibility review and a release note in [API_COMPATIBILITY.md](API_COMPATIBILITY.md). Major transport changes should use an approved new versioned route alongside existing routes with a deprecation window; determine that window before implementation.

Current success envelopes are `{success:true,data,meta?}`. Checkout and webhook retain their legacy flat shapes; Worship has 303 redirects without JSON. Errors retain `{success:false,error:{code,message,details?}}` or the existing payments `{error}`. Admin middleware returns HTML 401. These differences are explicit contracts, not an undocumented universal envelope.

For new versioned JSON operations use RFC 9457 `application/problem+json` with shared `Problem` schema: `type`, `title`, numeric `status`, optional safe `detail`, `instance`, field `errors`. Use 400 validation, 401 authentication, 403 authorization, 404 unavailable resource, 409 state conflict, 429 throttling (document `Retry-After`), 500 unexpected error and 503 unavailable dependency. Do not advertise 429 enforcement on current routes: rate limiting is missing. Existing internal errors suppress exception messages; logs still need the subsequent audit. Validation never echoes request values, secrets, stack traces or provider bodies.

IDs are opaque nonempty case-sensitive strings. Existing resource prefixes and session IDs are preserved; clients must not infer authority from them. Money remains integer minor units plus currency in domain records. JSON timestamps are RFC 3339 strings; SQL timestamps remain epoch seconds through Drizzle. Schedule input uses explicit offsets/UTC and a named IANA `timezone` (existing default America/Phoenix retained and validated). Do not serialize JS Dates or numeric epochs as JSON inputs. Date ordering/recurrence correctness is still domain work.

## Pagination and filtering

The discovery endpoint currently returns at most **50** approved events, ordered `startsAt ASC, id ASC`; `meta.total` is returned row count, **not** database total. Only exact `city` and category filters are implemented. Unknown filters, including unsupported `limit` or `cursor`, return 400. No date filter is claimed. Admin pending returns all matches `createdAt DESC` and is unbounded; pagination is a tracked technical blocker.

Future large/changing collections should add a contract-approved opaque keyset cursor, default limit 25, maximum 100, deterministic secondary ID ordering and nullable `nextCursor`. Scope cursors to filters and tenant, validate them server-side, and never treat them as authorization. These are design conventions, not implemented fields. Migration of the admin queue and full discovery paging needs explicit consumer review.

## Security and permissions

`BrowserSession` models only the `__session` signed cookie verified against D1. Session creation accepts email-only input **only** with explicit runtime `ENVIRONMENT=local` and `ALLOW_DEMO_SESSION=true`; elsewhere it returns 403. A real verified-identity flow is unimplemented and requires a separate contract, not a claim that an email is a credential. Session deletion is repeatable with no cookie. Shared signing fallback and revocation/CSRF hardening require the independent audit before access is enabled.

Event proposal requires active organization owner/admin membership or superadmin, checked with `requireOrgAccess`; `x-demo-organizer` is no longer accepted. Public discovery and registration are separate from account routes. OpenAPI security declarations never enforce roles. Describe the actual boundary in `x-authorization`; future sensitive operations require explicit role/scope tests.

`CloudflareAccess` describes cryptographic JWT middleware checks (issuer, audience, JWKS/signature, expiry). Emergency bearer, x-admin-key and Basic are conditional alternatives only when configured break-glass is enabled, not public API tokens. Admin currently lacks domain role enforcement and Access-subject-to-D1 reviewer mapping. The test fixture deliberately provisions the legacy demo reviewer; this is **not** verification of real Access identity mapping. The middleware's local-development permissive fallthrough is an additional finding. No general API key, OAuth or service-account API authentication exists.

`StripeSignature` describes raw-body HMAC and timestamp validation, not a bearer token. Signed live events are rejected; Checkout continues to reject live keys. No donation, sponsorship or membership endpoints exist. No payment/policy gates were lifted. Public docs exclude internal operations regardless of the security declaration.

## Idempotency

Current client `Idempotency-Key` support: **none**. Do not claim the header is accepted just because a browser sends it. DELETE session is naturally repeatable. Registration uses normalized email plus event ID for sequential duplicates; concurrent writes, changed payload retries and return of existing passes need resolution. Stripe uses provider event ID in D1, but records it processed before side effects and lacks atomic claims/retry recovery. Checkout, proposals and reviews are not retry safe.

Before adding checkout/refunds/ticket issuance/approval writes, specify and implement durable idempotency: scope key to authenticated principal + organization + operation + target; hash canonical input, return the original status/body on same payload, return 409 on mismatched payload, persist state and coordinate side effects atomically. Keys must not contain PII. Retention (initial proposal 24 hours for client keys; financial/provider replay retention separately) needs operational approval before endpoints promise it. Anonymous registration requires a separate privacy-safe key/access design. No refunds or issuance HTTP endpoints are invented here.

## Runtime validation and typed consumers

Server route bodies validate using `readContract`/`validateContract` from `@gamo/api-contracts/runtime`. Transport JSON is checked before existing Zod domain transformations/defaults; Zod remains for IANA timezone and service-level inputs. Domain-only validation is not a second authoritative HTTP schema. All transport changes start in OpenAPI, regenerate validators, then reconcile domain rules. Discovery query checks reuse generated EventFilters validation; duplicate query keys are rejected. Path IDs are opaque nonempty Astro route parameters.

Ajv compiles only at generation/test time. Standalone ESM imports pure JS format/Unicode helpers; Workers do not load Node SQLite or runtime schema compilation/new Function. This is preferable to deploying a Node-only fuzz runner or dynamic compilation under Worker restrictions. Node SQLite lives exclusively at `@gamo/db/testing`; a missing `DB` binding now fails explicitly rather than creating an unmigrated in-memory database.

`createApiClient(origin)` exports an openapi-fetch client with public generated types and browser credentials. Future browser and internal integrations reuse generated `paths`, `operations` and `components`, not hand-maintained wire interfaces. Existing UI demos currently make no REST fetch calls and remain demos; this phase does not wire them into persistent functionality. Internal staff clients must use the separate generated internal contract. Compile-time types never replace runtime validation.

Response validation runs against OpenAPI in contract tests, with negative controls for missing/extra fields. It is not added to every production response: development instrumentation can wrap JSON responses before shipping a new slice. HTTP harness tests invoke **actual source route handlers and admin middleware**, using Request/Response over loopback listeners, all SQL migrations, foreign keys, an isolated in-memory D1-shaped SQLite adapter, explicit provider mocks and blocked outbound fetch. Nine grouped tests exercise all twelve operations, including zero unapproved fee allocations on signed sandbox completion. This runner is a focused OpenAPI-compatible alternative to Schemathesis for this foundation, without Python/Worker runtime dependencies or uncontrolled financial fuzzing. It does not test Astro's router/edge behavior, Cloudflare D1 concurrency, real Access JWKS, R2 network transfers or real Stripe/Resend delivery. Keep those integration gaps explicit.

## Commands and CI

| Command | Result |
| --- | --- |
| `make api-lint` | Redocly syntax, references and recommended rules |
| `make api-bundle` | Generate public/internal bundles, types and validators together |
| `make api-types` | Same deterministic artifact pipeline, avoiding divergent outputs |
| `make api-docs` | Render separate local public/internal HTML references |
| `make api-check` | Lint; compare regenerated artifacts in temporary directory; verify source/contract coverage, public filtering and credential-pattern scan; run HTTP tests |
| `make api-test` | Isolated loopback HTTP contract tests |
| `pnpm api:compatibility <base-sha>` | Conservative operation/schema change guard against Git base |

`api-check` does not rewrite tracked artifacts. It creates only temporary generated files and isolated test data. HTML is generated on demand/CI and ignored by Git to avoid large render churn; source and bundles are reproducible. Two lint warnings are intentional: Worship demos only return redirects, no invented 2xx response. Redocly recommended rules remain active; redirect-only exceptions do not justify adding fake success responses.

GitHub Actions runs on pushes to main and pull requests with read-only contents permission, frozen lockfile, lint/reference validation, reproducibility checks, source inventory, safe artifact scans, contract/backend tests, TypeScript and six-app builds. The compatibility guard is conservative: existing operation, schema, shared security/response/parameter or path-server changes need version bump and an exact base-specific release note. It catches more than proven incompatible changes and still requires human semantic review (business rules and referenced auth definitions need review). No deployment, secrets, provider calls, docs publishing or artifact uploads are configured.

## Required workflow for agents

1. Check mission/approval scope and current Git state; locate owning route and consumers.
2. Author or change the OpenAPI operation first. Include stable operation ID, statuses/content types, security, `x-authorization`, idempotency, filters/order and source mapping. Future proposals stay outside executable paths until their API design is approved.
3. Lint, regenerate types/validators, and assess compatibility. Never edit generated files.
4. Implement thin routes and server validation; enforce tenant/role permissions independently of docs. Reuse services and shared schemas.
5. Extend positive/negative HTTP tests and runtime fixtures. Do not call production or configure secrets. Verify actual behavior before labeling functional.
6. Run api-check, backend tests, TypeScript and builds; render local docs and check public filtering/secrets.
7. Update inventory, findings, compatibility notes and BUILD_LOG with exact evidence. Commit; push/deploy only with explicit authorization.

## Primary references

[OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html), [openapi-typescript](https://openapi-ts.dev/introduction), [openapi-fetch](https://openapi-ts.dev/openapi-fetch/), [Ajv standalone generation](https://ajv.js.org/standalone.html), [Redocly CLI](https://redocly.com/docs/cli), [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html). Installed CLI help was checked before using lint/bundle/build-docs commands.
