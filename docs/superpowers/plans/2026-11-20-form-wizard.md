# Form Wizard Implementation Plan (revised 2026-11-20 against the deployed code)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every public Gamo form a one-question-per-screen onboarding wizard (card, photo, Back/Next, progress, no footer), and have the admin form preview show the same thing.

**Architecture:** `DynamicForm` keeps rendering every section server-side (works without JavaScript); its `wizard` prop adds a markup contract (`data-wizard*`) that a bundled client module turns into screens. The deployed web app already has the handler, receipt, pages and components (`loadFormPage`, `FormPageView`, `FormPanel`, `FormReceipt`); this plan only changes how the form is presented. The wizard card (photo plus form) and the photo map live in `packages/ui` because both the web app and the admin preview use them. The Academy registration form emits the same contract by hand.

**Tech Stack:** Astro SSR on Cloudflare Workers, Tailwind 4 tokens in `packages/ui/src/styles`, `node:test` via `pnpm exec tsx --test`, Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-11-20-form-wizard-design.md` (read it first, including its "Correction").

**Base:** branch `cleanup/form-wizard` (worktree `.claude/worktrees/wizard`), created from the deployed commit `9bccda57` (`main`, tag `deploy/2026-11-19`). The six forms are already published in production.

## Global Constraints

- Clean style (`DESIGN.md` §11): no eyebrow labels or pills; Back/Next/Send are small-radius rectangles using the existing `--radius-button`; headings short, every word capitalised (shared heading styles do it); one main action per screen; whole-card links, varied photo-led cards.
- Semantic tokens only in `apps/*`; no arbitrary values, hex colours or inline `style=`; photos only through the shared `Frame` (decorative, ratios `portrait` and `landscape`), radius via `--frame-radius`.
- No inline `<script>` or `on*=` handlers; client code is a bundled module imported from a component script.
- Works without JavaScript: every question visible, one normal submit; the server stays the authority on validation.
- Interactive targets ≥ 44 × 44 px; exactly one `<h1>` per page; axe WCAG 2.2 AA clean; no horizontal overflow at 360 px.
- Hosts come from `packages/config/apps.ts` via `siteUrl(id, path)`; never hard-code an origin.
- Max 3 questions per screen, same section only; heavy question types stand alone.
- `packages/ui` stays generic: no imports from `apps/*`, no app, program or host names, no page copy. Form kinds (`musician_application`, `church_request`, …) are domain vocabulary and may key the photo map.
- Logs name error codes, never answers, emails or tokens. Real emails are never sent locally.
- Test economy (AGENTS.md): iterate with one test file (`pnpm exec tsx --test <file>`); gate each commit with `pnpm check:quick` and `pnpm typecheck`; the lead runs the full `pnpm check` once at the end; no new screenshot baselines. Agent shells run Astro with `env -u CLAUDECODE -u AI_AGENT -u CLAUDE_CODE_ENTRYPOINT`.
- Commit messages: one short sentence saying what was done; no body, no attribution. Commit locally only; never push or deploy.
- Subagents run on Sonnet at medium effort (owner instruction). Subdomain removal is out of scope (deferred).

## Review Focus

1. Under-18 flow (`/worship/apply`): choose "Under 18", go Back, change to an adult, continue — the guardian screen is skipped, earlier answers are kept, and the guardian consent never shares a screen with another question (Task 9 spec).
2. Enter key: in a single-line input on a non-final screen it advances and never submits early; in a paragraph it inserts a newline (Task 9 spec).
3. Reload and back/forward cache: restoring the page keeps typed answers and a usable screen, and Send is enabled again (Task 9).
4. Turnstile lives in the hidden final block: a real submit with the local dummy token must succeed, and an upload on an earlier screen must still get its token; if not, switch that block from `display:none` to `inert` plus visually hidden (Task 9).
5. Unpublished or closed form, and a form with a single screen: unpublished still answers 404 (contact falls back to no form), closed shows its notice, a single screen shows no progress or Back (Task 5 and Task 9).
6. Failed submit (bad answer, failed Turnstile, double post with the same idempotency key): answers kept, opens on the first screen with an error, exactly one stored submission (Task 9; the handler and its tests already exist).
7. Admin preview: a draft with a section staff just added or removed still previews correctly as a wizard (unknown sections fall back to the form's default photo), and the preview still posts nowhere (Task 6).

## Status of earlier work

Also done: Task S, a local-only script `pnpm forms:seed:local` (`09cbc7fc`) that seeds and publishes the six default forms in the five local databases, because local admin has no account or secrets to sign in with. Done, reviewed and committed on this branch: Tasks 1–3 (screen rule, markup, client: `6b7c9f57`, `3357d200`, `888042c6`, `9062cc20`, fix `da471099`) and Task 4 (footer option, `1251562e`, review in progress). The first plan's Tasks 4, 5 and 7 (handler, receipt, pages, placeholders) are obsolete: the deployed code has them.

## File Structure

Create: `packages/ui/src/components/forms/dynamic/WizardCard.astro`, `packages/ui/src/lib/wizard-photos-client.ts`, `packages/ui/src/lib/form-photos.ts`, `scripts/audit/form-photos.test.ts`, `tests/e2e/forms.spec.ts`.
Modify: `apps/web/src/lib/form-page.ts` (expose the form's kind), `apps/web/src/components/forms/{FormPageView,FormPanel}.astro`, the six web form pages, `apps/admin/src/pages/forms/[id]/preview.astro` (and any other admin place that renders `DynamicForm`), `apps/academy/src/components/registration/*` and its register page, `packages/ui` form components with leftover pills, `DESIGN.md`, `docs/DECISIONS.md`, `docs/FRONTEND_ARCHITECTURE.md`, `docs/BUILD_LOG.md`.

---

### Tasks 1–4: screen rule, markup, client, footer option (done; see Status)

---

### Task 5: Shared wizard card, photo map and the web form pages

**Files:**
- Create: `WizardCard.astro`, `wizard-photos-client.ts`, `form-photos.ts`, `scripts/audit/form-photos.test.ts` (paths in File Structure).
- Modify: `apps/web/src/lib/form-page.ts`, `FormPageView.astro`, `FormPanel.astro`, `apps/web/src/pages/{worship,production}/{apply,request}.astro`, `contact.astro`, `partners/interest.astro`.

**Interfaces:**
- Consumes: `DynamicForm` `wizard` prop and the `data-wizard-current-section` attribute the client sets on the form after every move; `Frame`; `PhotoKey` from `packages/ui/src/lib/images.ts`; `defaultFormSeeds()` from `@gamo/domain/forms`; the Task 4 `footer` prop.
- Produces:
  - `interface FormPhotos { default: PhotoKey; bySection: Record<string, PhotoKey> }` and `formPhotosFor(kind: string): FormPhotos` in `packages/ui/src/lib/form-photos.ts`, keyed by form kind (`musician_application`, `technician_application`, `church_request`, `production_request`, `contact`, `partner_interest`) then section id, following the owner's photo policy (new `instrument*`/`musician*`/`tech*` photos for screens about an instrument, kind of musician or technical job; original photos for church, general and closing screens); an unknown kind returns a neutral catalog photo. A section staff add later falls back to the form's `default`.
  - `WizardCard.astro` props `{ photos: FormPhotos; title: string; description?: string; headingLevel?: 1 | 2 }` (default 1) and a default slot for the form: one `rounded-card` surface, photo column on the left from `lg`, photo on top below `lg`; one decorative `Frame` per distinct photo (ratio `portrait` from `lg`, `landscape` below), each wrapper carrying `data-wizard-photo="{section ids}"`; the default photo is visible before JavaScript. `wizard-photos-client.ts` exports `initWizardPhotos(root?: ParentNode)`: a `MutationObserver` on the form's `data-wizard-current-section` that shows the matching wrapper and hides the others with the `hidden` attribute; imported from a `<script>` in `WizardCard.astro`; idempotent.
  - `PublicFormInfo` in `apps/web/src/lib/form-page.ts` gains `kind: string` (from `published.form.kind`).

- [ ] **Step 1: Write the failing test** `scripts/audit/form-photos.test.ts` (an audit test may import across packages): for every seed in `defaultFormSeeds()` that is a public form, `formPhotosFor(seed.kind)` has a default and every section id of the seed's schema resolves (own entry or default) to a key present in the photo catalog; no two adjacent sections of one form use the same photo when three or more distinct photos are mapped; an unknown kind returns a catalog key.
- [ ] **Step 2:** `pnpm exec tsx --test scripts/audit/form-photos.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `form-photos.ts`; run the test again. Expected: PASS.
- [ ] **Step 4: Implement** `WizardCard.astro` and `wizard-photos-client.ts`; the card's title is the page's single `<h1>` (the form's title; the description only if the form has one; no eyebrow).
- [ ] **Step 5: Wire the web views.** Add `kind` to `PublicFormInfo`. In `FormPageView.astro` and `FormPanel.astro`, render the `form` view inside `WizardCard` (photos from `formPhotosFor(page.form.kind)`) with `<DynamicForm wizard ... />` (all other props as today); the `sent`, `closed` and `unavailable` views keep their text in the same clean card style. Pass `footer={false}` to `SiteLayout` on the six pages. The contact page keeps its topic prefill and the "form not published yet" fallback; keep any hero text above the card only if it fits the clean rules (otherwise let the card carry the title).
- [ ] **Step 6:** `pnpm typecheck` and `pnpm check:quick`. Expected: pass.
- [ ] **Step 7: Commit** — `Show the public forms as wizard cards`.

---

### Task 6: Admin form preview uses the same wizard

**Files:**
- Modify: `apps/admin/src/pages/forms/[id]/preview.astro` and any other admin page or component that renders `DynamicForm` (search `grep -rn "DynamicForm" apps/admin/src`); `tests/e2e/admin-forms.spec.ts` only where its preview selectors assumed every question visible.

**Interfaces:**
- Consumes: `WizardCard`, `formPhotosFor(kind)` (Task 5), `DynamicForm` `wizard`, `edit.form.kind` and `edit.draft` from `FormsService.getForEdit`.
- Produces: the preview renders the draft exactly as the public page will (wizard, photo card), with `turnstile={false}`, the form still posting back to the preview URL and saving nothing, the "Preview: nothing is saved" notice kept; the card's title is a normal admin heading level (use `headingLevel={2}`; the admin page owns its `<h1>`). Nothing in `apps/admin` imports from `apps/web`.

- [ ] **Step 1:** Replace the plain `DynamicForm` in the preview with `WizardCard` (title `edit.form.title`) around `<DynamicForm wizard ... />`; keep the existing action, values, `turnstile={false}` and notice; update the notice text to say staff can step through the screens.
- [ ] **Step 2:** Apply the same to any other admin page that previews a form.
- [ ] **Step 3:** Build only admin and run `E2E_APPS=admin pnpm exec playwright test tests/e2e/admin-forms.spec.ts`; adjust selectors that assumed all questions were visible. Expected: PASS.
- [ ] **Step 4:** `pnpm typecheck` and `pnpm check:quick`. Commit — `Show the form preview in admin as the wizard`.

---

### Task 7: Academy registration as a wizard

**Files:**
- Modify: `apps/academy/src/components/registration/{RegistrationForm,StudentFields,ContactFields,ConsentFields,RegistrationChoice}.astro` and `apps/academy/src/pages/register/[lesson].astro` only for the layout `footer={false}`.
- Possibly modify: `packages/ui/src/lib/dynamic-form-wizard-client.ts` and its test if the final screen's two submit buttons (Reserve, Pay) need the "Back beside Send" logic extended from one submit button to all `[type=submit]` in `[data-wizard-final]`.

**Interfaces:**
- Consumes: the markup contract (`data-wizard`, `data-wizard-screen`, `data-wizard-section`, `data-wizard-final`), `WizardControls`, `initWizards`.
- Produces: unchanged field names, hidden fields, consent ids, `idempotency_key`, Turnstile and Reserve/Pay buttons — the register page and `createGuestRegistration` read exactly what they read today.

- [ ] **Step 1: Screens** as `data-wizard-screen` blocks inside one `data-wizard` form: student (`student_first_name`, `student_age_band`); parent or guardian (`guardian_name`); contact (`email`, `email_confirm`, `phone`); consents (`terms_accept`, `guardian_consent`, `child_safety_consent`, `marketing_opt_in`); choice (Reserve/Pay buttons plus Turnstile as `data-wizard-final`). Only the contact screen holds more than one question. The lesson summary stays beside the card.
- [ ] **Step 2:** If the client moves only one submit button, extend it (and its pure helper test) to move every submit button in the final block into the actions row; Reserve and Pay must not overflow at 360 px.
- [ ] **Step 3:** Run the existing Academy spec after building only that app: `E2E_APPS=academy pnpm exec playwright test tests/e2e/academy-registration.spec.ts`; adjust selectors that assumed all fields were visible. Expected: PASS.
- [ ] **Step 4: Commit** — `Restyle the Academy registration as a wizard`.

---

### Task 8: Form-kit leftovers and docs

**Files:** form components under `packages/ui/src/components/forms/` (and `forms/dynamic/`) with leftover `rounded-pill`, `rounded-full` or `rounded-xl`; `scripts/audit/ui-boundaries.test.ts` (shrink its round-baseline as entries are fixed); `DESIGN.md`, `docs/DECISIONS.md`, `docs/FRONTEND_ARCHITECTURE.md`.

- [ ] **Step 1:** `grep -rnE "rounded-(pill|full|xl)" packages/ui/src/components/forms` and replace leftovers on form controls with `rounded-button`, and boxes with the shared card radius, so the form kit has no pills; remove the matching entries from the guard's baseline. `pnpm exec tsx --test scripts/audit/ui-boundaries.test.ts`. Expected: PASS.
- [ ] **Step 2:** Add a short "Forms" paragraph to `DESIGN.md` §11: the wizard rule (one question per screen, at most 3 from one section, heavy questions alone), header stays and footer goes on form pages, no-JS fallback, admin preview shows the same wizard.
- [ ] **Step 3:** Record decisions in `docs/DECISIONS.md` (approach A, markup contract, screen rule, positional consents, header kept and footer dropped on form pages, the `footer` option, the shared `WizardCard` and kind-keyed photo map promoted to `packages/ui` because the admin preview is the second user, the sources listed in the spec's Research section, and the `#step-n` history result from Task 9) and describe `WizardControls`, `screenItems`, `WizardCard` in `docs/FRONTEND_ARCHITECTURE.md`.
- [ ] **Step 4:** `pnpm check:quick`. Commit — `Remove the last pills from the form kit and document the wizard`.

---

### Task 9: Browser verification and the end-to-end spec

**Files:** Create `tests/e2e/forms.spec.ts`; modify `docs/BUILD_LOG.md`.

- [ ] **Step 1: Local data.** Local admin has no account or secrets, so publish the six default forms with `pnpm forms:seed:local` (Task S, `scripts/dev/seed-forms.ts`; local databases only) after `pnpm db:migrate:local`. The owner's `make dev-all` servers hold the dev ports and must be stopped before e2e runs (ask the owner).
- [ ] **Step 2: Write the spec** (Playwright, web and admin apps; `tests/e2e/helpers/a11y.ts`; local dummy Turnstile): `contact wizard completes with javascript` (name/email/phone screen, topic, message, consent, Send, thank-you with a reference and no answers echoed); `contact form works without javascript` (all questions stacked, normal post); `next blocks on an invalid email with the message linked to the field`; `enter advances in a text input and adds a newline in the message paragraph`; `under 18 skips the guardian screen for adults and shows it for minors, back keeps answers` (`/worship/apply`); `a failed submit re-renders on the right screen with answers kept`; `turnstile widget in the hidden final block still submits` (Review Focus 4); `pressing Send while an upload is running shows the wait message on the screen that holds the file` (mocked slow upload, as in `tests/e2e/dynamic-form.spec.ts`); `axe has no serious or critical violations at 360 and 1280 on every screen of /worship/request`; `no horizontal overflow at 360`; `browser back returns to the previous screen`; `reload leaves a usable first screen`; `the page has a header and no footer`; `the admin preview shows the same wizard and saves nothing`.
- [ ] **Step 3:** Run `E2E_APPS=web,admin pnpm exec playwright test tests/e2e/forms.spec.ts` after building only those apps. Expected: PASS. Fix real defects in the wizard client or card; do not weaken assertions.
- [ ] **Step 4: Real browser pass** with the Chrome tools: `/contact`, `/worship/request`, `/worship/apply` (including the video/link screen and a real file upload), `/production/request`, `/production/apply`, `/partners/interest`, Academy `/register/<a real lesson slug>`, and the admin preview of one form, at 360 px and desktop, each screen once. Save screenshots where `docs/BUILD_LOG.md` stores them and fix anything off against `DESIGN.md` §11 (pills, eyebrows, grid background, cramped photo, Back/Next/Send crowding at 360 px).
- [ ] **Step 5: Record in `docs/BUILD_LOG.md`:** commands actually run, URLs, screenshot paths, the `#step-n` result and the Turnstile result; owner actions: deploy from `main` after merging (the six forms are already published; republish is not needed because the wizard changes presentation only, but check that a form edited in admin still opens correctly), confirm `PUBLIC_TURNSTILE_SITE_KEY` on the web app.
- [ ] **Step 6:** `pnpm check:quick` and `pnpm typecheck`; the lead runs the full `pnpm check` once. Commit — `Verify the form wizard in the browser`.

---

## Self-review

- Spec coverage: wizard rule, markup and client (Tasks 1–3, done); header kept and footer removed (Task 4); shared card, kind-keyed photos and the six pages (Task 5); admin preview reusing it (Task 6); Academy (Task 7); kit leftovers, `DESIGN.md`, decisions (Task 8); no-JS, a11y, back/forward, Turnstile, upload wait, failed submit, browser evidence (Task 9). Handler, receipt, uploads and emails are deliberately untouched.
- Judgement left to the implementer (spec "left to the builder"): typography and spacing, file-upload screen look, exact photo assignments.
- Open risks are named in Review Focus 3, 4 and 7 and are checked only in a browser.
