# Cleanup Two — Forms, Emails, Invoices; Admin Is the Only Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, owner chose earlier) with superpowers:dispatching-parallel-agents for independent tasks (≤10 agents, disjoint file ownership, no broad suites in agents). Every task follows superpowers:test-driven-development: failing test first, watch it fail, minimal code, pass, commit. Steps use `- [ ]`.

**Goal:** Replace public accounts and demo dashboards with staff-editable public forms (all Google-Forms question types, plus photo/video/PDF uploads and links), email communication, a Worship musician roster with church-request matching and one-click offers, and invoices — all run from the admin app.

**Architecture:** A generic forms engine (D1 tables + JSON schema + shared Astro renderer + admin builder) powers every public form. Program flows (roster, service requests, offers, invoices) hang off form submissions via question "bind" keys. Large files upload in chunks through our own Worker into the existing R2 bucket (R2 multipart via the binding — no S3 credentials, CSP stays `connect-src 'self'`). Emails go through the existing outbox; a daily cron retries email and enforces retention.

**Tech stack:** Astro 7 + @astrojs/cloudflare 14.3 on Workers, D1 (raw SQL via `SqlDatabase` + Drizzle schema), R2 (`MEDIA_BUCKET`), Images binding (`IMAGES`), Turnstile, Resend outbox, Stripe Invoicing (test mode), zod, `tsx --test`, Playwright.

**Spec:** this file's "Design" section; copied on approval to `docs/superpowers/specs/2026-11-16-forms-emails-invoices-design.md`, plan to `docs/superpowers/plans/2026-11-16-forms-emails-invoices.md`.

---

## Context

After dropping Gamo Live (cleanup one, shipped 2026-11-16), the owner wants Academy, Worship and Production to be simple: public pages, forms, emails and invoices — no accounts, onboarding, workspaces or per-program dashboards. Admin is the single dashboard. Today only two forms persist anything (Academy registration; web contact, which oddly requires sign-in); Worship/Production push people into account sign-up; every non-admin dashboard is demo data; nothing emails staff; no invoice code exists.

## Owner decisions (this conversation)

1. Worship flow as proposed: musicians apply → staff approve into a private roster → churches submit requests → staff pick a musician → offer email with Accept/Decline → church confirmation → invoice after service. Money flows **through Gamo** (Gamo invoices church, pays musician). Academy and Production follow the same pattern.
2. Musician application needs **photo, video, and PDFs (PDFs required for those applying to teach)**, accepts **links**, and must support **every Google-Forms question type**. Video storage must be cheap.
3. **Staff edit forms in admin** (form builder), not developers.
4. Payments: **Stripe Invoicing in test mode + manual "mark paid"** (check/Zelle/ACH). Live Stripe stays blocked by `assertStripeTestMode` until the owner approves real charges.
5. **Daily cron approved** (email retry + retention).
6. **Remove public accounts first**, then build forms. Nothing is deployed between phases; deploy once at the end.

## Design

### Forms engine
- **Question types** (Google-Forms parity + two extras): `short_text` (validation: number/text-contains/email/url/length/regex, custom message), `paragraph` (length/regex), `multiple_choice` (+"Other", shuffle), `checkboxes` (+"Other", at least/at most/exactly N), `dropdown`, `file_upload` (accept groups image/video/pdf/document/audio, max files, max MB), `linear_scale` (0|1 → 2..10, end labels), `rating` (3..10), `choice_grid` / `checkbox_grid` (rows×cols, require each row, one per column), `date` (year/time toggles), `time` (clock|duration), plus `link` (URL with provider allow-list) and `statement` (text block). Every question: `id`, `label`, `help`, `required`, optional `showIf {questionId, equals | includes}`, optional `bind` key.
- **Sections** group questions (rendered as fieldsets on one page; "Step n of N" headings). Branching uses `showIf` (accessible, checkable server-side) instead of go-to-section jumps.
- **Versioning:** staff edit a draft; Publish snapshots an immutable `form_versions` row. Submissions reference the version they answered.
- **Bind keys** connect answers to flows: `contact.name`, `contact.email`, `contact.phone`, `roster.roles`, `roster.city`, `roster.can_teach`, `request.church_name`, `request.date`, `request.start_time`, `request.address`, `request.roles_needed`. Publishing a form whose `kind` needs a bind key that is missing is refused.
- **Form kinds:** `musician_application`, `technician_application`, `church_request`, `production_request`, `contact`, `partner_interest`. Seeded forms (staff-editable): Worship `/apply`, Worship `/request`, Production `/request`, Production `/apply`, web `/contact`, web `/partners/interest`. Academy registration keeps its existing dedicated flow (already account-free, real, tested); admin gets a registrations screen and invoices for it.
- **Rendering:** shared `DynamicForm.astro` works without JavaScript (all sections visible; server ignores hidden-by-`showIf` answers). Progressive JS hides/shows sections and runs the chunked uploader. Accessibility: label per input, fieldset/legend for groups and each grid row, error summary with focus, `aria-describedby`/`aria-invalid`, required marked in text, allowed types/sizes stated before picking, ≥44×44 targets, one `<h1>`.

