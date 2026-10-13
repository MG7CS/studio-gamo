import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import {
  LiveService,
  registerAttendeeSchema,
  jsonResponse,
  errorResponse,
  handleApiError,
} from '@gamo/domain';
import { createResendClient } from '@studio-gamo/integrations';

export const prerender = false;

/**
 * POST /api/events/[id]/register — Registers an attendee for a free Christian event.
 *
 * Requirements:
 * 1. Validates input schema (attendeeName, attendeeEmail, quantity).
 * 2. Enforces event is in `approved` status.
 * 3. Prevents duplicate registration for the same email/event.
 * 4. Records registration in D1 with cryptographically secure QR admission token.
 * 5. Dispatches transactional confirmation email via Resend (with safe test/mock fallback).
 */
export const POST: APIRoute = async (context) => {
  try {
    const eventId = context.params.id;
    if (!eventId) {
      return errorResponse('BAD_REQUEST', 'Event identifier is required.', 400);
    }

    const runtimeEnv = (context.locals as Record<string, any>)?.runtime?.env ?? {};
    const db = getDb(runtimeEnv.DB);
    const liveService = new LiveService(db);

    const body = await context.request.json().catch(() => ({}));
    const validated = registerAttendeeSchema.parse(body);

    // 1. Process free registration in D1
    const { registration, event, isDuplicate } = await liveService.registerFreeAttendee(
      eventId,
      validated
    );

    // 2. Dispatch confirmation email via Resend client
    const resendApiKey =
      runtimeEnv.RESEND_API_KEY ||
      import.meta.env?.RESEND_API_KEY ||
      (globalThis as Record<string, any>).process?.env?.RESEND_API_KEY;

    const emailClient = createResendClient({ apiKey: resendApiKey });

    if (!isDuplicate) {
      const emailResult = await emailClient.send({
        to: registration.attendeeEmail,
        subject: `Your Registration: ${event.title}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1A1A18;">
            <h1 style="color: #8F432A; font-size: 24px;">Registration Confirmed</h1>
            <p>Dear ${registration.attendeeName},</p>
            <p>We are delighted to confirm your registration for <strong>${event.title}</strong>.</p>
            <div style="background-color: #F4EDE3; padding: 16px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Venue:</strong> ${event.venueName}, ${event.city}, ${event.state}</p>
              <p><strong>Date & Time:</strong> ${new Date(event.startsAt).toLocaleDateString()} (${event.timezone})</p>
              <p><strong>Headcount:</strong> ${registration.quantity} attendee(s)</p>
              <p><strong>Admission Token:</strong> <code style="background: #E8E2D9; padding: 2px 6px; border-radius: 4px;">${registration.qrToken}</code></p>
            </div>
            <p style="color: #706E6B; font-size: 14px;">Please present your admission token or digital confirmation upon arrival.</p>
            <hr style="border: none; border-top: 1px solid #E8E2D9; margin: 24px 0;" />
            <p style="color: #A39E98; font-size: 12px;">Gamo Studios · Serving Christian gatherings nationwide</p>
          </div>
        `,
      });

      console.log(
        `[Live Registration Email] Dispatched to ${registration.attendeeEmail} (ID: ${emailResult.id}, Mock: ${emailResult.mock})`
      );
    }

    return jsonResponse(
      {
        registration,
        isDuplicate,
        message: isDuplicate
          ? 'You are already registered for this event. Your existing pass remains active.'
          : 'Registration confirmed. A confirmation receipt has been sent to your email.',
      },
      isDuplicate ? 200 : 201
    );
  } catch (err) {
    return handleApiError(err);
  }
};
