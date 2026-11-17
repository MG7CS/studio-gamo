/**
 * The submissions area's notice table: `?notice=<key>` after a form post becomes a short banner on the next
 * page. Keys are ours and match `see()`'s `/^[a-z0-9-]{1,40}$/` (hyphens, no underscores); texts say what
 * happened and what to do. Nothing the staff member typed, no ids, no names and no error messages from the
 * domain ever appear in them.
 */
import { FormsError } from '@gamo/domain/forms';
import { WorshipError } from '@gamo/domain/worship';
import type { Notice } from '../flash.ts';

export const SUBMISSION_NOTICES: Record<string, Notice> = {
  'status-changed': { kind: 'ok', text: 'Status updated.' },
  'status-unchanged': { kind: 'ok', text: 'The status was already set. Nothing changed.' },
  'note-added': { kind: 'ok', text: 'Note added.' },
  approved: { kind: 'ok', text: 'Application approved and added to the private roster.' },
  declined: { kind: 'ok', text: 'Application declined. Uploaded files are kept for 90 days, then removed.' },
  'declined-files-pending': {
    kind: 'ok',
    text: 'Application declined, but its uploaded files could not be moved yet. Decline again to retry the move.',
  },
  'already-decided': { kind: 'ok', text: 'This application was already decided. Nothing changed.' },
  'bulk-done': { kind: 'ok', text: 'The selected submissions were updated.' },
  'bulk-partial': {
    kind: 'ok',
    text: 'The selected submissions were updated. Decided applications were left as they are.',
  },
  'bulk-none': { kind: 'error', text: 'Select at least one submission first.' },
  'bulk-bad-action': { kind: 'error', text: 'Choose an action from the list first.' },
  'bulk-too-many': {
    kind: 'error',
    text: 'Too many submissions were selected at once. Select fewer and try again.',
  },
  'export-needs-form': { kind: 'error', text: 'Choose a form before exporting its submissions.' },
  invalid: { kind: 'error', text: 'That could not be saved. Check the details and try again.' },
  'not-found': { kind: 'error', text: 'That submission was not found.' },
  'not-application': {
    kind: 'error',
    text: 'Only musician and technician applications can be approved or declined.',
  },
  state: { kind: 'error', text: 'That is not possible for the submission in its current status.' },
  incomplete: {
    kind: 'error',
    text: 'The application is missing a name, a valid email or a role, so it cannot join the roster.',
  },
  forbidden: { kind: 'error', text: 'You are not allowed to do that.' },
  error: { kind: 'error', text: 'Something went wrong. Nothing was changed.' },
};

/** Notice key for any error thrown by a submissions action (never reflects the error message). */
export function submissionNoticeKey(err: unknown): string {
  if (err instanceof FormsError) {
    switch (err.code) {
      case 'NOT_FOUND':
      case 'VERSION_NOT_FOUND':
        return 'not-found';
      case 'INVALID_INPUT':
        return 'invalid';
      case 'INVALID_TRANSITION':
        return 'not-application';
      default:
        return 'state';
    }
  }
  if (err instanceof WorshipError) {
    switch (err.code) {
      case 'NOT_FOUND':
        return 'not-found';
      case 'NOT_AN_APPLICATION':
        return 'not-application';
      case 'INVALID_INPUT':
        return 'incomplete';
      default:
        return 'state';
    }
  }
  return 'error';
}