### Uploads (cheap video)
- Applicant chooses **link or upload** for video. Links: https only, exact host allow-list (`youtube.com`, `www.youtube.com`, `youtu.be`, `vimeo.com`, `player.vimeo.com`, `drive.google.com`, `www.dropbox.com`); IDs extracted; YouTube/Vimeo oEmbed check built from the extracted ID (never fetch the raw URL; `redirect:'manual'`, 3 s timeout). Admin embeds YouTube via `youtube-nocookie.com/embed/{id}`.
- Uploads go **through our Worker in 8 MiB parts into R2 multipart** (`MEDIA_BUCKET.createMultipartUpload` / `resumeMultipartUpload().uploadPart` / `complete`). Small files (≤ 8 MiB) single PUT. Caps: video 500 MB (mp4/quicktime/webm), photo 10 MB (jpeg/png/webp/heic), PDF 10 MB each, ≤ 5 PDFs. No-JS fallback: video by link; photo/PDF via normal multipart form post (≤ 25 MB total).
- **Upload session:** client gets a session token (Turnstile-verified, signed, 2 h, per-IP limited, ≤ 10 files) before the first upload; parts and completion require it. Keys: `forms/pending/{sessionId}/{uuid}`; on submit copied to `forms/submissions/{submissionId}/{uuid}`; on decline moved to `forms/declined/…`.
- **Verification after complete:** `head()` size check + first-64-bytes magic check (`ftyp`@4 for mp4/mov/heic, `1A45DFA3` webm, `FFD8FF` jpeg, `89504E47` png, `%PDF-`); fail → delete object, status `rejected`. Photos re-encoded through `IMAGES` to 1200 px WebP without metadata; original deleted.
- **Serving (admin only):** `/files/{uploadId}` streams from R2 with `Content-Disposition: attachment` for PDFs/other, inline for image/video, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`, Range support for video, staff auth.
- **Cost:** R2 ~$0.015/GB-month, zero egress, ops within free tier; estimate $0–2/month. **R2 lifecycle rules (owner action):** `forms/pending/` expire 2 days; `forms/declined/` expire 90 days; abort incomplete multipart 7 days.

### Worship / Production flow
- Approving a `musician_application`/`technician_application` creates a `roster_members` row (roles, city, can_teach, contact) — staff-only, no public directory. W-9 tracked as a received date only (no tax IDs stored).
- Submitting a `church_request`/`production_request` creates a `service_requests` row.
- Staff match in admin: filter roster by role/city, set pay, **Send offer** → email with a link to `worship /offers/{token}`. **GET shows details + Accept/Decline buttons; only POST acts** (email scanners prefetch GETs). Token: 32 random bytes, only SHA-256 hash stored, expires at the earlier of 72 h or service start, single conditional update `WHERE status='pending'`, repeat clicks show current state, withdrawn offers revoke, `Referrer-Policy: no-referrer`, POST rate-limited.
- Accept → church confirmation email (musician first name, role, arrival time) + staff email; decline → staff email, request returns to matching.

### Invoices
- Created in admin from a service request (lines prefilled from accepted offers) or an academy registration. Line kinds: `musician_pay`, `lesson`, `production`, `other`, and `gamo_admin` — **`gamo_admin` refused unless `GAMO_ADMIN_FEE_APPROVED=true`** (fees are proposals until approved). Musician pay and Gamo lines always separate. Integer cents, USD.
- **Send:** if Stripe test credentials exist → Stripe customer + invoice (`collection_method=send_invoice`, `days_until_due`, card + ACH) → finalize → our email carries `hosted_invoice_url`; `invoice.paid` webhook on **apps/web** `/api/webhook/stripe` marks paid. Otherwise manual: our email lists payment instructions (`INVOICE_PAYMENT_INSTRUCTIONS`). Staff can always **Mark paid** (method: stripe/check/zelle/ach/cash/other + reference) and **Record musician payout** per `musician_pay` line.
- Invoice numbers `GS-YYYY-NNNN`, sequential per year.

### Emails (all via `sendOutboxEmail`, idempotency key per event)
Submission received (to submitter: reference + what next, no answers echoed) · staff notification (to `INQUIRY_INBOX_EMAIL`, subject `New {form title} #{ref}` — no names, Reply-To submitter, link to admin) · application approved/declined · offer sent · offer accepted (church + staff) · offer declined (staff) · invoice sent · invoice paid receipt. A render registry by `kind` lets the cron retry without stored bodies.

