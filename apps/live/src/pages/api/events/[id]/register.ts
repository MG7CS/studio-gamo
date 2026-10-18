import { readContract } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import {
  LiveService,
  NotificationService,
  registerAttendeeSchema,
  jsonResponse,
  errorResponse,
  handleApiError,
  getRuntimeEnv,
} from '@gamo/domain';

export const prerender = false;

/**
 * POST /api/events/[id]/register — Registers an attendee for a free Christian event.
 *
 * Requirements:
 * 1. Validates input schema (attendeeName, attendeeEmail, quantity).
 * 2. Enforces event is in `approved` status.
 * 3. Prevents duplicate registration for the same email/event.
 * 4. Records registration in D1 with cryptographically secure QR admission token and durable notification_jobs row.
 * 5. Processes the queued notification_jobs entry via NotificationService (with HTML escaping and retry backoff).
 */
export const POST: APIRoute = async (context) => {
  try {
    const eventId = context.params.id;
    if (!eventId) {
      return errorResponse('BAD_REQUEST', 'Event identifier is required.', 400);
    }

    const runtimeEnv = await getRuntimeEnv(context);
    const db = getDb(runtimeEnv.DB);
    const liveService = new LiveService(db);

    const body = await readContract(context.request, 'RegisterAttendee');
    const validated = registerAttendeeSchema.parse(body);

    // 1. Process free registration in D1 (trigger atomically reserves capacity and inserts notification_jobs row)
    const { registration, isDuplicate } = await liveService.registerFreeAttendee(eventId, validated);

    let message = 'Registration request received.';
    if (!isDuplicate) {
      const notificationService = new NotificationService(db, {
        apiKey: runtimeEnv.RESEND_API_KEY,
        defaultFrom: runtimeEnv.EMAIL_FROM,
        allowMock: runtimeEnv.ENVIRONMENT === 'local',
      });
      const jobOutcome = await notificationService.processRegistrationJob(registration.id);
      message =
        jobOutcome?.status === 'sent'
          ? 'Registration confirmed and confirmation notification processed.'
          : 'Registration confirmed. Confirmation notification is queued for retry.';
    }

    return jsonResponse(
      {
        isDuplicate,
        message,
      },
      isDuplicate ? 200 : 201,
    );
  } catch (err) {
    return handleApiError(err);
  }
};
