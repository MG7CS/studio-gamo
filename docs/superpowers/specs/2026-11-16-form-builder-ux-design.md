# Admin form builder, submissions inbox and admin screens — design (2026-11-16)

Research-first record (rule in `AGENTS.md`). Sources are listed at the end; claims not verified in the research pass are marked (unverified) and must be tested before they are relied on.

## Decisions

1. **Builder layout: outline plus one open editor, driven by `?q=<questionId>`.** The server renders every question as a compact card (number, type, label, Required, "Shown if…", bound field). Only the selected question shows its full settings. Two columns on wide screens, one on mobile. Matches Google Forms and SurveyJS and needs no JavaScript.
2. **One form per action.** One "Save question" form for the open question; separate small forms for move up, move down, move to position, duplicate, delete, add. Never nest forms; attach buttons elsewhere with `form="id"`. The primary Save is first in DOM order, because Enter in a text field fires the first submit button.
3. **Conditional visibility as a plain sentence.** "Show this question only if [earlier question] [is / is not / is one of / is answered] [value]", with "all / any" for several rules (at most 10). Sources are earlier questions only (no forward references or cycles). A section can carry the same rule and its questions inherit it. A summary line and a Logic overview page list every rule. No Google-style go-to-section routing.
4. **Draft versus immutable versions.** The draft has an integer `revision`. Publishing snapshots the draft into a new `form_versions` row with author, time, change note and content hash. The public form renders the latest published version; every submission stores its version and always renders with that version's labels. The publish page shows a plain-English diff and a checklist; restore creates a new draft from an old version.
5. **Preview uses the public renderer**, labelled "Preview: nothing is saved", noindex and behind staff auth, with "show all questions" and "test logic" modes.
6. **Reorder without dragging (WCAG 2.5.7):** Move up / Move down buttons and a "Move to position" select. Drag, if ever added, is an enhancement only. After a move, focus returns to the moved question and a status message announces it.
7. **Optimistic concurrency.** Every save carries `revision`; `UPDATE … WHERE id=? AND revision=?`; zero changes means another staff member saved first, so re-render with 409, keep the submitted values, and say who changed it and when. An integer revision, not `updated_at`.
8. **Idempotent writes with post-redirect-get.** Every POST answers `303` with a query and fragment. Delete, move-to-position and status-set are naturally idempotent; add and duplicate carry a per-render `op_id` stored with a unique constraint. Publish carries `expected_revision`.
9. **Validation presets first** (email, phone, number range, length, URL, postal code). A constrained custom pattern stays for Google Forms parity (≤100 characters; no nested quantifiers, backreferences or lookarounds; the tested value capped at 500 characters).
10. **Staff-authored text is plain text.** No raw HTML or rich text; Astro escapes by default; never `set:html`. Links only `https:` (no credentials, ≤2048 characters).
11. **Size limits enforced on the server (reject, do not truncate):** label 200, help 500, option label 150, options per question 100, grid rows and columns 20 each, questions per form 100, sections 20, serialized form 256 KB, show-if rules per question 10, version note 500.
12. **Submissions inbox:** link-addressable GET filters (form, version, status, date range, has attachments, name/email search); statuses new, in review, handled, spam, archived (plus approved/declined for applications); history and internal notes append-only; bulk actions on selected rows of the current page with a confirmation page for destructive ones; keyset pagination; per-form retention with a visible "will be deleted on" date and a scheduled purge.
13. **Safe CSV export:** staff only, same-origin POST, audit-logged; quote every field, double internal quotes, prefix cells starting with `= + - @`, tab, CR, LF (and full-width variants) with `'` except values the server validated as numbers; send `Content-Disposition: attachment` and `nosniff`.
14. **Attachments:** served only through a staff-authorized handler; PDFs and other files download-only; images inline from the handler; video with `controls` and `preload="none"` and Range support; response headers `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`.

## Screens