### Daily cron (approved)
Custom worker entry for apps/web (`@astrojs/cloudflare/handler` + `scheduled`), `[triggers] crons = ["0 6 * * *"]`: retry due outbox emails; delete pending upload sessions/objects > 48 h; delete declined submissions' files > 90 days and records > 12 months; expire stale offers; purge expired link tokens.

### Privacy & retention
Privacy notice linked on every form (what, why, who, how long). References: name, relationship, contact only, with a "permission to share" checkbox. No DOB/SSN/TIN in forms. Academy stays parent-completed (COPPA). Minor teaching applicants: guardian contact + consent question (seeded). Retention: declined 12 months (files 90 days), inactive roster 3 years, financial 7 years.

### Account removal (Phase 1)
Remove from web/academy/worship/production: `/account/*`, `api/auth/*`, `api/account/*`, `api/organizations`, sso/Clerk pages and webhooks, demo workspaces (`family|instructor|host`, `musician|church`, `client|crew`, worship `opportunities`, `check-in`), web `account/inquiries`. Remove shared auth UI (`packages/ui/src/components/{auth,account,onboarding}`, `auth-flow-client.ts`, `clerk-browser.ts`, `session-viewer.ts`), `packages/auth/clerk.ts`, `packages/config/clerk-env.ts`, Clerk env vars and scripts, public sign-in handlers (`domain/http/auth.ts` public parts, `account.ts`, `account-pages.ts`, `identity*.ts`, `persons.ts`, `providers.ts`, `provider-review.ts`, `participation.ts`), admin provider/church review and participation pages. **Keep:** admin staff auth (Cloudflare Access + admin password, `users`, `sessions`, `roles`, `user_roles`, `admin_credentials`, `requireStaff`, `staffContext`), `customer_profiles`/`customer_access_tokens`/link tokens (Academy manage links), terms, email outbox, rate limits, Turnstile guard. Contact/partner pages show `hello@gamostudio.org` until Phase 2 forms land (not deployed in between). Legacy redirects for removed URLs. Forward migration drops public-account-only tables (exact list verified by grep at execution, like 0018; owner approved destructive drop with this plan; production holds test data only). AGENTS.md: retire the Shared Authentication, Product Account Independence and Independent Clerk rules (owner decision 2026-11-16); OpenAPI 4.0.0 breaking release.

## Global Constraints
- AGENTS.md mission/copy rules: Christian mission-driven PBC wording only; never nonprofit/charity/donation/tax-deductible wording; sample content labeled; Inter + tokens from `packages/ui/src/styles/tokens.css`; one `<h1>`; ≥44×44 targets; axe WCAG 2.2 AA clean; no overflow at 360 px.
- OpenAPI first: every new/removed route changes `openapi/root.yaml` first → `pnpm api:lint` → `node scripts/api/generate.mjs` → code → contract test; record breaking changes in `docs/API_COMPATIBILITY.md`.
- API route order: staff auth (admin) → `requireSameOrigin` on state-changing requests → validation → `api/response.ts` errors. Public forms: `guardPublicForm*` (Turnstile, rate limits, bounded body).
- Fail closed: missing secrets → 503 outside `ENVIRONMENT=local`; `allowMock` only local. Stripe test mode only (`assertStripeTestMode`).
- CSP: no inline scripts/handlers; bundled scripts with nonce; `connect-src 'self'` unchanged.
- D1: new numbered migrations only (next 0019+), Drizzle schema + `docs/DATABASE.md` updated; integer cents; epoch seconds.
- Logs never contain personal data, tokens or secrets. Email subjects never contain names.
- Hosts via `packages/config/apps.ts` / `siteUrl`; renamed URLs get `legacy-redirects.ts` entries (+ `scripts/audit/legacy-redirects.test.ts`).
- Test economy: per-file `pnpm exec tsx --test <file>` while iterating; `pnpm check:quick` per task; full `pnpm check` once at the end. Parallel agents never run broad suites.
- No new external providers (R2, Images, Turnstile, Resend, Stripe already approved/in use). New env vars go in `packages/config/env.ts`, `env-validation.ts`, `.dev.vars.example`, `docs/RUNBOOK.md` §3.

## Review Focus
1. Applicant loses connection mid-video upload → retrying the same part number succeeds; abandoned sessions are cleaned by cron; the form can still be submitted with a link instead. (Task 2.4 tests part retry idempotency + cron cleanup test in 4.3.)
2. Staff edit and republish a form while submissions exist → old submissions still render with the version they answered; removed questions don't vanish from old answers. (Task 2.2 test.)
3. Email security scanner opens the offer link → nothing changes; a second human click after accepting shows "already accepted" (Task 3.2 tests GET no-op + idempotent POST).
4. Two staff send offers for the same request/role, or a musician accepts after staff withdrew → only one acceptance per role wins; withdrawn offer shows "no longer available" (Task 3.2 conditional-update test).
5. Spoofed upload (HTML renamed .mp4, oversized body beyond declared size) → rejected and deleted, never served inline (Task 2.4 magic-byte + size tests; Task 2.6 serving headers test).

