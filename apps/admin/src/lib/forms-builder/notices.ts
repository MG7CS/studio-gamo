/**
 * The form builder's notice table: `?notice=<key>` after a redirect becomes a short banner. Keys are ours
 * and the texts are fixed; nothing from the request is ever copied into one (labels, ids and input appear
 * only in the page itself, where Astro escapes them).
 */
import { defaultFormSeeds } from '@gamo/domain/forms';
import type { Notice } from '../flash';

/** "Added N forms." for each count the default forms can reach (fixed texts, keyed by the count). */
const DEFAULTS_ADDED: Record<string, Notice> = Object.fromEntries(
  Array.from({ length: defaultFormSeeds().length }, (_, i) => [
    `defaults-added-${i + 1}`,
    { kind: 'ok', text: `Added ${i + 1} ${i === 0 ? 'form' : 'forms'}.` } satisfies Notice,
  ]),
);

export const FORM_NOTICES: Record<string, Notice> = {
  ...DEFAULTS_ADDED,
  'defaults-none': { kind: 'ok', text: 'All default forms are already there.' },
  created: { kind: 'ok', text: 'Form created as a draft. Add your questions, then publish it.' },
  saved: { kind: 'ok', text: 'Question saved to the draft. It is not public until you publish.' },
  added: { kind: 'ok', text: 'Question added to the draft. Edit it below.' },
  moved: { kind: 'ok', text: 'Question moved.' },
  'move-none': { kind: 'ok', text: 'The question is already in that position.' },
  duplicated: { kind: 'ok', text: 'Question duplicated. Edit the copy below.' },
  deleted: { kind: 'ok', text: 'Question deleted from the draft.' },
  'type-changed': { kind: 'ok', text: 'Question type changed.' },
  'section-added': { kind: 'ok', text: 'Section added.' },
  'section-saved': { kind: 'ok', text: 'Section saved.' },
  'section-deleted': { kind: 'ok', text: 'Section deleted.' },
  'settings-saved': { kind: 'ok', text: 'Form settings saved.' },
  published: { kind: 'ok', text: 'Published. The public form now uses this version.' },
  'publish-same': {
    kind: 'ok',
    text: 'Nothing changed since the last published version, so no new version was made.',
  },
  restored: { kind: 'ok', text: 'Version restored to the draft. Review it, then publish when ready.' },
  closed: { kind: 'ok', text: 'The form is closed and no longer accepts submissions.' },
  reopened: { kind: 'ok', text: 'The form accepts submissions again.' },
  conflict: {
    kind: 'error',
    text: 'Someone else changed this at the same time, or that web address is taken. Nothing was overwritten.',
  },
  invalid: { kind: 'error', text: 'That could not be saved. Check the highlighted fields and try again.' },
  'not-found': { kind: 'error', text: 'That form, question or version was not found.' },
  blocked: { kind: 'error', text: 'That is not possible right now.' },
  'move-blocked': {
    kind: 'error',
    text: 'The question was not moved because another question depends on its position.',
  },
  'delete-blocked': {
    kind: 'error',
    text: 'The question was not deleted because other questions depend on it.',
  },
  unavailable: { kind: 'error', text: 'That is not available right now. Try again in a moment.' },
};
