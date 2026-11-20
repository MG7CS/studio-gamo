# Form wizard — design (2026-11-20)

Status: **draft for owner approval** (nothing built). Follows `2026-11-16-forms-emails-invoices-design.md`
(forms, emails, invoices) and the clean visual style in `DESIGN.md` / owner rules below.

## Intent

Every public Gamo form becomes a short onboarding flow: one clean card, a photo beside it (above it on a
phone), **one question per screen** (up to **three** when they are in the same section), Back / Next, small
progress marks, no site header and no footer clutter, no grid background. The same flow is used to contact us
and to register as a musician, technician, church, student or partner. The goal is that people finish: each
screen asks little, never feels like a wall of fields, and feels like being welcomed in, not processed.

Also finish the forms that do not exist yet. Today **no public form is live**: `gamostudio.org/worship/request`
returns 404; the worship/production "apply/request" pages are "coming soon" placeholders (on their own
subdomains), `/contact` and `/partners/interest` only show an email address, and `DynamicForm` is used only in
the admin preview and a catalog page. The page handler that receives submissions (`handleFormPage`, plan Task
2.3) is not built.

## Goals / non-goals / anti-goals

Goals
- Seven forms live and polished: Worship musician application, Worship church request, Production
  technician application, Production request, Contact, Partner interest (all on `gamostudio.org`), and Academy
  student registration (restyled, same logic).
- A reusable wizard in the shared UI that any published form gets for free; staff keep editing forms in the
  admin builder exactly as today.
- Works without JavaScript (all questions shown stacked, one normal submit), passes axe WCAG 2.2 AA, fits at
  360 px, targets ≥ 44 px, CSP-safe (bundled script, no inline script or handlers).

Non-goals
- Removing the program subdomains. The owner first wanted only `gamostudio.org` and `admin` to remain, then
  (2026-11-20) said to **leave it for now; it hurts nothing**. It is deferred, not scheduled (it would move the
  Worship, Academy and Production pages under `/worship`, `/academy`, `/production` and retire three apps). The
  forms here are built on `gamostudio.org` so they would never need to move.
- A staff-editable "screens and photos" layer in the form schema (approach C; can be added later on top).
- New form types beyond the seven (e.g. a separate Academy teacher application — the musician form already
  has "can teach" and PDF upload). Add only if the owner names it.
- New providers, analytics, accounts, saved drafts, partial-answer storage.

Anti-goals (would be a failure even if it technically works)
- Storing half-finished personal answers on the server.
- Breaking the no-JavaScript path, or the server being anything but the authority on validation.
- The generic look the owner dislikes: pills, eyebrow labels, identical rounded cards, grid backgrounds.

## Approaches considered

- **A. Enhance the existing renderer (chosen).** Server renders every section as today; a bundled script turns
  them into screens. No migration, no stored partial answers, no-JS fallback for free.
- B. Server-side steps (one page per screen, answers held on the server between screens): truly no-JS but stores
  unfinished personal data, complicates file uploads, much larger.
- C. Screens and photos in the form schema, edited in the admin builder: most flexible, needs a migration and
  new builder UI. Possible later layered on A.

## Decisions

Owner decisions (2026-11-20): forms live on `gamostudio.org` at the spec URLs; approach A.

### URLs and wiring
- `apps/web` gets pages: `/worship/apply`, `/worship/request`, `/production/apply`, `/production/request`,
  `/contact`, `/partners/interest`. The existing placeholders on the program sites redirect there (legacy
  redirects, 302), and their Apply/Request buttons use `siteUrl('web') + path` (never a hard-coded origin).
- Build `handleFormPage` in `packages/domain/src/forms/http.ts` following the working pattern in
  `apps/academy/src/pages/register/[lesson].astro`: `requireSameOrigin` → `guardPublicFormForPage` (Turnstile,
  rate limits, bounded body) → `FormsService.submit` (idempotency key) → 303 to a signed receipt page; on failure
  re-render with `values`, `errors`, `uploads`, summary.
- Submission emails (receipt to submitter, staff notification to `INQUIRY_INBOX_EMAIL`, no names in subjects)
  and the outbox come from the 2026-11-16 spec; wire them if not already present. Real sends stay mock locally.
- The six seeded forms (`defaultFormSeeds()`) exist but must be **published once in admin** (owner action) before
  `getPublished` returns them; local dev seeds and publishes them for browser checks.