---

## Phase 1 — Remove public accounts and demo dashboards

### Task 1.1: Inventory and contract (OpenAPI 4.0.0)
**Files:** `openapi/root.yaml`, `openapi/paths/*` (auth, account, organizations, participation, review-providers), `packages/api-contracts/**` (regenerated), `docs/API_COMPATIBILITY.md`, `scripts/api/contract.test.ts`.
- [ ] Remove auth/account/organizations/participation/provider-review paths and schemas; bump to 4.0.0 with a release note (Base: current main).
- [ ] Update contract test so remaining operations (Resend webhook, admin staff provision) pass; run `pnpm exec tsx --test scripts/api/contract.test.ts` → PASS; `pnpm api:lint` valid; generate `--check` current.
- [ ] Commit.

### Task 1.2: Delete public account routes, demo workspaces and shared auth UI (parallel by app)
**Files:** `apps/{web,academy,worship,production}/src/pages/{account,api/auth,api/account,api/organizations}/**`, demo workspace pages + `src/data/workspaces/*`, web `account/inquiries`, worship `opportunities.astro`, `check-in/[id].astro`; `packages/ui/src/components/{auth,account,onboarding}/**`, `packages/ui/src/lib/{auth-flow-client,clerk-browser,session-viewer}.ts`, `sites.ts` (`providerSignupUrl`), header/footer sign-in links; each app `legacy-redirects.ts`; `packages/auth/page-access.ts`; app `robots.txt`.
- [ ] Write failing tests: `scripts/audit/legacy-redirects.test.ts` cases `/account/signin`→`/` (302), worship `/musician/x`→`/apply`, `/church/x`→`/request`, production `/crew/x`→`/apply`, `/client/x`→`/request`, academy `/family/x`→`/`; `private-routes.test.ts`/`crawler-files.test.ts` updated so no public private roots remain.
- [ ] Run → FAIL. Delete files, add redirects, replace CTAs ("Apply to serve" → `/apply`, "Request a musician" → `/request`; contact/partner pages show `hello@gamostudio.org` until Phase 2).
- [ ] Run tests → PASS; `astro check` each app 0 errors; commit per app.

### Task 1.3: Strip account code from shared packages
**Files:** `packages/auth/{clerk.ts,index.ts,locals.ts}`, `packages/config/{clerk-env.ts,env.ts,env-validation.ts}`, `packages/domain/src/http/{auth.ts,account.ts,account-pages.ts,review.ts}`, `packages/domain/src/services/{identity.ts,identity-clerk-webhook.ts,persons.ts,providers.ts,provider-review.ts,participation.ts}`, `scripts/clerk/**`, `scripts/set-clerk-secrets.sh`, app middleware.
**Interfaces — kept and unchanged:** `requireStaff`, `isStaffOrAdmin`, `hasSystemRole`, `createSession`, admin password functions, `staffContext` (moved to `packages/domain/src/http/staff.ts`), `requireSameOrigin`, `customers.ts`, `link-tokens.ts`, `email-outbox.ts`, `public-form-guard.ts`.
- [ ] Adjust tests first (auth.test, env tests, audit identity/auth tests deleted or reduced to staff paths); run → FAIL where code still exports removed symbols.
- [ ] Delete code; middleware for public apps = env check → legacy redirects → page → security headers (no public session).
- [ ] `pnpm exec tsc --noEmit -p packages/{auth,config,domain}` clean; `pnpm check:quick` PASS; commit.

### Task 1.4: Admin without provider/participation review; drop account tables
**Files:** `apps/admin/src/pages/{review/**,participation.astro,api/review/**,api/participation/**}`, `apps/admin/src/lib/review-pages.ts`, `apps/admin/src/data/workspace.ts` nav; `packages/db/migrations/0019_remove_public_accounts.sql`, `packages/db/schema.ts`, `packages/db/migrations.test.ts`, `docs/DATABASE.md`.
- [ ] Failing test in `migrations.test.ts`: after 0019 the dropped tables are absent; `users, sessions, roles, user_roles, admin_credentials, customer_profiles, customer_access_tokens, academy_registrations, terms_documents, terms_acceptances, email_log, email_suppressions, rate_limit_counters, audit_logs` remain; no trigger/FK references a dropped table; admin password sign-in still works (existing audit test).
- [ ] Write 0019 (candidates: `product_accounts, clerk_identity_links, external_identities, auth_challenges*, persons*, provider_profiles, verification_records, organizations*, organization_members*, participation_inquiries, musician_profiles, gigs, gig_positions, gig_assignments, checkins, standby_dispatches, instructor_profiles, classes, enrollments` — `*` keep if a kept table or admin auth references it; verify with grep + `PRAGMA foreign_key_list`).
- [ ] PASS; commit.

