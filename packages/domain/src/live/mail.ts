/**
 * Plain-text emails for Gamo Live registrations. Sending fails closed: outside `ENVIRONMENT=local` a
 * missing Resend key means nothing is sent and the caller answers "unavailable". Locally the message is
 * printed to the terminal instead (the dev server's output) so the emailed code can be read.
 */
import { createResendClient } from '@studio-gamo/integrations/resend';

type Env = { ENVIRONMENT?: unknown };

export interface LiveEmail {
  to: string;
  subject: string;
  text: string;
}

export class EmailUnavailableError extends Error {
  constructor() {
    super('email_unavailable');
    this.name = 'EmailUnavailableError';
  }
}

export async function sendLiveEmail(environment: Env, email: LiveEmail): Promise<void> {
  const env = environment as Record<string, unknown>;
  const local = env.ENVIRONMENT === 'local';
  const client = createResendClient({
    apiKey: typeof env.RESEND_API_KEY === 'string' ? env.RESEND_API_KEY : undefined,
    defaultFrom: typeof env.EMAIL_FROM === 'string' ? env.EMAIL_FROM : undefined,
    allowMock: local,
  });
  const result = await client.send({ to: email.to, subject: email.subject, text: email.text });
  if (local && result.mock) {
    console.warn(`[live:email:local] to=${email.to}\nsubject: ${email.subject}\n${email.text}`);
  }
  if (!result.success) throw new EmailUnavailableError();
}

export interface WhenWhere {
  title: string;
  whenLabel: string;
  venueLabel: string;
}

const footer =
  '\n\nGamo Live · live.gamostudio.org\nQuestions? Reply to this email or write to hello@gamostudio.org.';

export function codeEmail(to: string, name: string, code: string, e: WhenWhere): LiveEmail {
  return {
    to,
    subject: `Your Gamo Live code: ${code}`,
    text:
      `Hi ${name},\n\nYour 6-digit code to confirm your registration for ${e.title} is:\n\n    ${code}\n\n` +
      `${e.whenLabel}\n${e.venueLabel}\n\nThe code works for 10 minutes. If you did not ask for it, you can ignore this email; nothing is reserved until the code is entered.` +
      footer,
  };
}

export function confirmationEmail(
  to: string,
  name: string,
  partySize: number,
  e: WhenWhere,
  manageUrl: string,
  checkinCode: string | null,
): LiveEmail {
  return {
    to,
    subject: `You're registered: ${e.title}`,
    text:
      `Hi ${name},\n\nYou're registered for ${e.title}${partySize > 1 ? ` (${partySize} people)` : ''}.\n\n` +
      `${e.whenLabel}\n${e.venueLabel}\n\n` +
      (checkinCode
        ? `Show this QR code at the door. It is on your registration page, and your check-in code is ${checkinCode}.\n\n`
        : '') +
      `View or cancel your registration:\n${manageUrl}\n\nKeep this link private: anyone with it can cancel your registration.` +
      footer,
  };
}

export function canceledEmail(to: string, name: string, e: WhenWhere): LiveEmail {
  return {
    to,
    subject: `Registration canceled: ${e.title}`,
    text:
      `Hi ${name},\n\nYour registration for ${e.title} (${e.whenLabel}) is canceled and your seats are released.` +
      footer,
  };
}