### The wizard (shared, `packages/ui`)
- **Screen rule (pure function in `lib/dynamic-form.ts`, unit-tested):** walk the sections in order; hidden
  sections (show-if false) and screens whose questions are all hidden are skipped. Default is **one question
  per screen**. A screen may hold **up to 3 consecutive questions from the same section**, but only "light"
  questions (short_text, dropdown, date, time, single-choice with few options). "Heavy" questions — paragraph,
  file_upload (with its link alternative), choice_grid, checkbox_grid, checkboxes, linear_scale/rating — always
  stand alone. `statement` blocks attach to the next question's screen and do not count. The contact trio (name,
  email, phone) therefore becomes one screen.
- Server markup stays one `<form>` with every section; the client module marks screen boundaries, shows one
  screen at a time, and the last screen holds the consent checkbox(es), privacy notice link, Turnstile and the
  submit button (Next becomes Send). No review screen.
- **Behaviour:** Next validates only the current screen (native constraint validation, same messages as the
  server) and blocks on errors; Back never loses answers (everything stays in the DOM); Enter advances on
  non-final screens; browser Back steps to the previous screen (history state); focus moves to the new screen's
  heading and a polite live region announces "Step n of N"; progress is text ("3 of 8", recalculated when show-if
  skips screens) plus small rectangular segments (never circles or pills), `aria-current` on the current mark.
- **Server errors:** the page re-renders with the error summary and opens on the **first screen that has an
  error**; per-field errors are linked with `aria-describedby`.
- **Screen heading:** one `<h1>` per page is the form title; a screen with several questions uses its section
  title as `<h2>`; a single-question screen uses the question label as its visible heading with help text under
  it. No eyebrow or step pill above any heading.
- Enable with a `wizard` prop on `DynamicForm` (default off so the admin preview and catalog keep working);
  the admin preview gets a "Preview as wizard" toggle only if cheap.

### Page layout and photos
- Pass `chrome={false}` (existing no-header/no-footer mode, skip link included). A small logo link back to the
  relevant program page sits top-left, as in the reference. The privacy notice link lives on the consent screen
  (spec requirement: on every form). No grid background.
- Card: one white surface using the shared `rounded-card` radius, photo on the left on desktop (half width),
  a landscape photo on top on a phone. Photos render only through the shared `Frame` (decorative, fixed ratios
  `portrait` on desktop and `landscape` on phone — two Frames toggled by CSS), radius via `--frame-radius`.
- **Photo choice** is a typed map in `apps/web/src/lib/form-photos.ts` keyed by form slug and section id, with a
  fallback per form; from the existing 16 catalog keys (e.g. `worshipLeaderGolden`, `acousticLeaderAlt`,
  `sanctuaryCongregation` for church request, `soundEngineer` for production, `guitarMentor`/`boyGuitar` for
  Academy). The newer instrument/musician/tech free-licence photos named in the photo policy are not in the
  catalog on this branch; use them only if present when building, with licences recorded.
- Buttons: Next/Back/Send are small-radius rectangles. Fix the pill leftovers in the form kit only:
  `SubmitButton`, `ChoiceCard` radio indicators, `CONTROL_CLASS` (`rounded-xl`). Delete `FormComingSoon` and the
  worship `FormPlaceholder` once unused. Leave the site-wide `ButtonLink` migration to the ongoing clean-style pass.
- The clean-style rules live only in memory today (`DESIGN.md` ends at §10). Add `DESIGN.md` §11 "Clean visual
  style" so they are in the repo.

### Academy student registration
Keep `apps/academy/src/pages/register/[lesson].astro` and its guard, receipt email, Reserve/Pay choice and Stripe
Checkout logic untouched; restyle `RegistrationForm.astro` into the same wizard shell (screens: student; parent
or guardian; contact; consents + choice) using the same shared wizard pieces. It stays on the Academy host
because it is bound to a lesson and a payment; `gamostudio.org/academy/register` is a redirect to the lesson list.
The Academy form therefore stays on the Academy host for the foreseeable future (subdomain removal is deferred).

## Constraints
AGENTS.md rules apply: PBC wording, program order Academy → Worship → Production in anything listing programs,
no pills/eyebrows, semantic tokens only in `apps/*`, pages thin, no inline script, fail closed (503 when
Turnstile/email unconfigured outside local), integer cents, logs without personal data or tokens. Test economy:
unit test the screen rule and the server re-render path; one Playwright spec (`tests/e2e/forms.spec.ts`: JS on and
off, axe at 360 and 1280, a failed submit opening on the right screen); no new screenshot baselines; lead runs the
full check once. Real browser screenshots go in `docs/BUILD_LOG.md`.

