/**
 * Plain-text emails for verifying a Gamo Live organization through a meeting with Gamo (docs/LIVE_REQUIREMENTS.md §8
 * item 33, docs/LIVE_SCREENS.md §I "Meeting scheduled / held / organization verified / declined"). Written like
 * `mail.ts`: the organization's name comes from organizers and is cleaned with `cleanEmailText`; the meeting link or
 * place and the admin's notes are Gamo's own words, so links in them stay, but control characters never do.
 */
import { cleanEmailText, type LiveEmail } from './mail.ts';
import type { MeetingFormat } from './paid-types.ts';

const NAME_MAX = 120;
// Control characters, line/paragraph separators, zero-width and bidi-override characters (as in mail.ts).
const INVISIBLE =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2069\ufeff]/g;

const addressOf = (to: string) =>
  String(to)
    .replace(INVISIBLE, '')
    .replace(/[\s,;<>]/g, '');

/** Gamo's own text (a note, a meeting link or place): kept as written, minus invisible characters. */
function trusted(value: string | null | undefined, max: number, multiline = true): string {
  let text = String(value ?? '').replace(/\r\n?/g, '\n');
  text = multiline ? text : text.replace(/\n+/g, ' ');
  return text.replace(INVISIBLE, '').trim().slice(0, max);
}

const footer =
  '\n\nGamo Live · live.gamostudio.org\nQuestions? Reply to this email or write to hello@gamostudio.org.';

export interface MeetingDetails {
  startsAt: number;
  timeZone: string;
  format: MeetingFormat;
  location: string;
  note: string | null;
}

/** "Tuesday, November 10, 2026, 3:00 PM MST" in the meeting's own zone. */
export function meetingWhenLabel(startsAt: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(startsAt * 1000));
}

export const MEETING_FORMAT_LABELS: Record<MeetingFormat, string> = {
  video: 'Video call',
  in_person: 'In person',
};

function meetingLines(m: MeetingDetails): string {
  const where = trusted(m.location, 300, false);
  const note = trusted(m.note, 500);
  return (
    `When: ${meetingWhenLabel(m.startsAt, m.timeZone)} (${m.timeZone})\n` +
    `How: ${MEETING_FORMAT_LABELS[m.format]}\n` +
    `${m.format === 'video' ? 'Link' : 'Place'}: ${where}` +
    (note ? `\n\nNote from Gamo:\n${note}` : '')
  );
}

export function verificationRequestedEmail(to: string, rawOrganizationName: string): LiveEmail {
  const org = cleanEmailText(rawOrganizationName, NAME_MAX);
  return {
    to: addressOf(to),
    subject: `Verification requested: ${org}`,
    text:
      `We received the request to verify ${org} on Gamo Live.\n\n` +
      'Gamo verifies every organization through a short meeting (video call or in person). ' +
      'We will email you the date, time and link or place once the meeting is scheduled.' +
      footer,
  };
}

export function meetingScheduledEmail(
  to: string,
  rawOrganizationName: string,
  meeting: MeetingDetails,
  options: { rescheduled?: boolean } = {},
): LiveEmail {
  const org = cleanEmailText(rawOrganizationName, NAME_MAX);
  return {
    to: addressOf(to),
    subject: `${options.rescheduled ? 'Verification meeting rescheduled' : 'Verification meeting scheduled'}: ${org}`,
    text:
      `${options.rescheduled ? 'Your verification meeting with Gamo has a new time' : 'Your verification meeting with Gamo is scheduled'} for ${org}.\n\n` +
      meetingLines(meeting) +
      '\n\nIf this time does not work, reply to this email and we will find another one.' +
      footer,
  };
}

export function meetingCanceledEmail(
  to: string,
  rawOrganizationName: string,
  note: string | null,
): LiveEmail {
  const org = cleanEmailText(rawOrganizationName, NAME_MAX);
  const text = trusted(note, 2000);
  return {
    to: addressOf(to),
    subject: `Verification meeting canceled: ${org}`,
    text:
      `The verification meeting for ${org} is canceled. Your request stays open; Gamo will email you a new time.` +
      (text ? `\n\nNote from Gamo:\n${text}` : '') +
      footer,
  };
}

export function meetingHeldEmail(to: string, rawOrganizationName: string): LiveEmail {
  const org = cleanEmailText(rawOrganizationName, NAME_MAX);
  return {
    to: addressOf(to),
    subject: `Thank you for meeting with Gamo: ${org}`,
    text:
      `Thank you for meeting with Gamo about ${org}. Gamo will now decide on the verification and email you the result.` +
      footer,
  };
}

export function organizationVerifiedEmail(to: string, rawOrganizationName: string, note: string): LiveEmail {
  const org = cleanEmailText(rawOrganizationName, NAME_MAX);
  const text = trusted(note, 2000);
  return {
    to: addressOf(to),
    subject: `${org} is verified on Gamo Live`,
    text:
      `Gamo verified ${org} after your meeting. Your organization page and events now show the Verified label.` +
      (text ? `\n\nNote from Gamo:\n${text}` : '') +
      footer,
  };
}

export function verificationDeclinedEmail(to: string, rawOrganizationName: string, note: string): LiveEmail {
  const org = cleanEmailText(rawOrganizationName, NAME_MAX);
  const text = trusted(note, 2000);
  return {
    to: addressOf(to),
    subject: `Verification not approved: ${org}`,
    text:
      `Gamo could not verify ${org} at this time. You can request verification again from your organization page.` +
      (text ? `\n\nNote from Gamo:\n${text}` : '') +
      footer,
  };
}
