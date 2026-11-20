# Form Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all public Gamo forms live on `gamostudio.org` as a one-question-per-screen onboarding wizard (card, photo, Back/Next, progress), including the forms that are missing today.

**Architecture:** `DynamicForm` keeps rendering every section server-side (works without JavaScript); a new `wizard` prop adds a markup contract (`data-wizard*`) that a bundled client module turns into screens. A new `handleFormPage` in `packages/domain` receives submissions (guard → `FormsService.submit` → emails → 303 to a signed receipt). `apps/web` gets six thin pages composed by one app-level `FormPage` section that adds the focus layout and photo. The Academy registration form emits the same markup contract by hand, logic untouched.

**Tech Stack:** Astro 5 SSR on Cloudflare Workers, Tailwind 4 tokens in `packages/ui/src/styles`, D1 via `SqlDatabase`, `node:test` via `pnpm exec tsx --test`, Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-11-20-form-wizard-design.md` (read it first; this plan does not repeat its rationale).

## Global Constraints

- Research-first rule is satisfied by the spec's "Research" section; record the chosen history/back-button approach in `docs/DECISIONS.md` after testing it in a real browser (Task 8).
- Clean style: no eyebrow labels or pills; Back/Next/Send are small-radius rectangles; headings short, first letter of every word capitalised (shared heading styles already do this); one main action per screen.
- Semantic tokens only in `apps/*`; no arbitrary values, hex colours or inline `style=`; photos only through `Frame` (decorative, ratios `portrait` and `landscape`), radius via `--frame-radius`.
- No inline `<script>` or `on*=` handlers; client code is a bundled module imported from a component script (pattern: `DynamicForm.astro` → `lib/dynamic-form-client.ts`).
- Works without JavaScript: every question visible, one normal submit; the server is the authority on validation.
- Interactive targets ≥ 44 × 44 px; exactly one `<h1>` per page; axe WCAG 2.2 AA clean; no horizontal overflow at 360 px.
- Hosts come from `packages/config/apps.ts` via `siteUrl(id, path)`; never hard-code an origin.
- Fail closed: outside `ENVIRONMENT=local` a missing Turnstile/secret/email config answers 503/unavailable, never fake success. Real emails are never sent locally (outbox mock).
- Logs name error codes, never answers, emails, tokens or names. Email subjects never contain names.
- Max 3 questions per screen, same section only; heavy question types (see Task 1) always stand alone.
- Test economy (AGENTS.md): while iterating run only the changed test file (`pnpm exec tsx --test <file>`); gate each commit with `pnpm check:quick` + typecheck; the lead runs full `pnpm check` once at the end; no new screenshot baselines.
- Commit messages: one short sentence saying what was done; no body, no attribution (AGENTS.md; this overrides any default trailer). Commit locally only; never push or deploy.
- Subdomain removal is out of scope (deferred by the owner).

## Review Focus

1. Under-18 flow: choosing "Under 18", going Back, changing the answer to an adult, and continuing must skip the guardian screen and keep earlier answers; the guardian consent screen can never be merged with another question (Task 1, Task 3 tests).
2. Enter key: in a text input on a non-final screen it advances (never submits early); in a paragraph (textarea) it inserts a newline (Task 8 spec).
3. Reload/bfcache: restoring the page via back/forward keeps typed answers and a sensible screen, and the Send button is re-enabled (Task 3 + Task 8).
4. A published form that is closed, unpublished or has a single screen: closed shows a notice (no 500); one screen shows no progress or Back (Task 4, Task 3 tests).
5. Failed submit (bad answer, failed Turnstile, double post with the same idempotency key): answers kept, opens on the first screen with an error (Turnstile failure: the last screen), exactly one stored submission (Task 4 tests).

## File Structure

Create
- `packages/ui/src/lib/dynamic-form-wizard.ts` — pure screen rule + navigation helpers.
- `packages/ui/src/lib/dynamic-form-wizard.test.ts` — unit tests.
- `packages/ui/src/lib/dynamic-form-wizard-client.ts` — DOM behaviour (`initWizards`).
- `packages/ui/src/components/forms/dynamic/WizardControls.astro` — progress + Back/Next markup, hidden until JS runs.
- `packages/domain/src/forms/http.ts` + `http.test.ts` — `handleFormPage`.
- `apps/web/src/components/forms/FormPage.astro` — focus layout + photo + wizard form for one slug.
- `apps/web/src/lib/form-photos.ts` — typed photo map.
- `apps/web/src/pages/forms/received.astro` — signed receipt page.
- `apps/web/src/pages/worship/{apply,request}.astro`, `apps/web/src/pages/production/{apply,request}.astro`.
- `tests/e2e/forms.spec.ts`.

Modify
- `packages/ui/src/components/forms/dynamic/{DynamicForm,SectionBlock}.astro`, `forms/SubmitButton.astro`, `forms/ChoiceCard.astro`, `forms/field.ts` (`CONTROL_CLASS`), `packages/ui/src/styles/tokens.semantic.css`.
- `packages/domain/src/forms/service-index.ts` or `index.ts` (export `handleFormPage` — follow how `@gamo/domain/forms` exports).
- `apps/web/src/pages/contact.astro`, `apps/web/src/pages/partners/interest.astro`, `apps/web/src/lib/legacy-redirects.ts`, `apps/web/src/site.config.ts` and the other apps' `site.config.ts`/pages that link to `/apply` or `/request`.
- `apps/worship/src/lib/legacy-redirects.ts`, `apps/production/src/lib/legacy-redirects.ts`.
- `apps/academy/src/components/registration/RegistrationForm.astro`.
- `DESIGN.md` (new §11), `docs/DECISIONS.md`, `docs/FRONTEND_ARCHITECTURE.md`, `docs/BUILD_LOG.md`.

Delete (after callers are gone): `packages/ui/src/components/forms/FormComingSoon.astro`, `apps/worship/src/components/forms/FormPlaceholder.astro`, the worship/production `apply.astro` and `request.astro` placeholders, and any `data/` exports they alone used.

---

### Task 1: Screen rule (pure)

**Files:**
- Create: `packages/ui/src/lib/dynamic-form-wizard.ts`
- Test: `packages/ui/src/lib/dynamic-form-wizard.test.ts`

**Interfaces:**
- Consumes: `DynFormSchema`, `DynSection`, `DynQuestion` from `./dynamic-form.ts`.
- Produces:
  - `interface WizardScreen { id: string; sectionId: string; questionIds: string[]; statementIds: string[]; }` — `id` is `` `${sectionId}-${n}` `` (n from 1 within the section); `questionIds` excludes statements.
  - `buildScreens(schema: DynFormSchema): WizardScreen[]` — static, ignores show-if.
  - `isLightQuestion(q: DynQuestion): boolean`.
  - `nextVisibleScreen(screens: WizardScreen[], from: number, direction: 1 | -1, isHidden: (screen: WizardScreen) => boolean): number | null`.

- [ ] **Step 1: Write failing tests** in `dynamic-form-wizard.test.ts` using `node:test`, building small `DynFormSchema` fixtures inline:
  - `contact trio shares one screen`: section with short_text name, short_text email(validation email), short_text phone → one screen with 3 ids.
  - `four light questions split 3 + 1`.
  - `heavy questions stand alone`: paragraph, file_upload, choice_grid, checkbox_grid, checkboxes, linear_scale, rating, link each produce a screen of exactly one question even between light ones.
  - `light means dropdown, date, time, short_text and multiple_choice with at most 4 options and no other`; a multiple_choice with 5 options is heavy; with `other: true` is heavy.
  - `never groups across sections`.
  - `statement attaches to the next question's screen and is not counted`; a trailing statement attaches to the previous screen of its section; a section with only statements yields one screen with empty `questionIds`.
  - `nextVisibleScreen skips hidden screens in both directions and returns null past either end`.
  - `single-screen form returns one screen`.
- [ ] **Step 2: Run** `pnpm exec tsx --test packages/ui/src/lib/dynamic-form-wizard.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the four exports. Greedy walk per section: start a screen with the next non-statement question; if it is light, keep adding following light questions until 3; heavy questions close the current screen and stand alone.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** — `Add the form wizard screen rule`.

---

### Task 2: Wizard markup, controls and rectangular form controls

**Files:**
- Modify: `DynamicForm.astro`, `SectionBlock.astro`, `SubmitButton.astro`, `ChoiceCard.astro`, `forms/field.ts`, `tokens.semantic.css` (all under `packages/ui/src/…`, paths in File Structure)
- Create: `packages/ui/src/components/forms/dynamic/WizardControls.astro`
- Test: extend `scripts/audit/dynamic-form.test.ts` and `scripts/audit/forms-kit.test.ts`

**Interfaces:**
- Consumes: `buildScreens`, `WizardScreen` (Task 1).
- Produces markup contract read by Task 3 (all attributes are the contract; do not rename):
  - `<form data-dynamic-form data-wizard>` when `wizard` is true.
  - Each screen: `<div data-wizard-screen="{screen.id}" data-wizard-section="{sectionId}">` wrapping that screen's questions (and statements) inside the section's `<section>`; a screen with several questions shows the section title as the heading (`headingLevel`), a single-question screen shows none extra (the question label is its heading via a `data-wizard-single` attribute for CSS).
  - Footer block (consent, Turnstile, submit) wrapped `data-wizard-final`.
  - `WizardControls` renders `<div data-wizard-controls hidden>` with `<ol data-wizard-progress aria-label="Progress">`, a `<p data-wizard-status>` ("Step n of N"), a polite `<div data-wizard-live aria-live="polite" class="sr-only">`, and buttons `<button type="button" data-wizard-back>Back</button>` and `<button type="button" data-wizard-next>Next</button>`.
  - New `DynamicForm` prop `wizard?: boolean` (default false) plus slot `wizard-aside` is NOT added (photo lives in `FormPage`).

- [ ] **Step 1: Write failing audit tests** (existing audit style, markup contracts): with `wizard` the form has `data-wizard`, every question sits inside exactly one `data-wizard-screen`, the final footer is `data-wizard-final`, controls are `hidden` in server HTML, no inline script, no `rounded-pill`/`rounded-full` in `SubmitButton`, `ChoiceCard`, `WizardControls`, and `CONTROL_CLASS` has no `rounded-xl`. Without `wizard` the markup is byte-for-byte what it was (no `data-wizard`).
- [ ] **Step 2: Run** `pnpm exec tsx --test scripts/audit/dynamic-form.test.ts scripts/audit/forms-kit.test.ts`. Expected: FAIL.
- [ ] **Step 3: Add token** `--radius-control: 0.25rem` (and expose it as the `rounded-control` utility the same way `--radius-card` is exposed) in `tokens.semantic.css`; switch `SubmitButton`, `ChoiceCard` indicators and `CONTROL_CLASS` to it. Keep ≥ 44 px height.
- [ ] **Step 4: Implement** `wizard` in `DynamicForm.astro` (compute `buildScreens(schema)` and pass each section's screens to `SectionBlock`) and the grouped rendering in `SectionBlock.astro`; build `WizardControls.astro` using `SubmitButton`-style rectangular classes (secondary variant for Back). When `wizard` is true, `DynamicForm` also imports the Task 3 module in its script (`initWizards()` next to `initDynamicForms()`; create an empty export in Task 3's file now only if needed to compile).
- [ ] **Step 5: Run** the audit tests plus `pnpm exec tsx --test scripts/audit/forms-kit.test.ts`. Expected: PASS.
- [ ] **Step 6: Commit** — `Add the wizard markup to the dynamic form`.

---

### Task 3: Wizard client behaviour

**Files:**
- Create: `packages/ui/src/lib/dynamic-form-wizard-client.ts`
- Modify: `DynamicForm.astro` script (call `initWizards()`).
- Test: extend `packages/ui/src/lib/dynamic-form-wizard.test.ts` only for pure helpers; DOM behaviour is verified in Task 8.

**Interfaces:**
- Consumes: Task 2 markup contract; `nextVisibleScreen` (Task 1); the existing show-if code in `dynamic-form-client.ts` sets `hidden` on questions and sections the server will ignore.
- Produces: `initWizards(root: ParentNode = document): void` — idempotent, safe to call twice (mark forms with a `data-wizard-ready` flag).

- [ ] **Step 1: Behaviour list** (this is the spec for the module; implement exactly):
  - On init, unhide `[data-wizard-controls]`, mark the form `data-wizard-active`, show only the current screen (others get `hidden`), show `[data-wizard-final]` only on the last visible screen.
  - A screen is *hidden* when its section is hidden or every question element inside is hidden (reuse the `hidden` attribute set by show-if); recompute on every navigation and on `change`/`input`.
  - Next: validate the visible screen's controls with `reportValidity()` (stop at the first invalid one), then move to `nextVisibleScreen(..., 1)`. On the last screen the Next button is hidden and the form submits normally.
  - Back: `nextVisibleScreen(..., -1)`; the first screen hides Back. One visible screen total: hide progress, status, Back.
  - Enter in an `input` (not textarea, not a button) on a non-final screen triggers Next; on the final screen it submits.
  - After every move set `data-wizard-current-section="{sectionId}"` on the form element (Task 5 switches the photo with it).
  - Progress: one `<li>` per visible screen (`aria-current="step"` on the current one), rectangular segments styled by CSS classes only; `[data-wizard-status]` text "Step n of N"; the live region gets the same text after each move. Recompute N when show-if changes the visible set.
  - After a move: focus the screen's heading if it has one, else the first control; scroll the card top into view only if it is off screen.
  - History: push `#step-{index}` per forward move and `popstate` shows the matching screen, without scrolling; on load with `#step-n` ignore it unless n is the first screen (answers do not survive a reload).
  - Server errors: if `FormErrorSummary` exists on load or any control has `aria-invalid="true"`, open on the first screen containing an invalid control, or the last screen when only the summary has entries (Turnstile/consent); focus stays on the summary as it does today.
  - `pageshow` with `persisted` re-evaluates the current screen and does not clear values.
  - Never interfere with the chunked uploader: while an upload is running, Next stays enabled but the final submit remains blocked by the existing code.
- [ ] **Step 2: Write failing unit tests** for any pure helper you extract (e.g. `firstScreenWithError(screens, invalidIds)`); run `pnpm exec tsx --test packages/ui/src/lib/dynamic-form-wizard.test.ts`. Expected: FAIL then PASS after implementation.
- [ ] **Step 3: Implement** `initWizards`; keep functions small and named after the behaviours above.
- [ ] **Step 4: Typecheck** `pnpm typecheck` (all apps share it). Expected: no errors.
- [ ] **Step 5: Commit** — `Add the wizard client for forms`.

---

### Task 4: `handleFormPage`, receipt and tests

**Files:**
- Create: `packages/domain/src/forms/http.ts`, `packages/domain/src/forms/http.test.ts`
- Modify: the `forms` export surface so apps can `import { handleFormPage } from '@gamo/domain/forms'` (match how `FormsService` is exported); extend `UploadService` with `getCompleted(uploadId)` only if no method returns `{ uploadId, kind, bytes }` for a finished, unattached upload.

**Interfaces:**
- Consumes: `FormsService.getPublished(slug)`, `FormsService.submit(SubmitInput)`, `FormAnswersError`/`FORM_CLOSED` handling, `guardPublicFormForPage`, `requireSameOrigin` (`@gamo/auth`), `sendSubmissionEmails(db, env, SubmissionEmailInput)`, `signValue` pattern from `apps/academy/src/lib/registration.ts` (`signReceiptReference`/`readReceiptReference`; purpose string `form-receipt`, secret `CUSTOMER_LINK_SECRET`, TTL 7 days), `UploadService`/`uploadServiceFromEnv`, `turnstileActionFor(slug)` from `@studio-gamo/ui/lib/dynamic-form` (or the domain's equivalent already used by the upload endpoint).
- Produces:
  ```ts
  export interface HandleFormPageInput {
    request: Request; env: GamoEnv; locals: unknown;
    slug: string; receiptPath: string;            // e.g. '/forms/received'
    adminUrlFor: (submissionId: string) => string; // siteUrl('admin', `/submissions/${id}`)
    now?: number;
  }
  export type FormPageOutcome =
    | { type: 'redirect'; response: Response }                        // 303 to `${receiptPath}?r=…`
    | { type: 'render'; status: number; published: PublishedForm; values: DynRawValues;
        errors: AnswerError[]; uploads: Record<string, DynUploadSummary[]>;
        summaryExtra: { message: string; fieldId?: string }[]; turnstileError?: string; idempotencyKey: string }
    | { type: 'closed'; published: PublishedForm }
    | { type: 'not_found' }
    | { type: 'unavailable'; status: 503 | 403 };
  export async function handleFormPage(input: HandleFormPageInput): Promise<FormPageOutcome>;
  export async function signFormReceipt(env: GamoEnv, submissionId: string, now: number): Promise<string>;
  export async function readFormReceipt(env: GamoEnv, signed: string | null, now: number): Promise<string | null>;
  ```
  GET → `render` (status 200, empty values, fresh idempotency key). POST order: `requireSameOrigin` → guard (route `forms.${slug}`, turnstile action `form_${slug}` capped at 32 chars, `allowMultipart` for file questions, per-IP 30/15 min, per-email 10/hour on the `contact.email` bind field) → build `raw` (all fields except `idempotency_key`, the Turnstile field and `*.upload`) and `uploads` (ids from `*.upload`, resolved to `UploadRef`) → `submit` → on `created` call `sendSubmissionEmails` inside try/catch (log the error name only) → 303.

- [ ] **Step 1: Write failing tests** (`node:test`, in-memory SQLite like `packages/domain/src/forms/service.test.ts`; seed + publish `contact` through `defaultFormSeeds()`):
  - `valid post stores one submission and redirects to a signed receipt`; the receipt verifies with `readFormReceipt` and fails after TTL and with a tampered value.
  - `same idempotency key twice stores one submission and sends one receipt email`.
  - `invalid answers re-render with errors and the typed values kept, status 422`.
  - `failed Turnstile re-renders with turnstileError and values kept`.
  - `cross-origin post is refused (403) and stores nothing`.
  - `closed form returns closed; unknown or unpublished slug returns not_found`.
  - `answers hidden by show-if are not stored`.
  - `missing PII_HASH_SECRET outside local returns unavailable 503`.
  - `logs and emails never contain answers`: capture `console.error` and the outbox row; assert no submitted email local-part or name appears in the log lines or the staff subject.
- [ ] **Step 2: Run** `pnpm exec tsx --test packages/domain/src/forms/http.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** per the order above; copy the academy page's error handling shape (403 same-origin message, 503 generic message) but return outcomes, not responses, except the redirect.
- [ ] **Step 4: Run** the test file. Expected: PASS. Then `pnpm exec tsx --test scripts/audit/*.test.ts` is NOT run (lead's check); run `pnpm check:quick` once.
- [ ] **Step 5: Commit** — `Add the public form page handler and receipt`.

---

### Task 5: Web pages, focus layout and photos

**Files:**
- Create: `FormPage.astro`, `form-photos.ts`, `pages/forms/received.astro`, the four program form pages (paths in File Structure)
- Modify: `contact.astro`, `partners/interest.astro`, web `legacy-redirects.ts`, `site.config.ts` files, worship/production `legacy-redirects.ts`

**Interfaces:**
- Consumes: `handleFormPage` (Task 4), `DynamicForm` `wizard` (Tasks 2–3), `Frame`, `SiteLayout` with `chrome={false}`, `PhotoKey` from `packages/ui/src/lib/images.ts`, `siteUrl`.
- Produces:
  - `formPhotoFor(slug: string, sectionId: string): PhotoKey` in `form-photos.ts` (typed map keyed by form slug then section id, with a per-slug `default`; slugs: `worship-apply`, `worship-request`, `production-apply`, `production-request`, `contact`, `partner-interest`). Choices from the 16 catalog keys (worship forms: `worshipLeaderGolden`, `acousticLeaderAlt`, `worshipBand`, `sanctuaryCongregation`, `gospelVocalists`; production: `soundEngineer`, `churchModernDay`; contact/partner: `churchGoldenHour`, `chapelSpring`), no repeats on adjacent screens of one form where the catalog allows.
  - `FormPage.astro` props: `{ slug: string; title: string; backHref: string; backLabel: string; submitLabel?: string; description?: string }`. It calls `handleFormPage` itself (props above come from the page), returns the right Response (`redirect.response`, 404 via `Astro.rewrite('/404')`, closed/unavailable notices), renders: skip link via `chrome={false}`, a small logo link top-left to `backHref`, one white `rounded-card` surface split photo | form (photo on top on a phone), `<h1>` = form title, `DynamicForm wizard` with `termsConsent` privacy link on the final screen, `noindex` off for the apply/request/contact pages only if the existing pages were indexed (keep the current robots behaviour; receipt page `noindex`).
  - Photo switching per screen: render one decorative `Frame` per distinct photo of the form, each wrapped with `data-wizard-photo="{sectionId}"` (the section ids that map to it), and let CSS show the one matching the form's `data-wizard-current-section` (set by Task 3); the per-slug default shows before JS runs.

- [ ] **Step 1: Write the pages** (each ≤ 15 lines: import `FormPage`, pass slug/title/backHref). Titles: Musician "Apply As A Musician", church "Request Musicians", technician "Apply To Serve", production "Request A Consultation", "Contact Us", "Partner With Us". Contact page keeps `hello@gamostudio.org` visible in the card's notice for people who prefer email.
- [ ] **Step 2: Receipt page** `forms/received.astro`: verify `r` with `readFormReceipt`, show reference and the form's `confirmationMessage` ("what happens next"), never echo answers; invalid/expired link → friendly notice with the contact email. `noindex`, `Cache-Control: no-store`.
- [ ] **Step 3: Redirects.** In web `legacy-redirects.ts` add `/academy/register` → `siteUrl('academy', '/lessons')` (302). In worship `legacy-redirects.ts` add `/apply` and `/request` → `siteUrl('web', '/worship/apply'|'/worship/request')`, and repoint the existing `/musician/*`, `/church/*`, `/hire/*` entries to those URLs directly; same for production (`/apply`, `/request`, and repoint `/crew/*`, `/client/*`, `/assessment`, `/consultation/*`, `/contact`). Delete the placeholder pages those routes used. Keep the status each old route used (303 for old form endpoints).
- [ ] **Step 4: Repoint CTAs.** `grep -rn "'/request'\|'/apply'\|/request\"\|/apply\"" apps packages --include='*.ts' --include='*.astro'` and change every link to the Worship/Production forms to `siteUrl('web', '/worship/request')` etc. (web `site.config.ts` footer links first). Update `scripts/audit/legacy-redirects.test.ts` fixtures if it enumerates entries.
- [ ] **Step 5: Verify locally** (this is the first browser check; see Task 8 for the full pass): seed and publish the forms in the local DB (use the existing local seed script if `package.json` has one; otherwise add `scripts/dev/seed-forms.ts` that calls `seedDefaultForms` then `FormsService.publish` per seed as `SEED_STAFF_ID`), run web with `env -u CLAUDECODE -u AI_AGENT -u CLAUDE_CODE_ENTRYPOINT pnpm --filter web dev` (see apps' `CLAUDE.md` for `astro dev --background`), open `http://127.0.0.1:4321/worship/request`. Expected: wizard card with photo; the page answers 200 and the old `worship` host path redirects.
- [ ] **Step 6: Commit** — `Add the public forms on the main site`.

---

### Task 6: Academy registration as a wizard

**Files:**
- Modify: `apps/academy/src/components/registration/RegistrationForm.astro` (and its page only if a prop must be added).
- Test: existing `tests/e2e/academy-registration.spec.ts` must still pass (run it once after building academy only: `E2E_APPS=academy pnpm exec playwright test tests/e2e/academy-registration.spec.ts`).

**Interfaces:**
- Consumes: Task 2 markup contract and `WizardControls`, Task 3 `initWizards` (import its script the same way `DynamicForm` does).
- Produces: unchanged field names, hidden fields, consent ids, `idempotency_key`, Turnstile and Reserve/Pay buttons (the server page still reads exactly the fields in `[lesson].astro`).

- [ ] **Step 1: Screens** (as `data-wizard-screen` blocks): student (`student_first_name`, `student_age_band`); parent or guardian (`guardian_name`); contact (`email`, `email_confirm`, `phone`); consents (`terms_accept`, `guardian_consent`, `child_safety_consent`, `marketing_opt_in`); choice (Reserve/Pay buttons + Turnstile as `data-wizard-final`). Same-section rule: only the contact screen holds more than one question. The lesson summary stays beside the card; the Academy layout keeps its header (this page is not a focus layout).
- [ ] **Step 2: Rectangular controls**: the Reserve/Pay submit buttons use the updated `SubmitButton`.
- [ ] **Step 3: Run** the academy spec as above. Expected: PASS (selectors that relied on all fields visible must be adjusted to navigate screens).
- [ ] **Step 4: Commit** — `Restyle the Academy registration as a wizard`.

---

### Task 7: Cleanup and docs

**Files:** delete list in File Structure; modify `DESIGN.md`, `docs/DECISIONS.md`, `docs/FRONTEND_ARCHITECTURE.md`.

- [ ] **Step 1: Delete** `FormComingSoon`, `FormPlaceholder`, now-unused `requestSteps`/`auditionSteps` data and any `WhatHappensNext` only they used; `grep` each name first to confirm no callers remain. Run `pnpm check:quick`. Expected: PASS.
- [ ] **Step 2: Write `DESIGN.md` §11 "Clean visual style"** from the rules in the owner's notes: no eyebrow labels or pills; heading plus subheading only where the heading is unclear; small-radius rectangular buttons and tabs; photo-led, varied cards where the whole card is the link; one main action per block; short headings with every word capitalised; when unsure, remove the element. Add a short "Forms" paragraph: wizard rule, 3-question limit, no-JS fallback.
- [ ] **Step 3: Record decisions** in `docs/DECISIONS.md` (approach A, markup contract, screen rule, positional consents, forms on `gamostudio.org`, history approach once verified in Task 8, sources from the spec) and add the wizard primitives to `docs/FRONTEND_ARCHITECTURE.md`.
- [ ] **Step 4: Commit** — `Remove the form placeholders and document the wizard`.

---

### Task 8: Browser verification and end-to-end spec

**Files:**
- Create: `tests/e2e/forms.spec.ts`
- Modify: `docs/BUILD_LOG.md`

- [ ] **Step 1: Write the spec** (Playwright, web app only, `E2E_APPS=web`; use `tests/e2e/helpers/a11y.ts`; local dummy Turnstile) with these tests:
  - `contact wizard completes with javascript`: fill the name/email/phone screen, Next to topic, Next to message, consent, Send; lands on `/forms/received` showing a reference and no answers.
  - `contact form works without javascript`: `javaScriptEnabled: false` shows every question stacked and posts normally to the same receipt.
  - `next blocks on an invalid email and shows the message linked to the field`.
  - `enter advances in a text input and adds a newline in the message textarea`.
  - `under 18 skips the guardian screen for adults and shows it for minors; back keeps answers` (`/worship/apply`).
  - `failed turnstile or answer re-renders on the right screen with answers kept` (post an invalid email via a request that bypasses client checks).
  - `axe has no serious or critical violations at 360 and 1280 on every screen of /worship/request`; `no horizontal overflow at 360`.
  - `browser back returns to the previous screen`.
  - `reload restores a usable first screen`.
- [ ] **Step 2: Run** `E2E_APPS=web pnpm exec playwright test tests/e2e/forms.spec.ts` after building web only. Expected: PASS.
- [ ] **Step 3: Real browser pass** with the Chrome tools (not substitutes): `/contact`, `/worship/request`, `/worship/apply` (include the video/link screen and a real file upload to local R2 mock), `/production/request`, `/production/apply`, `/partners/interest`, and Academy `/register/<a real lesson slug>`, each at 360 px and desktop, each wizard screen once. Save screenshots under `docs/screenshots/forms-wizard/` (check how earlier entries in `docs/BUILD_LOG.md` store them) and fix anything off against `DESIGN.md` §11 (pills, eyebrows, grid background, cramped photo).
- [ ] **Step 4: Record in `docs/BUILD_LOG.md`**: commands actually run, URLs, screenshot paths, the history/back result, owner actions: publish the six seeded forms in admin; set `INQUIRY_INBOX_EMAIL`; confirm `PUBLIC_TURNSTILE_SITE_KEY` on the web app.
- [ ] **Step 5: Gate and hand over:** `pnpm check:quick` and `pnpm typecheck` per commit; the lead runs full `pnpm check` once. Commit — `Verify the form wizard in the browser`.

---

## Self-review

- Spec coverage: wizard + screen rule (T1–3), forms live on `gamostudio.org` with old URLs redirecting (T5), `handleFormPage`/receipt/emails (T4), Academy restyle on its own host with redirect (T5–6), pill fixes in the form kit only and `DESIGN.md` §11 (T2, T7), photo map via `Frame` (T5), no-JS path and a11y (T2, T8), decisions/sources recorded (T7–8), subdomain removal excluded.
- Known judgement left to the implementer (spec "left to the builder"): exact typography, file-upload screen look, whether the admin preview gets a wizard toggle (not planned).
- Open dependency to verify early in Task 4 Step 3: the shape returned for finished uploads (if `UploadService` has no lookup, add `getCompleted`).