## Research (recorded per the research-first rule; search snippets, not full-page reads)
- GOV.UK Design System, [Question pages](https://design-system.service.gov.uk/patterns/question-pages) and
  [One thing per page](https://designnotes.blog.gov.uk/2015/07/03/one-thing-per-page/): start with one question
  per page, group only when it helps; simple "Question 3 of 5" step text. → one question default, text progress.
- Accessible wizard guidance (e.g. [Visa](https://design.visa.com/patterns/wizard/accessibility/),
  [Trimble](https://modus.trimble.com/components/web/wizard/accessibility)): move focus to the new step's
  heading, announce "Step n of N" in a polite live region, `aria-current="step"`, text not colour alone, keep data
  when going back, link errors with `aria-describedby`.
- Progressive enhancement ([Formspree on fieldsets](https://formspree.io/blog/html-fieldset/),
  [formwizard](https://github.com/smohadjer/formwizard),
  [Smashing, multistep forms](https://smashingmagazine.com/2024/12/creating-effective-multistep-form-better-user-experience/)):
  steps as fieldsets, all visible without JS, validate per step rather than at the end. → chosen approach A.
- Not found/verified: history/back-button behaviour for step URLs — the builder should test `pushState` with
  popstate in a real browser rather than rely on a source.

## Plan outline
1. Shared wizard: screen rule + tests, `wizard` prop, client module, progress, rectangular controls.
2. `handleFormPage`, receipt page, redirects from the program-site placeholders.
3. `apps/web` pages for the six forms, photo map, focus layout.
4. Academy registration restyle.
5. Cleanup (placeholders, pill fixes, `DESIGN.md` §11, `DECISIONS.md`, `FRONTEND_ARCHITECTURE.md`).
6. Verify in a real browser at 360 px and desktop; record screenshots.

## Answers to the builder check
- **Wizard is a markup contract, not a `DynamicForm`-only feature (my call).** The client module reads `data-wizard`,
  `data-wizard-screen` and `data-wizard-final` attributes. `DynamicForm` emits them from the screen rule; the Academy
  form emits them by hand with its own screens. Academy logic (guard, receipt, Reserve/Pay, Stripe) is untouched; only
  markup and styling change, so the Academy task is a thin restyle and the screen rule is unit-tested once.
- **Consents are positional, no schema marker (my call).** The final screen is whatever comes last in the visible
  form order; Turnstile, the privacy notice link and Send are appended to it. Consent checkboxes are ordinary
  "checkboxes" questions, so they stand alone and are required per screen. The under-18 `guardian_consent` is a
  normal question inside the guardian section: it is skipped only when its show-if hides it, and it can never be
  merged with another question. If a published form has no consent question, the final screen is the last question.
- **Scope of earlier phases (checked in the repo).** Already present: `FormsService.submit`, answer validation,
  chunked uploads to R2 (`apps/web` upload endpoints), the guard, and submission email templates
  (`packages/domain/src/forms/emails.ts`). `submit` deliberately sends nothing; the page handler runs the
  "after submit" emails. So this project builds `handleFormPage` (submit, call the email functions through the
  outbox, 303 to a signed receipt), a minimal receipt page (reference number and what happens next, no answers
  echoed, link made like Academy's signed receipt), and the six web pages. It does not rebuild uploads or email
  templates; the plan verifies them and fixes only gaps found. Uploads are checked in the one Playwright spec with
  the mocked upload endpoints already used by `tests/e2e/dynamic-form.spec.ts`.

## Left to the builder
Exact typography and spacing (follow `DESIGN.md`), file-upload screen presentation, the history-state details, whether
the admin preview gets a wizard toggle, and exact photo-to-screen assignments within the rules above.

## Calls I made (please check)
- Academy form stays on the Academy host (restyled), with a redirect from `gamostudio.org/academy/register`.
- Light vs heavy question rule decides what may share a screen; no review screen before Send.
- No Academy teacher application, no extra forms beyond the seven.
- Fix pill leftovers in the form kit only; site-wide `ButtonLink` stays for the existing clean-style pass.
- Write `DESIGN.md` §11 so the style rules live in the repo.