### Task 1.5: Docs and rules
**Files:** `AGENTS.md` (retire Shared Authentication / Product Account Independence / Independent Clerk sections; describe forms + admin model), `docs/AUTH.md`, `docs/IDENTITY.md`, `docs/CLERK_ARCHITECTURE_AND_MIGRATION.md` (mark retired), `docs/RUNBOOK.md` (remove Clerk), `docs/DECISIONS.md`, `docs/BUILD_LOG.md`.
- [ ] `pnpm check:quick` PASS (email-domain, legal-drafts audits); commit.

## Phase 2 — Forms engine

### Task 2.1: Schema types and answer validation
**Files:** Create `packages/domain/src/forms/schema.ts`, `packages/domain/src/forms/validate.ts`, `packages/domain/src/forms/links.ts`; tests alongside (`*.test.ts`).
**Produces:**
- `type QuestionType = 'short_text'|'paragraph'|'multiple_choice'|'checkboxes'|'dropdown'|'file_upload'|'linear_scale'|'rating'|'choice_grid'|'checkbox_grid'|'date'|'time'|'link'|'statement'`
- `type BindKey` (the list in Design), `type FormKind` (six kinds), `REQUIRED_BINDS: Record<FormKind, BindKey[]>`
- `parseFormSchema(input: unknown): FormSchema` (zod; throws `FormSchemaError` with path)
- `checkPublishable(kind: FormKind, schema: FormSchema): string[]` (missing binds, duplicate ids, showIf to unknown/later question)
- `validateAnswers(schema: FormSchema, raw: Record<string, string | string[]>, uploads: Record<string, UploadRef[]>): { ok: true; answers: Answers; binds: Partial<Record<BindKey, unknown>> } | { ok: false; errors: { questionId: string; message: string }[] }`
- `normalizeLink(url: string): { provider: 'youtube'|'vimeo'|'drive'|'dropbox'; id: string; canonical: string } | null`
- [ ] Tests (one per type + cross-cutting): short_text email/url/number-between/length/regex with custom message; checkboxes "at least 2"; multiple_choice "Other" requires text; linear_scale 1..5 rejects 6; grid "require each row" and "one per column"; date with/without year; time duration; hidden-by-showIf answers dropped and not required; unknown question ids ignored; required file_upload without upload fails; `normalizeLink('http://youtube.com/...')`→null, `'https://youtu.be/dQw4w9WgXcQ'`→youtube id, `'https://evil.com/youtube.com'`→null.
- [ ] FAIL → implement → PASS (`pnpm exec tsx --test packages/domain/src/forms/*.test.ts`) → commit.

