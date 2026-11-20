# Form wizard — design (2026-11-20, revised the same day)

Status: **approved by the owner; revised after finding the deployed code** (see "Correction"). Follows
`2026-11-16-forms-emails-invoices-design.md` (forms, emails, invoices) and the clean visual style in `DESIGN.md` §11.

## Correction (read first)

The first version of this design was written against a stale branch (`cleanup/forms-emails-invoices`, 103 commits
behind what is deployed). The deployed code (`cleanup/forms-emails-invoices-verify`, now `main`, tag
`deploy/2026-11-19`) already has: the submission handler (`packages/domain/src/forms/http.ts`, `submitFormPage`,
signed `?sent=` receipt, upload tokens), `apps/web/src/lib/form-page.ts` (`loadFormPage`), the components
`FormPageView`, `FormPanel` and `FormReceipt`, the web pages `/worship/apply`, `/worship/request`,
`/production/apply`, `/production/request`, `/contact` and `/partners/interest`, the `--radius-button` token,
`DESIGN.md` §11, and the instrument, musician and tech photos. **So `/worship/request` returned 404 only because
the six seeded forms are not published yet**: after a deploy the owner opens **Forms** once in admin, which
publishes them (`docs/RUNBOOK.md` §6), and until then `loadFormPage` answers 404. Nothing needs building for that
except that owner step. What is genuinely missing is the wizard look and feel.

## Intent

Every public Gamo form becomes a short onboarding flow: one clean card, a photo beside it (above it on a phone),
**one question per screen** (up to **three** when they are in the same section), Back / Next, small progress marks,
**no footer**, no grid background. The site header stays (the owner's references showed only a logo; the footer
is what must go). The same flow is used to contact us and to register as a musician, technician, church, student
or partner. People should finish: each screen asks little and feels like being welcomed in, not processed.

## Goals / non-goals / anti-goals

Goals
- All seven public forms (Worship musician application, Worship church request, Production technician
  application, Production request, Contact, Partner interest, Academy student registration) use the wizard.
- A reusable wizard in the shared UI that any published form gets for free; staff keep editing forms in the admin
  builder exactly as today.
- Works without JavaScript (all questions stacked, one normal submit), passes axe WCAG 2.2 AA, fits at 360 px,
  targets ≥ 44 px, CSP-safe (bundled script, no inline script or handlers).

Non-goals
- Removing the program subdomains (deferred by the owner on 2026-11-20: "it hurts nothing").
- Rebuilding the handler, receipt, uploads or emails: they exist and stay as they are.
- A staff-editable "screens and photos" layer in the form schema (approach C; can be layered on later).
- New form types (e.g. a separate Academy teacher application — the musician form already has "can teach" and PDFs).
- New providers, analytics, accounts, saved drafts, partial-answer storage.

Anti-goals
- Storing half-finished personal answers on the server.
- Breaking the no-JavaScript path, or the server being anything but the authority on validation.
- The generic look the owner dislikes: pills, eyebrow labels, identical rounded cards, grid backgrounds.

## Approaches considered

- **A. Enhance the existing renderer (chosen by the owner).** The server renders every section as today; a bundled
  script turns them into screens. No migration, no stored partial answers, no-JS fallback for free.
- B. Server-side steps with saved partial answers: stores unfinished personal data, harder uploads, much larger.
- C. Screens and photos in the form schema edited in the admin builder: needs a migration and builder UI; can be
  layered on A later.

## Decisions

### The wizard (shared, `packages/ui`) — built (plan Tasks 1–3)
- **Screen rule** (`lib/dynamic-form-wizard.ts`): default one question per screen; up to 3 consecutive "light"
  questions from the same section share a screen; light = short_text, dropdown, date, time, multiple_choice with at
  most 4 options and no "Other"; everything else stands alone; statements ride with the next question and do not
  count; hidden (show-if) screens are skipped.
