/**
 * Emails sent when a form submission is stored (design 2026-11-16, Task 2.5): a receipt to the submitter
 * and a notice to staff. Both go through the outbox with one idempotency key per submission, so a
 * resubmit or retried request never sends twice.
 *
 *   const { received, staff } = await sendSubmissionEmails(db, env, { submission, form, adminUrl, now });
 *
 * The receipt never repeats the answers. The staff subject is `New {form title} #{reference}` (no names);
 * Reply-To is the submitter; the body links to the admin record. Staff mail goes to `INQUIRY_INBOX_EMAIL`;
 * when it is unset or invalid the notice is skipped (a name-only log line) and the receipt is still sent.
 * Failures are reported in the results, never thrown: the submission is already saved.
 */
import type { GamoEnv } from '@gamo/config/env';
import { PRODUCTS, type Product } from '../types/enums.ts';
import { renderFormReceived, renderFormStaffNotice } from '../email/templates.ts';
import { emailIdempotencyKey } from '../email/registry.ts';
import { isPlausibleEmail, normalizeEmail } from '../security/pii-hash.ts';
import type { SqlDatabase } from '../security/sql-database.ts';
import { sendOutboxEmail, type OutboxOptions, type OutboxResult } from '../services/email-outbox.ts';

export interface SubmissionEmailInput {
  submission: { id: string; reference: string; submitterEmail: string; submitterName?: string };
  form: { title: string; program: string };
  /** Absolute admin URL of the submission, e.g. `siteUrl('admin', '/submissions/{id}')`. */
  adminUrl: string;
  /** Epoch seconds. */
  now: number;
}

export interface SubmissionEmailResults {
  received: OutboxResult;
  staff: OutboxResult | 'skipped';
}

const RELATED_TYPE = 'form_submission';

function productOf(program: string): Product | undefined {
  return (PRODUCTS as readonly string[]).includes(program) ? (program as Product) : undefined;
}

export async function sendSubmissionEmails(
  db: SqlDatabase,
  env: GamoEnv,
  input: SubmissionEmailInput,
  options: OutboxOptions = {},
): Promise<SubmissionEmailResults> {
  const { submission, form, adminUrl, now } = input;
  const product = productOf(form.program);

  const receipt = renderFormReceived({
    reference: submission.reference,
    formTitle: form.title,
    program: form.program,
    submitterName: submission.submitterName,
  });
  const received = await sendOutboxEmail(
    db,
    env,
    {
      kind: 'form_received',
      idempotencyKey: emailIdempotencyKey('form_received', submission.id),
      to: submission.submitterEmail,
      subject: receipt.subject,
      text: receipt.text,
      html: receipt.html,
      relatedType: RELATED_TYPE,
      relatedId: submission.id,
      product,
      now,
    },
    options,
  );

  const inbox = (env as GamoEnv & { INQUIRY_INBOX_EMAIL?: string }).INQUIRY_INBOX_EMAIL?.trim();
  if (!inbox) {
    console.warn('[form-emails] form_staff_notice skipped: INQUIRY_INBOX_EMAIL is not set');
    return { received, staff: 'skipped' };
  }
  const to = normalizeEmail(inbox);
  if (!isPlausibleEmail(to)) {
    console.warn('[form-emails] form_staff_notice skipped: INQUIRY_INBOX_EMAIL is not a valid address');
    return { received, staff: 'skipped' };
  }
  const notice = renderFormStaffNotice({
    reference: submission.reference,
    formTitle: form.title,
    program: form.program,
    adminUrl,
    submitterEmail: normalizeEmail(submission.submitterEmail),
    submitterName: submission.submitterName,
  });
  const staff = await sendOutboxEmail(
    db,
    env,
    {
      kind: 'form_staff_notice',
      idempotencyKey: emailIdempotencyKey('form_staff_notice', submission.id),
      to,
      subject: notice.subject,
      text: notice.text,
      html: notice.html,
      replyTo: notice.replyTo,
      relatedType: RELATED_TYPE,
      relatedId: submission.id,
      product: 'admin',
      now,
    },
    options,
  );
  return { received, staff };
}