### Task 2.2: Forms tables, versions, submissions service
**Files:** `packages/db/migrations/0020_forms.sql`, `packages/db/schema.ts`, `docs/DATABASE.md`; `packages/domain/src/forms/service.ts` (+test), seeds `packages/domain/src/forms/seeds.ts`.
**Tables:** `forms(id, slug UNIQUE, program, kind, title, description, status draft|published|closed, draft_schema_json, current_version_id, confirmation_message, created_at, updated_at)`; `form_versions(id, form_id, version, schema_json, published_by_user_id, published_at, UNIQUE(form_id,version))`; `form_submissions(id, form_id, form_version_id, reference UNIQUE, status new|in_review|approved|declined|closed, submitter_name, submitter_email_normalized, submitter_phone, answers_json, binds_json, idempotency_key UNIQUE, ip_hash, submitted_at, reviewed_by_user_id, reviewed_at, staff_notes, delete_after)`; `form_uploads` and `upload_sessions` (Task 2.4 columns).
**Produces:** `FormsService(db)`: `getPublished(slug)`, `saveDraft(formId, schema, staffId)`, `publish(formId, staffId) → version`, `submit({slug, raw, uploads, idempotencyKey, ipHash, now}) → {submission, created: boolean}`, `listSubmissions(filter)`, `getSubmission(id)` (returns answers with the version's schema), `setStatus(id, status, staffId, notes?)`; `seedDefaultForms(db, now)` (idempotent; six forms from Design with privacy/consent questions).
- [ ] Tests: publish snapshots version; republish after edit keeps old submission rendering with v1 schema (Review Focus 2); duplicate idempotency key returns same submission; closed/draft form refuses submit; reference format `GW-2026-0001` (prefix per program: GW worship, GP production, GS web) sequential; `checkPublishable` failure blocks publish.
- [ ] FAIL → implement → PASS → commit.

### Task 2.3: Public renderer and submit pages
**Files:** `packages/ui/src/components/forms/dynamic/{DynamicForm,QuestionField,ChoiceGroup,SelectField,TextareaField,ScaleField,GridField,DateTimeField,LinkField,FileField,Statement}.astro`, `packages/ui/src/lib/dynamic-form-client.ts`; pages `apps/worship/src/pages/{apply,request}.astro`, `apps/production/src/pages/{apply,request}.astro`, `apps/web/src/pages/{contact,partners/interest}.astro`, shared handler `packages/domain/src/forms/http.ts` (`handleFormPage(ctx, slug)` following `apps/academy/src/pages/register/[lesson].astro`: `requireSameOrigin` → `guardPublicFormForPage` route `forms.{slug}` 20/IP/15 min, 5/email/h → `validateAnswers` → `submit` → 303 to `?sent={signedRef}`).
- [ ] Failing Playwright spec `tests/e2e/forms.spec.ts`: worship `/apply` renders every question type from a fixture form, axe clean, no overflow at 360 px; submitting with errors shows error summary focused and keeps values; valid submit shows confirmation with reference; works with JS disabled (video by link).
- [ ] Implement components (fieldset/legend, error summary reuse `FormErrorSummary`, `TermsConsent`, `TurnstileWidget`); progressive JS only toggles `showIf` sections.
- [ ] PASS (`E2E_APPS=worship pnpm exec playwright test tests/e2e/forms.spec.ts` after building worship) → commit.

### Task 2.4: Chunked uploads to R2
**Files:** `openapi/paths/forms-upload-*.yaml`; `packages/domain/src/forms/uploads.ts` (+test); routes in each form-hosting app via shared handlers: `POST /api/forms/{slug}/upload-session`, `POST /api/forms/uploads` (start), `PUT /api/forms/uploads/{id}/parts/{n}`, `POST /api/forms/uploads/{id}/complete`, `DELETE /api/forms/uploads/{id}`; client `packages/ui/src/lib/chunked-upload.ts`.
**Produces:** `UploadService(db, bucket, images?)`: `startSession({formSlug, turnstileOk, ipHash, now}) → {token, expiresAt}`; `start({token, questionId, filename, size, contentType}) → {uploadId, partSize: 8388608, parts}`; `putPart(uploadId, n, body)` (idempotent per n); `complete(uploadId) → {status:'verified'|'rejected', reason?}`; `attach(uploadIds, submissionId)`; `moveToDeclined(submissionId)`; `deletePendingOlderThan(seconds)`; `UploadRef = {uploadId, kind:'image'|'video'|'pdf'|'other', bytes}`.
- [ ] Tests (fake R2 bucket with multipart): caps (video 524288000, photo 10485760, pdf 10485760, ≤5 pdf, ≤10 files/session); wrong type at start → 400; retrying part 3 overwrites cleanly (Review Focus 1); complete with HTML bytes named `.mp4` → rejected + object deleted; size mismatch → rejected (Review Focus 5); expired session token → 401; image re-encode called via fake `IMAGES` and original deleted; attach moves keys to `forms/submissions/{id}/`.
- [ ] FAIL → implement → PASS → commit. Add `MEDIA_BUCKET`/`IMAGES` typing in `packages/config/env.ts`.

### Task 2.5: Emails for submissions
**Files:** `packages/domain/src/forms/emails.ts` (+test), render registry `packages/domain/src/email/registry.ts`; env `INQUIRY_INBOX_EMAIL` (config, validation warning, `.dev.vars.example`, RUNBOOK).
**Produces:** `sendSubmissionEmails(db, env, submission, form, now)` (two outbox messages: kinds `form_received`, `form_staff_notice`); `renderEmail(kind, relatedId, db, env)` used by cron.
- [ ] Tests: submitter email has reference and no answers; staff subject `New Musician application #GW-2026-0001` (no name), Reply-To = submitter, link to `siteUrl('admin','/submissions/{id}')`; missing `INQUIRY_INBOX_EMAIL` → staff email skipped with name-only log, submitter email still sent; idempotent on resubmit.
- [ ] FAIL → implement → PASS → commit.

### Task 2.6: Admin forms builder, submissions inbox, file viewer
**Files:** `apps/admin/src/pages/{forms/index,forms/[id],submissions/index,submissions/[id],files/[id]}.astro` + API routes `apps/admin/src/pages/api/forms/**`, `api/submissions/**`; components `apps/admin/src/components/forms/*`; nav in `apps/admin/src/data/workspace.ts`.
- [ ] Failing tests `scripts/audit/admin-forms.test.ts`: non-staff → 401/redirect; cross-origin POST → 403; builder actions (add question of each type, edit options/validation, move up/down, delete, add section, set showIf) persist draft; publish refused with missing binds and shows reasons; submissions list filters by form/status; detail renders answers from the submission's version; `/files/{id}` returns `Content-Disposition: attachment` for PDF, `nosniff`, `Content-Security-Policy: sandbox`, supports `Range` for video, 404 for rejected uploads (Review Focus 5).
- [ ] Implement server-rendered builder (each action a POST → 303; small bundled script only for preview toggling); DataTable/Panel/KeyValueList reuse; seed forms on first admin load if absent (`seedDefaultForms`).
- [ ] PASS → commit.

## Phase 3 — Roster, requests, offers, invoices

### Task 3.1: Roster and service requests
**Files:** `packages/db/migrations/0021_roster_requests_offers_invoices.sql` (all Phase 3 tables), schema, DATABASE.md; `packages/domain/src/worship/{roster,requests}.ts` (+tests); admin `roster/{index,[id]}.astro`, `requests/{index,[id]}.astro`.
**Tables:** `roster_members(id, submission_id UNIQUE, program, display_name, email_normalized, phone, roles_json, city, can_teach, status active|paused|removed, w9_received_at, approved_by_user_id, approved_at)`; `service_requests(id, submission_id UNIQUE, program, church_name, contact_name, contact_email_normalized, contact_phone, service_date, start_time, address, roles_needed_json, status new|matching|offered|confirmed|completed|cancelled, created_at)`.
**Produces:** `approveApplication(db, submissionId, staffId, now) → RosterMember` (reads binds; sends `application_approved`), `declineApplication(…)` (moves files to declined, `application_declined`, sets `delete_after`); `createRequestFromSubmission` (called by `FormsService.submit` for request kinds); `searchRoster({role, city, status})`.
- [ ] Tests: approve creates one roster row (second approve no-op); decline sets delete_after = now+365 d and moves files; request created on church_request submit with binds; roster search filters.
- [ ] FAIL → implement → PASS → commit.

### Task 3.2: Offers with one-click links
**Files:** `packages/domain/src/worship/offers.ts` (+test); `openapi/paths/offers-token.yaml`; `apps/worship/src/pages/offers/[token].astro` (GET page + POST action, also used for production technicians); admin "Send offer" / "Withdraw" actions on request detail.
**Table:** `offers(id, request_id, roster_member_id, role, pay_cents, token_hash UNIQUE, expires_at, status pending|accepted|declined|withdrawn|expired, sent_at, responded_at)`.
**Produces:** `sendOffer(db, env, {requestId, rosterMemberId, role, payCents, staffId, now}) → {offerId}` (token = 32 random bytes base64url, store SHA-256, expiry min(now+72h, service start)); `respondToOffer(db, env, {token, action:'accept'|'decline', now}) → {state:'accepted'|'declined'|'already_accepted'|'already_declined'|'unavailable'}`; `withdrawOffer`.
- [ ] Tests: GET renders details and never changes state (Review Focus 3); POST accept sets accepted once, repeat → already_accepted; accept after withdraw → unavailable; second musician accepting same request+role after first accepted → unavailable (Review Focus 4); expired → unavailable; emails: musician offer, church confirmation + staff on accept, staff on decline; page sends `Referrer-Policy: no-referrer`; POST rate-limited.
- [ ] FAIL → implement → PASS → commit.

### Task 3.3: Invoices (manual + Stripe test)
**Files:** `packages/domain/src/invoices/{invoices,stripe-invoicing}.ts` (+tests); `packages/integrations/src/stripe.ts` (add `createInvoiceForCustomer`); `apps/web/src/pages/api/webhook/stripe.ts` (+ openapi path); admin `invoices/{index,[id],new}.astro`; academy registrations list `apps/admin/src/pages/registrations/index.astro`.
**Tables:** `invoices(id, number UNIQUE, source_type service_request|academy_registration|manual, source_id, bill_to_name, bill_to_email_normalized, status draft|open|paid|void, currency 'usd', total_cents, due_date, stripe_invoice_id UNIQUE, hosted_url, paid_at, paid_method, paid_reference, created_by_user_id, created_at)`; `invoice_lines(id, invoice_id, kind, description, quantity, unit_amount_cents, amount_cents, payee_roster_member_id)`; `musician_payouts(id, invoice_line_id UNIQUE, roster_member_id, amount_cents, paid_at, method, reference, recorded_by_user_id)`.
**Produces:** `createInvoiceDraft(db, {source, lines, billTo, dueDate, staffId, now})`, `sendInvoice(db, env, invoiceId, now) → {mode:'stripe'|'manual', hostedUrl?}`, `markPaid`, `voidInvoice`, `recordPayout`, `handleStripeInvoicePaid(db, event)`.
- [ ] Tests: number `GS-2026-0001` sequential per year; total = sum of lines (integer cents); `gamo_admin` line rejected unless `GAMO_ADMIN_FEE_APPROVED=true`; lines prefilled from accepted offers; Stripe mode only with a real test key (`assertStripeTestMode`), live key throws; manual mode email contains `INVOICE_PAYMENT_INSTRUCTIONS`; webhook with bad signature → 400, `invoice.paid` marks paid once (idempotent); payout once per line.
- [ ] FAIL → implement → PASS → commit.

## Phase 4 — Admin as the only dashboard, cron, finish

### Task 4.1: Replace admin demo workspace
**Files:** delete `apps/admin/src/data/admin/*.ts` demo data and `[...slug].astro` demo screens (keep `security.astro`, `legal.astro`, staff provision); new home `apps/admin/src/pages/index.astro` (counts: new submissions, open requests, pending offers, unpaid invoices); nav = Home, Submissions, Forms, Roster, Requests, Invoices, Registrations, Security, Legal.
- [ ] Update `scripts/audit/admin-analytics-workspaces.test.ts` → admin nav test; FAIL → implement → PASS → commit.

### Task 4.2: Daily cron on apps/web
**Files:** `apps/web/src/worker.ts` (`export default { fetch: handle(...), scheduled }` via `@astrojs/cloudflare/handler` — verify API in installed 14.3.4 first), `apps/web/wrangler.toml` (`main`, `[triggers] crons = ["0 6 * * *"]` per env), `packages/domain/src/jobs/daily.ts` (+test).
**Produces:** `runDailyJobs(db, env, bucket, now) → { emailsRetried, uploadsPurged, submissionsPurged, offersExpired, tokensPurged }`.
- [ ] Tests with fakes: pending uploads > 48 h deleted (objects + rows); declined submissions past `delete_after` deleted with files; offers past expiry → expired; outbox retry uses `renderEmail`; a failure in one job doesn't stop the others.
- [ ] FAIL → implement → PASS → `astro build` web succeeds with custom entry → commit.

### Task 4.3: Docs, runbook, owner actions
**Files:** `docs/RUNBOOK.md` (env: `INQUIRY_INBOX_EMAIL`, `INVOICE_PAYMENT_INSTRUCTIONS`, `GAMO_ADMIN_FEE_APPROVED`, Stripe test keys + `STRIPE_WEBHOOK_SECRET` on web; R2 lifecycle rules; cron; Stripe webhook URL `https://gamostudio.org/api/webhook/stripe` events `invoice.paid`, `invoice.payment_failed`), `docs/SCREEN_INVENTORY.md`, `docs/DECISIONS.md`, `docs/BUILD_LOG.md`, `README.md`, `ARCHITECTURE.md`.
- [ ] `pnpm check:quick` PASS; commit.

### Task 4.4: Full verification and review
- [ ] `env -u CLAUDECODE -u AI_AGENT -u CLAUDE_CODE_ENTRYPOINT pnpm check` once → all green.
- [ ] Browser check (local): submit worship application with photo + 50 MB video + PDF; submit church request; in admin approve, match, send offer; open offer link, accept; create and send manual invoice; mark paid. Screenshots stored per AGENTS.md and listed in BUILD_LOG.
- [ ] Fresh whole-branch reviewer (opus) with this plan's Review Focus; one fix pass with RED→GREEN tests.

## Verification (end to end)
- Unit/integration: `pnpm test` (forms schema/validate/service/uploads/emails, roster/offers/invoices, daily jobs, migrations 0019–0021).
- Contract: `pnpm api:check` (OpenAPI 4.0.0 + new forms/uploads/offers/webhook paths).
- Browser: `tests/e2e/forms.spec.ts` + updated smoke; axe AA; 360 px.
- Manual flow above on local, then preview after deploy (owner runs deploy + migrations as in cleanup one).

## Owner actions (after merge)
R2 lifecycle rules on `gamo-media-{preview,production}`; set `INQUIRY_INBOX_EMAIL`, `INVOICE_PAYMENT_INSTRUCTIONS`, optional Stripe test keys + webhook secret on web; Stripe webhook endpoint; apply migrations 0019–0021 (backup first); accountant review of contractor/1099 handling (W-9 before first payout; 2026 1099-NEC threshold $2,000) and Stripe live approval when ready.

## Execution approach
Inline execution (executing-plans) with parallel agents where file sets are disjoint: Phase 1 tasks 1.2 per app in parallel, 1.1/1.3/1.4 sequential-ish; Phase 2 tasks 2.1 first, then 2.2–2.5 in parallel (disjoint files), 2.6 after; Phase 3 sequential (3.1 → 3.2 → 3.3); Phase 4 4.1/4.2 in parallel, then 4.3, 4.4. Lead runs integration checks between phases; commits on branch `cleanup/forms-emails-invoices`.