- **Markup contract** (server-rendered, behind `DynamicForm`'s `wizard` prop): `data-wizard` on the form,
  `data-wizard-screen`/`data-wizard-section` per screen, `data-wizard-final` on the consent/Turnstile/submit block,
  `WizardControls` (hidden until the script runs). Consents are positional (the final screen is whatever comes
  last); no schema marker.
- **Client** (`lib/dynamic-form-wizard-client.ts`): Next validates the current screen, Back keeps answers, Enter
  advances in single-line inputs, progress as text plus small rectangular marks, focus and a polite live region
  after each move, browser Back through `#step-n`, errors from a failed submit open on the first screen with an error
  (the last screen when only consent or Turnstile failed), Back sits beside Send on the final screen.

### Page shell and photos — to build (plan Tasks 4–5)
- **Layout:** the site header stays and the footer goes, for the form pages only. Add a `footer?: boolean` option
  (default true) to the shared `BaseLayout`, passed through the app layouts like `chrome`.
- **Card:** one surface with the shared card radius; the photo on the left on desktop (about half) and on top on a
  phone, only through the shared `Frame` (decorative, ratios `portrait` and `landscape`, radius via
  `--frame-radius`). The card replaces the form-view branches of `FormPageView` (apply/request pages) and
  `FormPanel` (contact, partner interest); the "thank you", closed and unavailable views keep their content in the
  same clean card.
- **Photos:** a typed map in `apps/web/src/lib/form-photos.ts` keyed by form slug then section id, with a per-form
  default. Follow the owner's photo policy: the new free-licence photos (`instrument*`, `musician*`, `tech*`) for
  screens about an instrument, kind of musician or technical job; the original photos for church, general and
  closing screens. The photo changes with the section (the script sets `data-wizard-current-section`).
- **Controls:** Back/Next/Send are small-radius rectangles (`--radius-button`); no pills, no eyebrow labels.

### Academy student registration — to build (plan Task 6)
Keep `apps/academy/src/pages/register/[lesson].astro` and its guard, receipt email, Reserve/Pay choice and Stripe
logic untouched; the form components emit the same markup contract (screens: student; parent or guardian; contact;
consents; choice). It stays on the Academy host because it is tied to a lesson and a payment. Its header and footer
follow the same rule as the other forms (header stays, footer removed on this page).

### Publishing
Owner action, not code: open **Forms** in admin (production, and locally at the admin dev port) once so the six
seeded forms publish. The plan's verification does this locally.

## Constraints
`AGENTS.md` applies: PBC wording, program order Academy → Worship → Production, no pills/eyebrows, semantic tokens
only in `apps/*`, pages thin, no inline script, fail closed, logs without personal data. Test economy: unit tests for
logic; one Playwright spec for the wizard flows (JS on and off, axe at 360 and 1280, a failed submit opening on the
right screen); no new screenshot baselines; the lead runs the full check once. Real browser screenshots go in
`docs/BUILD_LOG.md`.

## Research (recorded per the research-first rule; search snippets, not full-page reads)
- GOV.UK Design System, [Question pages](https://design-system.service.gov.uk/patterns/question-pages) and
  [One thing per page](https://designnotes.blog.gov.uk/2015/07/03/one-thing-per-page/): start with one question per
  page, group only when it helps; simple "Question 3 of 5" step text. → one question default, text progress.
- Accessible wizard guidance ([Visa](https://design.visa.com/patterns/wizard/accessibility/),
  [Trimble](https://modus.trimble.com/components/web/wizard/accessibility)): move focus to the new step's heading,
  announce "Step n of N" in a polite live region, `aria-current="step"`, text not colour alone, keep data when going
  back, link errors with `aria-describedby`.
- Progressive enhancement ([Formspree on fieldsets](https://formspree.io/blog/html-fieldset/),
  [formwizard](https://github.com/smohadjer/formwizard),
  [Smashing, multistep forms](https://smashingmagazine.com/2024/12/creating-effective-multistep-form-better-user-experience/)):
  steps as fieldsets, all visible without JS, validate per step. → approach A.
- Not found: history/back-button behaviour for step URLs; verify `#step-n` with popstate in a real browser.

## Left to the builder
Exact typography and spacing (follow `DESIGN.md` §11), the file-upload screen look, exact photo-to-screen
assignments within the policy above.