- **Forms list:** captioned table (name, public URL, status chip: draft only / published vN / draft changes pending, last edited, submissions, actions). Archive is reversible; hard delete only on a confirmation page.
- **Builder `/forms/:id/edit?q=:qid`:** header (title, status chip, Preview, Publish, Version history); tabs as links (Questions, Logic overview, Settings, Responses); outline of sections (h2) with question cards; a "+ Add question" `<details>` per section with type buttons grouped Text, Choice, Scale, Grid, Date/time, Content; editor panel (label, help, type with a warning that changing it can discard options, required, options editor, validation, show-if, bind to system field with already-bound fields shown, save, duplicate, delete).
- **Publish page:** checklist (each failure links to the question), diff summary, change note, "Publish version N".
- **Submission detail:** `<dl>` grouped by section from the version snapshot, bound fields first as Contact and Request cards, attachments card, append-only notes, status history, previous/next within the filter.
- **Roster:** table with filters (role, city, status); a musician application reaches the roster only through a review screen ("Apply to roster"), never automatically.
- **Request matching:** inbox-style list; per needed role a panel of candidates filtered by role and city; ranking never uses anything commercial (payment or sponsorship never affects vetting or order).
- **Invoices:** table (number, client, issued, due, total, status). Musician pay and any Gamo administrative allocation are separate line items. Stripe stays in test mode.

## Accessibility checklist (ATAG 2.0 and WCAG 2.2 AA)

Reorder without dragging; every action by keyboard with no traps and no custom arrow-key widgets; unique accessible names ("Move up: Phone number") that contain the visible text; focus stays on the moved question and a `role="status"` message announces it, errors use `role="alert"`, and focus also moves to the message on load (test with NVDA, JAWS and VoiceOver); error summary with linked fields, `aria-invalid` and `aria-describedby`; visible labels and fieldset/legend groups; focus never obscured by sticky bars (`scroll-margin-top`); 44 px targets; no change of context on input (type select needs an explicit Apply); destructive actions confirmed or undoable; unsaved values preserved if the session expires; accessible preview; publish checklist prompts for empty or duplicate labels, choice questions with fewer than two options, grids without row or column labels, generic link text, unlabelled "Other", two questions bound to one system field (redundant entry); table captions and row-checkbox names; no colour-only status; no horizontal scroll at 360 px.

## Pitfalls to design against

Nested forms are invalid; Enter fires the first submit button; changing a question type destroys type data; deleting a question that others reference leaves dangling show-if or binds (block and list dependents); editing a published form must never change how old submissions render; hidden-by-logic questions must not be required; two staff overwriting each other; double submits; live regions injected at load are often not announced; client validation is never the authority; `Content-Type` and file extension are attacker-controlled; CSV prefixing mangles negative numbers if applied to trusted numerics.

## Sources

- WCAG 2.5.7 dragging movements: https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
- ATAG 2.0: https://www.w3.org/TR/ATAG20/
- WCAG 4.1.3 status messages: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
- GitHub, accessible sortable list: https://github.blog/engineering/exploring-the-challenges-in-creating-an-accessible-sortable-list-drag-and-drop/
- Tally conditional logic: https://tally.so/help/conditional-form-logic
- Google Forms branching and validation: https://support.google.com/docs/answer/141062?hl=en, https://support.google.com/docs/answer/3378864
- SurveyJS Creator logic and preview: https://surveyjs.io/survey-creator/documentation/end-user-guide/form-display-logic
- Typeform logic: https://www.typeform.com/developers/create/logic-jumps/
- Jotform conditions: https://www.jotform.com/help/316-how-to-show-or-hide-fields-base-on-user-s-answer
- Formstack logic: https://help.formstack.com/hc/articles/44592316217619
- HTTP 412 and optimistic concurrency: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/412
- OWASP CSV injection: https://community.owasp.org/attacks/CSV_Injection
- OWASP file upload: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html

## Unverified (test before relying)

Live-region politeness (polite versus assertive); fragment-navigation focus across browsers; D1 `meta.changes` field name and row-size limit; ReDoS-safe regex options on Workers; Excel UTF-8 BOM; image re-encoding cost on Workers; malware-scanning options on the platform (if none, keep PDFs and Office files download-only and say so in the owner actions).
