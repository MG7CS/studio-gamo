/**
 * Transactional Notification & Outbox Consumer Service
 *
 * Processes durable `notification_jobs` queued by D1 registration triggers
 * and dispatches verification challenge emails via Resend (with safe local/preview mock fallback).
 * Strictly HTML-escapes all untrusted attendee and event fields before rendering email templates.
 */

import { eq, and, lt, or, isNull, lte, asc } from 'drizzle-orm';
import { notificationJobs, eventRegistrations, events, type GamoDatabase } from '@gamo/db';
import { createResendClient, type ResendConfig } from '@studio-gamo/integrations/resend';
import { getPlatformBrandConfig } from '../brand.ts';

const MAX_NOTIFICATION_ATTEMPTS = 5;

/**
 * Escapes HTML special characters to prevent HTML/script injection in transactional emails.
 */
export function escapeHtml(input: string | null | undefined): string {
  if (!input) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ProcessNotificationResult {
  jobId: string;
  registrationId: string;
  status: 'sent' | 'pending' | 'failed';
  attempts: number;
  providerMessageId: string | null;
  mock: boolean;
  error?: string;
}

export class NotificationService {
  db: GamoDatabase;
  resendConfig?: ResendConfig;

  constructor(db: GamoDatabase, resendConfig?: ResendConfig) {
    this.db = db;
    this.resendConfig = resendConfig;
  }

  /**
   * Dispatches a 6-digit email verification code for account sign-in.
   */
  async sendVerificationChallengeEmail(params: {
    email: string;
    code: string;
    expiresAt: Date;
  }): Promise<{ sent: boolean; deliveryStatus: 'sent' | 'simulated'; messageId?: string; error?: string }> {
    const client = createResendClient(this.resendConfig);
    const safeCode = escapeHtml(params.code);
    const safeEmail = escapeHtml(params.email);
    const expiresMinutes = Math.max(1, Math.round((params.expiresAt.getTime() - Date.now()) / 60000));

    const html = `<!DOCTYPE html>
<html lang="en">
<body style="font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; background:#F4EDE3; color:#1A1A18; padding:24px;">
  <div style="max-width:520px; margin:0 auto; background:#FFFFFF; border:1px solid #E2DCD3; border-radius:12px; padding:28px;">
    <p style="font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:#8F432A; font-weight:600; margin:0 0 8px;">Gamo Studios · Identity Verification</p>
    <h1 style="font-size:22px; margin:0 0 12px;">Your verification code</h1>
    <p style="font-size:15px; line-height:1.5; color:#3D3B38; margin:0 0 20px;">
      Enter the 6-digit code below to verify <strong>${safeEmail}</strong>. This code expires in ${expiresMinutes} minutes.
    </p>
    <div style="background:#1A1A18; color:#F4EDE3; font-size:28px; font-weight:700; letter-spacing:0.25em; text-align:center; padding:16px; border-radius:8px; margin:0 0 20px;">
      ${safeCode}
    </div>
    <p style="font-size:12px; color:#6E6A64; margin:0;">
      If you did not request this code, you can safely ignore this message.
    </p>
  </div>
</body>
</html>`;

    const text = `Gamo Studios Verification Code: ${params.code}\n\nUse this 6-digit code to verify ${params.email}. It expires in ${expiresMinutes} minutes.`;

    const res = await client.send({
      to: params.email,
      subject: 'Your Gamo Studios verification code',
      html,
      text,
      tags: [{ name: 'category', value: 'auth_verification' }],
    });

    return {
      sent: res.success,
      deliveryStatus: res.mock ? 'simulated' : 'sent',
      messageId: res.id,
      error: res.error,
    };
  }

  /**
   * Processes a specific registration's pending notification job immediately.
   */
  async processRegistrationJob(
    registrationId: string,
    now: Date = new Date(),
  ): Promise<ProcessNotificationResult | null> {
    const [job] = await this.db
      .select()
      .from(notificationJobs)
      .where(eq(notificationJobs.registrationId, registrationId))
      .limit(1);

    if (!job) return null;
    if (job.status === 'sent') {
      return {
        jobId: job.id,
        registrationId: job.registrationId,
        status: 'sent',
        attempts: job.attempts,
        providerMessageId: job.providerMessageId ?? null,
        mock: Boolean(job.providerMessageId?.startsWith('mock_')),
      };
    }

    const [registration] = await this.db
      .select()
      .from(eventRegistrations)
      .where(eq(eventRegistrations.id, job.registrationId))
      .limit(1);
    if (!registration) return null;

    const [event] = await this.db.select().from(events).where(eq(events.id, registration.eventId)).limit(1);
    if (!event) return null;

    return this.dispatchJobRow(job, registration, event, now);
  }

  /**
   * Processes due pending outbox jobs in batch order, respecting retry backoff and max attempt limits.
   */
  async processPendingJobs(limit: number = 20, now: Date = new Date()): Promise<ProcessNotificationResult[]> {
    const jobs = await this.db
      .select()
      .from(notificationJobs)
      .where(
        and(
          eq(notificationJobs.status, 'pending'),
          lt(notificationJobs.attempts, MAX_NOTIFICATION_ATTEMPTS),
          or(isNull(notificationJobs.nextAttemptAt), lte(notificationJobs.nextAttemptAt, now)),
        ),
      )
      .orderBy(asc(notificationJobs.createdAt), asc(notificationJobs.id))
      .limit(limit);

    const results: ProcessNotificationResult[] = [];
    for (const job of jobs) {
      const [registration] = await this.db
        .select()
        .from(eventRegistrations)
        .where(eq(eventRegistrations.id, job.registrationId))
        .limit(1);
      if (!registration) continue;

      const [event] = await this.db.select().from(events).where(eq(events.id, registration.eventId)).limit(1);
      if (!event) continue;

      const outcome = await this.dispatchJobRow(job, registration, event, now);
      results.push(outcome);
    }
    return results;
  }

  private async dispatchJobRow(
    job: typeof notificationJobs.$inferSelect,
    registration: typeof eventRegistrations.$inferSelect,
    event: typeof events.$inferSelect,
    now: Date,
  ): Promise<ProcessNotificationResult> {
    const client = createResendClient(this.resendConfig);

    const safeAttendeeName = escapeHtml(registration.attendeeName);
    const safeEventTitle = escapeHtml(event.title);
    const safeVenue = escapeHtml(event.venueName);
    const safeCity = escapeHtml(event.city);
    const safeState = escapeHtml(event.state);
    const safeQrToken = escapeHtml(registration.qrToken);
    const formattedDate = escapeHtml(event.startsAt.toUTCString());

    const brand = getPlatformBrandConfig();
    const safePassHeader = escapeHtml(brand.ticketPassHeader);
    const safeDisclosure = escapeHtml(brand.operatorDisclosure);

    const html = `<!DOCTYPE html>
<html lang="en">
<body style="font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; background:#F4EDE3; color:#1A1A18; padding:24px;">
  <div style="max-width:560px; margin:0 auto; background:#FFFFFF; border:1px solid #E2DCD3; border-radius:12px; padding:28px;">
    <p style="font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:#8F432A; font-weight:600; margin:0 0 8px;">${safePassHeader}</p>
    <h1 style="font-size:22px; margin:0 0 12px;">${safeEventTitle}</h1>
    <p style="font-size:15px; line-height:1.5; color:#3D3B38; margin:0 0 16px;">
      Hello ${safeAttendeeName}, your registration (${registration.quantity} ${registration.quantity === 1 ? 'guest' : 'guests'}) is confirmed.
    </p>
    <div style="background:#F8F5F0; border:1px solid #E2DCD3; border-radius:8px; padding:16px; margin:0 0 18px; font-size:14px; line-height:1.6;">
      <div><strong>Venue:</strong> ${safeVenue} (${safeCity}, ${safeState})</div>
      <div><strong>Starts:</strong> ${formattedDate}</div>
      <div><strong>Admission Pass Token:</strong> <code>${safeQrToken}</code></div>
    </div>
    <p style="font-size:11px; line-height:1.5; color:#6E6A64; margin:0;">${safeDisclosure}</p>
  </div>
</body>
</html>`;

    const text = [
      `${brand.displayName} Registration Confirmed: ${event.title}`,
      `Attendee: ${registration.attendeeName} (${registration.quantity})`,
      `Venue: ${event.venueName}, ${event.city}, ${event.state}`,
      `Starts: ${event.startsAt.toUTCString()}`,
      `Admission Pass Token: ${registration.qrToken}`,
      ``,
      brand.operatorDisclosure,
    ].join('\n');

    const nextAttempts = job.attempts + 1;
    const sendResult = await client.send({
      to: registration.attendeeEmail,
      subject: `Registration Confirmed: ${event.title}`,
      html,
      text,
      tags: [
        { name: 'category', value: 'event_registration' },
        { name: 'event_id', value: event.id },
      ],
    });

    if (sendResult.success) {
      await this.db
        .update(notificationJobs)
        .set({
          status: 'sent',
          attempts: nextAttempts,
          sentAt: now,
          lastError: null,
          providerMessageId: sendResult.id ?? null,
        })
        .where(eq(notificationJobs.id, job.id));

      return {
        jobId: job.id,
        registrationId: registration.id,
        status: 'sent',
        attempts: nextAttempts,
        providerMessageId: sendResult.id ?? null,
        mock: Boolean(sendResult.mock),
      };
    }

    const terminalFailure = nextAttempts >= MAX_NOTIFICATION_ATTEMPTS;
    const backoffSeconds = Math.pow(2, nextAttempts) * 30;
    const nextAttemptAt = terminalFailure ? now : new Date(now.getTime() + backoffSeconds * 1000);
    const nextStatus = terminalFailure ? 'failed' : 'pending';
    const errorMsg = sendResult.error || 'Failed to dispatch confirmation email.';

    await this.db
      .update(notificationJobs)
      .set({
        status: nextStatus,
        attempts: nextAttempts,
        nextAttemptAt,
        lastError: errorMsg,
      })
      .where(eq(notificationJobs.id, job.id));

    return {
      jobId: job.id,
      registrationId: registration.id,
      status: nextStatus,
      attempts: nextAttempts,
      providerMessageId: null,
      mock: false,
      error: errorMsg,
    };
  }
}
