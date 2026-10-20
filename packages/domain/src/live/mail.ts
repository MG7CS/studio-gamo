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

// Control characters, line/paragraph separators, zero-width and bidi-override characters.
const INVISIBLE =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2069\ufeff]/g;
/** Any `scheme://`, `www.` and common bare web addresses: attacker text must not become a clickable link. */
const URL_SCHEME = /\b(?:[a-z][a-z0-9+.-]{1,15}:\/\/|(?:mailto|javascript):)/gi;
const WWW = /\bwww\./gi;
const BARE_DOMAIN =
  /\b([a-z0-9][a-z0-9-]*)\.(com|org|net|edu|gov|io|co|me|app|dev|xyz|info|biz|us|ly|gl|link|click|top|site|online|ru|cn|tk|ml|ga|cf|gq)\b/gi;

/**
 * Makes a person-supplied string safe to put into an email subject or body: control, bidi and zero-width
 * characters are removed (so it cannot break a header or hide text), line breaks become spaces (unless
 * `multiline`, for an organizer's message or an admin note, where single newlines are kept), and web
 * addresses are neutralized: the scheme and `www.` are dropped and `name.com` becomes `name dot com`, so
 * Gamo mail cannot be used to deliver a clickable attacker link. Trimmed and cut to `max` characters.
 */
export function cleanEmailText(
  value: string | null | undefined,
  max: number,
  options: { multiline?: boolean } = {},
): string {
  let text = String(value ?? '').normalize('NFKC');
  text = options.multiline
    ? text.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ')
    : // eslint-disable-next-line no-control-regex
      text.replace(/[\r\n\t\u000b\u000c\u0085]+/g, ' ');
  text = text.replace(INVISIBLE, '');
  if (options.multiline) text = text.replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n');
  else text = text.replace(/\s+/g, ' ');
  text = text.replace(URL_SCHEME, '').replace(WWW, '').replace(BARE_DOMAIN, '$1 dot $2');
  text = text.trim();
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…` : text;
}

const NAME_MAX = 120;
const TITLE_MAX = 160;
const LABEL_MAX = 240;
const MESSAGE_MAX = 1000;

/** The address passed to the mail API: only control characters removed (it was validated at sign-up). */
const addressOf = (to: string) =>
  String(to)
    .replace(INVISIBLE, '')
    .replace(/[\s,;<>]/g, '');

const safeEvent = (e: WhenWhere): WhenWhere => ({
  title: cleanEmailText(e.title, TITLE_MAX),
  whenLabel: cleanEmailText(e.whenLabel, LABEL_MAX),
  venueLabel: cleanEmailText(e.venueLabel, LABEL_MAX),
});

const footer =
  '\n\nGamo Live · live.gamostudio.org\nQuestions? Reply to this email or write to hello@gamostudio.org.';

export function codeEmail(to: string, rawName: string, code: string, rawEvent: WhenWhere): LiveEmail {
  const name = cleanEmailText(rawName, NAME_MAX);
  const e = safeEvent(rawEvent);
  return {
    to: addressOf(to),
    subject: `Your Gamo Live code: ${cleanEmailText(code, 12)}`,
    text:
      `Hi ${name},\n\nYour 6-digit code to confirm your registration for ${e.title} is:\n\n    ${code}\n\n` +
      `${e.whenLabel}\n${e.venueLabel}\n\nThe code works for 10 minutes. If you did not ask for it, you can ignore this email; nothing is reserved until the code is entered.` +
      footer,
  };
}

export function confirmationEmail(
  to: string,
  rawName: string,
  partySize: number,
  rawEvent: WhenWhere,
  manageUrl: string,
  rawCheckinCode: string | null,
): LiveEmail {
  const name = cleanEmailText(rawName, NAME_MAX);
  const e = safeEvent(rawEvent);
  const checkinCode = rawCheckinCode ? cleanEmailText(rawCheckinCode, 24) : null;
  return {
    to: addressOf(to),
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

export function canceledEmail(to: string, rawName: string, rawEvent: WhenWhere): LiveEmail {
  const name = cleanEmailText(rawName, NAME_MAX);
  const e = safeEvent(rawEvent);
  return {
    to: addressOf(to),
    subject: `Registration canceled: ${e.title}`,
    text:
      `Hi ${name},\n\nYour registration for ${e.title} (${e.whenLabel}) is canceled and your seats are released.` +
      footer,
  };
}

export function invitationEmail(
  to: string,
  rawOrganizationName: string,
  rawInviterName: string,
  acceptUrl: string,
): LiveEmail {
  const organizationName = cleanEmailText(rawOrganizationName, NAME_MAX);
  const inviterName = cleanEmailText(rawInviterName, NAME_MAX);
  return {
    to: addressOf(to),
    subject: `${inviterName} invited you to ${organizationName} on Gamo Live`,
    text:
      `${inviterName} invited you to help manage events for ${organizationName} on Gamo Live.\n\n` +
      `Open this link, sign in with this email address (${addressOf(to)}) and accept the invitation:\n${acceptUrl}\n\n` +
      `The link works for 7 days. If you do not know ${inviterName}, ignore this email.` +
      footer,
  };
}

export function eventCanceledEmail(
  to: string,
  rawName: string,
  rawEvent: { title: string; whenLabel: string; organizationName: string },
  rawMessage: string,
): LiveEmail {
  const name = cleanEmailText(rawName, NAME_MAX);
  const e = {
    title: cleanEmailText(rawEvent.title, TITLE_MAX),
    whenLabel: cleanEmailText(rawEvent.whenLabel, LABEL_MAX),
    organizationName: cleanEmailText(rawEvent.organizationName, NAME_MAX),
  };
  const message = cleanEmailText(rawMessage, MESSAGE_MAX, { multiline: true });
  return {
    to: addressOf(to),
    subject: `Canceled: ${e.title}`,
    text:
      `Hi ${name},\n\n${e.organizationName} canceled ${e.title} (${e.whenLabel}). Your registration is canceled and nothing more is needed from you.` +
      (message
        ? `\n\nA message from the organizer (written by the organizer, not by Gamo):\n${message}`
        : '') +
      footer,
  };
}

export function eventDecisionEmail(
  to: string,
  raw: {
    title: string;
    decision: 'approved' | 'changes_requested' | 'rejected';
    note: string;
    eventUrl: string;
    manageUrl: string;
  },
): LiveEmail {
  // The admin note is trusted (Gamo wrote it), so links in it stay; control characters never do.
  const e = {
    ...raw,
    title: cleanEmailText(raw.title, TITLE_MAX),
    note: String(raw.note ?? '')
      .replace(/\r\n?/g, '\n')
      .replace(INVISIBLE, '')
      .trim()
      .slice(0, 2000),
  };
  const headline =
    e.decision === 'approved'
      ? `Your event is approved and published: ${e.title}`
      : e.decision === 'changes_requested'
        ? `Changes requested for your event: ${e.title}`
        : `Your event was not approved: ${e.title}`;
  const body =
    e.decision === 'approved'
      ? `Gamo reviewed ${e.title} and it is now on Gamo Live:\n${e.eventUrl}`
      : e.decision === 'changes_requested'
        ? `Gamo reviewed ${e.title} and asks for changes before it can be published. Edit the event and submit it again:\n${e.manageUrl}`
        : `Gamo reviewed ${e.title} and could not approve it. You can edit it and submit it again:\n${e.manageUrl}`;
  return {
    to: addressOf(to),
    subject: headline,
    text: `${body}${e.note ? `\n\nNote from Gamo:\n${e.note}` : ''}${footer}`,
  };
}
