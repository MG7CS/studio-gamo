/**
 * Pure email renderers for the forms / offers / invoices flows (design 2026-11-16, "Emails").
 * Each returns `{ subject, text, html }` (plus `replyTo` where the reply should reach a person other than
 * Gamo). They take plain input objects, never read the database, and never send; the outbox
 * (`services/email-outbox.ts`) sends them and the daily retry re-renders them through `email/registry.ts`.
 *
 * Research notes (transactional email best practice, checked 2026-11-16; vendor guides, so treat as
 * guidance, not standards):
 *   - Send a multipart message: an HTML part and a plain-text twin that says the same thing (mismatched
 *     parts are a spam signal). Both parts here are generated from one block list, so they cannot drift.
 *   - Authenticate the sending domain (SPF, DKIM, DMARC) and avoid "no-reply" senders: Reply-To is always a
 *     real mailbox (`hello@gamostudio.org` by default; the submitter for staff notices).
 *   - Keep subjects short, plain and free of ALL CAPS / exclamation marks. Subjects here carry only a
 *     reference, number, role or date, never a person's name or address: subjects are logged and shown in
 *     lock screens and notifications.
 *   - Keep sensitive data out of the body and use expiring single-use links instead.
 *   Sources:
 *   https://mailtrap.io/blog/transactional-emails-best-practices/
 *   https://postmarkapp.com/guides/troubleshooting-email-delivery
 *   https://blog.mailchannels.com/how-to-improve-transactional-email-deliverability-and-stay-out-of-the-spam-folder/
 *   https://messagegears.com/resources/blog/transactional-email-best-practices-with-examples/
 *
 * Conventions: every interpolated value is HTML-escaped; subjects are single-line; links must be http(s);
 * money is integer cents (`formatUsd`); dates and times arrive as display strings already formatted in the
 * event's timezone by the caller (this module does no timezone work). Wording is mission-first and never
 * claims nonprofit status, tax-exempt status or donations (AGENTS.md). Musician pay and any Gamo
 * administrative line are always separate line items.
 */
import { escapeHtml } from '../services/notifications.ts';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
  /** Set when replies should go to someone other than the default `hello@gamostudio.org`. */
  replyTo?: string;
}

export const GAMO_CONTACT_EMAIL = 'hello@gamostudio.org';

// ---- Payload types ---------------------------------------------------------------------------------

export interface FormReceivedPayload {
  reference: string;
  formTitle: string;
  /** `worship`, `academy`, `production`, `web`, ... (selects the signature only). */
  program: string;
  /** Used for the greeting only (first word); never echoed elsewhere. */
  submitterName?: string;
  contactEmail?: string;
}

export interface FormStaffNoticePayload {
  reference: string;
  formTitle: string;
  program: string;
  /** Absolute URL of the admin record, e.g. `siteUrl('admin', '/submissions/{id}')`. */
  adminUrl: string;
  submitterEmail: string;
  submitterName?: string;
}

export interface ApplicationDecisionPayload {
  program: string;
  recipientName?: string;
  reference?: string;
  /** Approved: an optional welcome line. Declined: an optional short staff note (the only "reason" ever shown). */
  staffNote?: string;
  contactEmail?: string;
}
export type ApplicationApprovedPayload = ApplicationDecisionPayload;
export type ApplicationDeclinedPayload = ApplicationDecisionPayload;

export interface OfferSentPayload {
  musicianName?: string;
  churchName: string;
  city: string;
  role: string;
  /** Display strings in the service's timezone, e.g. `Sunday, March 8, 2026`, `10:00 AM`. */
  serviceDate: string;
  startTime: string;
  arrivalTime?: string;
  payCents: number;
  /** `https://worship…/offers/{token}`: a confirmation page; the link itself changes nothing. */
  offerUrl: string;
  /** When the offer lapses, as display text. */
  expiresAtText?: string;
  program?: string;
}

export interface OfferAcceptedChurchPayload {
  churchName?: string;
  contactName?: string;
  /** First name only; the church never receives a musician's full name or contact details here. */
  musicianFirstName: string;
  role: string;
  serviceDate: string;
  arrivalTime: string;
  program?: string;
}

export interface OfferResponseStaffPayload {
  musicianName: string;
  churchName: string;
  role: string;
  serviceDate: string;
  adminUrl: string;
}
export type OfferAcceptedStaffPayload = OfferResponseStaffPayload;
export type OfferDeclinedStaffPayload = OfferResponseStaffPayload;

export type InvoiceLineKind = 'musician_pay' | 'gamo_admin' | 'other';

export interface InvoiceLineInput {
  kind: InvoiceLineKind;
  description: string;
  quantity: number;
  unitAmountCents: number;
  amountCents: number;
}

export interface InvoiceSentPayload {
  billToName: string;
  number: string;
  /** Display date, e.g. `March 22, 2026`. */
  dueDate: string;
  lines: InvoiceLineInput[];
  totalCents: number;
  /** Stripe hosted invoice URL (card / ACH). */
  hostedUrl?: string;
  /** Manual payment instructions text (`INVOICE_PAYMENT_INSTRUCTIONS`), used when there is no hosted URL. */
  manualInstructions?: string;
  contactEmail?: string;
}

export interface InvoicePaidReceiptPayload {
  billToName: string;
  number: string;
  /** Display date. */
  paidDate: string;
  totalCents: number;
  method?: string;
  reference?: string;
  contactEmail?: string;
}

// ---- Helpers ---------------------------------------------------------------------------------------

/** Integer cents to `$1,234.56` (negative: `-$25.50`). Throws on non-integers (money is never fractional cents). */
export function formatUsd(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError('formatUsd: cents must be a safe integer');
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${cents < 0 ? '-' : ''}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
}

/** Collapses whitespace including CR/LF so a value can never add a header line. */
function oneLine(value: string, max = 120): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function requireText(value: unknown, name: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim()) throw new RangeError(`email: ${name} is required`);
  return value.trim().slice(0, max);
}

function optionalText(value: unknown, max = 500): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
}

function requireHttpUrl(value: unknown, name: string): string {
  const raw = requireText(value, name, 2048);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RangeError(`email: ${name} must be an absolute URL`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new RangeError(`email: ${name} must be http(s)`);
  return url.toString();
}

function requireCents(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new RangeError(`email: ${name} must be integer cents`);
  return value;
}

function firstName(name: string | undefined): string | undefined {
  const first = optionalText(name, 80)?.split(/\s+/)[0];
  return first || undefined;
}

const PROGRAM_LABEL: Record<string, string> = {
  worship: 'Gamo Worship',
  academy: 'Gamo Academy',
  production: 'Gamo Production',
};
function programLabel(program: string | undefined): string {
  return (program && PROGRAM_LABEL[program]) || 'Gamo Studios';
}

// ---- Block model (one source for the HTML and the plain-text twin) ----------------------------------

type Block =
  | { t: 'heading'; text: string }
  | { t: 'p'; text: string }
  | { t: 'kv'; rows: Array<[label: string, value: string]> }
  | { t: 'link'; label: string; url: string }
  | { t: 'pre'; text: string }
  | {
      t: 'lines';
      title: string;
      rows: Array<{ description: string; amount: string }>;
      subtotalLabel: string;
      subtotal: string;
    }
  | { t: 'total'; label: string; amount: string }
  | { t: 'small'; text: string };

const INK = '#18181B';
const CREAM = '#F9F6F0';
const TERRACOTTA = '#B34E24';
const DEEP = '#8F3B18';
const SAND = '#EDE6DA';

function renderText(blocks: Block[], signature: string): string {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.t) {
      case 'heading':
        out.push(b.text.toUpperCase(), '');
        break;
      case 'p':
      case 'small':
      case 'pre':
        out.push(b.text, '');
        break;
      case 'kv':
        out.push(...b.rows.map(([k, v]) => `${k}: ${v}`), '');
        break;
      case 'link':
        out.push(`${b.label}: ${b.url}`, '');
        break;
      case 'lines':
        out.push(
          b.title,
          ...b.rows.map((r) => `  ${r.description}: ${r.amount}`),
          `${b.title} subtotal: ${b.subtotal}`,
          '',
        );
        break;
      case 'total':
        out.push(`${b.label}: ${b.amount}`, '');
        break;
    }
  }
  out.push(signature);
  return out.join('\n');
}

function renderHtml(title: string, blocks: Block[], signature: string): string {
  const e = escapeHtml;
  const body = blocks
    .map((b) => {
      switch (b.t) {
        case 'heading':
          return `<h1 style="font-size:20px;font-weight:900;text-transform:uppercase;margin:0 0 16px">${e(b.text)}</h1>`;
        case 'p':
          return `<p style="margin:0 0 12px;line-height:1.5">${e(b.text)}</p>`;
        case 'small':
          return `<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#52525B">${e(b.text)}</p>`;
        case 'pre':
          return `<p style="margin:0 0 12px;padding:12px;background:${SAND};line-height:1.5">${b.text
            .split(/\r?\n/)
            .map(e)
            .join('<br>')}</p>`;
        case 'kv':
          return `<table role="presentation" style="border-collapse:collapse;margin:0 0 12px">${b.rows
            .map(
              ([k, v]) =>
                `<tr><td style="padding:2px 16px 2px 0;color:#52525B">${e(k)}</td><td style="padding:2px 0;font-weight:700">${e(v)}</td></tr>`,
            )
            .join('')}</table>`;
        case 'link':
          return `<p style="margin:0 0 16px"><a href="${e(b.url)}" style="display:inline-block;padding:12px 20px;background:${TERRACOTTA};color:#FFFFFF;font-weight:700;text-decoration:none">${e(b.label)}</a></p><p style="margin:0 0 12px;font-size:13px;color:#52525B">If the button does not work, copy this address into your browser: <a href="${e(b.url)}" style="color:${DEEP}">${e(b.url)}</a></p>`;
        case 'lines':
          return `<table role="presentation" style="border-collapse:collapse;width:100%;margin:0 0 12px"><tr><th colspan="2" style="text-align:left;padding:6px 0;border-bottom:2px solid ${INK}">${e(b.title)}</th></tr>${b.rows
            .map(
              (r) =>
                `<tr><td style="padding:6px 8px 6px 0;border-bottom:1px solid ${SAND}">${e(r.description)}</td><td style="padding:6px 0;border-bottom:1px solid ${SAND};text-align:right;white-space:nowrap">${e(r.amount)}</td></tr>`,
            )
            .join(
              '',
            )}<tr><td style="padding:6px 8px 6px 0;font-weight:700">${e(b.title)} subtotal</td><td style="padding:6px 0;text-align:right;font-weight:700;white-space:nowrap">${e(b.subtotal)}</td></tr></table>`;
        case 'total':
          return `<p style="margin:0 0 16px;font-size:18px;font-weight:900">${e(b.label)}: ${e(b.amount)}</p>`;
      }
    })
    .join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title></head><body style="margin:0;padding:24px;font-family:Inter,Arial,sans-serif;color:${INK};background:${CREAM}"><div style="max-width:560px;margin:0 auto">
${body}
<p style="margin:24px 0 0;font-size:13px;color:#52525B">${e(signature)}</p>
</div></body></html>`;
}

function compose(subject: string, heading: string, blocks: Block[], signature: string): RenderedEmail {
  const all: Block[] = [{ t: 'heading', text: heading }, ...blocks];
  return {
    subject: oneLine(subject, 150),
    text: renderText(all, signature),
    html: renderHtml(heading, all, signature),
  };
}

function signatureFor(program: string | undefined, contact?: string): string {
  const mail = optionalText(contact, 200) ?? GAMO_CONTACT_EMAIL;
  const label = programLabel(program);
  return `Questions? Write to ${mail}.\n${label === 'Gamo Studios' ? label : `${label} · Gamo Studios`}`;
}

// ---- Forms -----------------------------------------------------------------------------------------

/** To the submitter: reference, what happens next, contact. Never echoes what they submitted. */
export function renderFormReceived(p: FormReceivedPayload): RenderedEmail {
  const reference = requireText(p.reference, 'reference', 64);
  const formTitle = requireText(p.formTitle, 'formTitle', 120);
  const name = firstName(p.submitterName);
  const label = programLabel(p.program);
  return compose(
    `${label}: we received your submission ${reference}`,
    'We received your submission',
    [
      { t: 'p', text: `${name ? `Hello ${name}, thank` : 'Thank'} you. We received your ${formTitle}.` },
      {
        t: 'kv',
        rows: [
          ['Reference', reference],
          ['Form', formTitle],
        ],
      },
      { t: 'heading', text: 'What happens next' },
      {
        t: 'p',
        text: 'A member of our team reads every submission. We will write to you at this address when there is an update. There is nothing more you need to do now.',
      },
      {
        t: 'small',
        text: 'Quote the reference above if you write to us. For your privacy this email does not repeat what you submitted.',
      },
    ],
    signatureFor(p.program, p.contactEmail),
  );
}

/** To staff. The subject carries the form title and reference only; Reply-To is the submitter. */
export function renderFormStaffNotice(p: FormStaffNoticePayload): RenderedEmail {
  const reference = requireText(p.reference, 'reference', 64);
  const formTitle = requireText(p.formTitle, 'formTitle', 120);
  const adminUrl = requireHttpUrl(p.adminUrl, 'adminUrl');
  const submitterEmail = requireText(p.submitterEmail, 'submitterEmail', 254);
  const rows: Array<[string, string]> = [
    ['Form', formTitle],
    ['Reference', reference],
    ['Program', programLabel(p.program)],
    ['Submitter', optionalText(p.submitterName, 120) ?? 'Not given'],
    ['Reply to', submitterEmail],
  ];
  const mail = compose(
    `New ${formTitle} #${reference}`,
    'New submission',
    [
      { t: 'kv', rows },
      { t: 'link', label: 'Open the submission in admin', url: adminUrl },
      {
        t: 'small',
        text: 'Answers and files are in admin only. Replying to this email writes to the submitter.',
      },
    ],
    'Gamo Studios admin notification',
  );
  return { ...mail, replyTo: submitterEmail };
}

function decision(p: ApplicationDecisionPayload, approved: boolean): RenderedEmail {
  const name = firstName(p.recipientName);
  const label = programLabel(p.program);
  const note = optionalText(p.staffNote, 600);
  const ref = optionalText(p.reference, 64);
  const blocks: Block[] = [];
  if (approved) {
    blocks.push(
      {
        t: 'p',
        text: `${name ? `Hello ${name}, we` : 'We'} are glad to tell you your application to ${label} has been approved. Welcome.`,
      },
      {
        t: 'p',
        text: 'We will contact you by email when there is a service or opportunity that fits you. Your details stay private and are shared with a church only after you have said yes to a specific service.',
      },
    );
    if (note) blocks.push({ t: 'p', text: note });
  } else {
    blocks.push(
      {
        t: 'p',
        text: `${name ? `Hello ${name}, thank` : 'Thank'} you for applying to ${label} and for the time you took.`,
      },
      {
        t: 'p',
        text: 'After careful reading we are not able to move forward with your application at this time. This is not a judgment of you or your gifts, and you are welcome to apply again later.',
      },
    );
    if (note) blocks.push({ t: 'p', text: `A note from our team: ${note}` });
  }
  if (ref) blocks.push({ t: 'kv', rows: [['Reference', ref]] });
  return compose(
    approved ? `${label}: your application was approved` : `${label}: an update on your application`,
    approved ? 'Application approved' : 'Application update',
    blocks,
    signatureFor(p.program, p.contactEmail),
  );
}

export function renderApplicationApproved(p: ApplicationApprovedPayload): RenderedEmail {
  return decision(p, true);
}

/** Kind and plain. A reason appears only when staff supplied a short note. */
export function renderApplicationDeclined(p: ApplicationDeclinedPayload): RenderedEmail {
  return decision(p, false);
}

// ---- Offers ----------------------------------------------------------------------------------------

/** To the musician. The link opens a confirmation page; nothing changes until they press a button there. */
export function renderOfferSent(p: OfferSentPayload): RenderedEmail {
  const role = requireText(p.role, 'role', 80);
  const serviceDate = requireText(p.serviceDate, 'serviceDate', 80);
  const offerUrl = requireHttpUrl(p.offerUrl, 'offerUrl');
  const name = firstName(p.musicianName);
  const rows: Array<[string, string]> = [
    ['Church', requireText(p.churchName, 'churchName', 120)],
    ['City', requireText(p.city, 'city', 80)],
    ['Role', role],
    ['Date', serviceDate],
    ['Service starts', requireText(p.startTime, 'startTime', 40)],
  ];
  const arrival = optionalText(p.arrivalTime, 40);
  if (arrival) rows.push(['Please arrive by', arrival]);
  rows.push(['Pay', formatUsd(requireCents(p.payCents, 'payCents'))]);
  const expires = optionalText(p.expiresAtText, 80);
  return compose(
    `Service offer: ${role} on ${serviceDate}`,
    'A service offer for you',
    [
      {
        t: 'p',
        text: `${name ? `Hello ${name}, a` : 'A'} church would like you to serve. Here are the details.`,
      },
      { t: 'kv', rows },
      { t: 'link', label: 'Review and respond', url: offerUrl },
      {
        t: 'p',
        text: 'This link opens a confirmation page where you can accept or decline. Nothing happens until you press a button on that page, so opening it (or having an email scanner open it) does not commit you.',
      },
      ...(expires ? [{ t: 'small', text: `This offer is open until ${expires}.` } as Block] : []),
      { t: 'small', text: 'This link is personal. Please do not forward it.' },
    ],
    signatureFor(p.program),
  );
}

/** To the church: first name only, role and arrival time. */
export function renderOfferAcceptedChurch(p: OfferAcceptedChurchPayload): RenderedEmail {
  const first = requireText(p.musicianFirstName, 'musicianFirstName', 60).split(/\s+/)[0]!;
  const role = requireText(p.role, 'role', 80);
  const serviceDate = requireText(p.serviceDate, 'serviceDate', 80);
  const contact = firstName(p.contactName);
  return compose(
    `Your ${role} is confirmed for ${serviceDate}`,
    'Musician confirmed',
    [
      {
        t: 'p',
        text: `${contact ? `Hello ${contact}, good` : 'Good'} news: ${first} has accepted and will serve${p.churchName ? ` at ${requireText(p.churchName, 'churchName', 120)}` : ''}.`,
      },
      {
        t: 'kv',
        rows: [
          ['Musician', first],
          ['Role', role],
          ['Date', serviceDate],
          ['Arrives by', requireText(p.arrivalTime, 'arrivalTime', 40)],
        ],
      },
      {
        t: 'p',
        text: 'We will send the invoice after the service. If anything changes, reply to this email and we will help.',
      },
    ],
    signatureFor(p.program),
  );
}

function staffOffer(p: OfferResponseStaffPayload, accepted: boolean): RenderedEmail {
  const role = requireText(p.role, 'role', 80);
  const serviceDate = requireText(p.serviceDate, 'serviceDate', 80);
  const adminUrl = requireHttpUrl(p.adminUrl, 'adminUrl');
  return compose(
    `Offer ${accepted ? 'accepted' : 'declined'}: ${role} on ${serviceDate}`,
    accepted ? 'Offer accepted' : 'Offer declined',
    [
      {
        t: 'kv',
        rows: [
          ['Musician', requireText(p.musicianName, 'musicianName', 120)],
          ['Church', requireText(p.churchName, 'churchName', 120)],
          ['Role', role],
          ['Date', serviceDate],
        ],
      },
      {
        t: 'p',
        text: accepted
          ? 'The church has been sent its confirmation.'
          : 'The request is back in matching. Please choose another musician.',
      },
      { t: 'link', label: 'Open the request in admin', url: adminUrl },
    ],
    'Gamo Studios admin notification',
  );
}

export function renderOfferAcceptedStaff(p: OfferAcceptedStaffPayload): RenderedEmail {
  return staffOffer(p, true);
}

export function renderOfferDeclinedStaff(p: OfferDeclinedStaffPayload): RenderedEmail {
  return staffOffer(p, false);
}

// ---- Invoices --------------------------------------------------------------------------------------

function validateLines(p: InvoiceSentPayload): InvoiceLineInput[] {
  if (!Array.isArray(p.lines) || p.lines.length === 0) throw new RangeError('email: invoice has no lines');
  let sum = 0;
  const lines = p.lines.map((l) => {
    sum += requireCents(l.amountCents, 'line amountCents');
    requireCents(l.unitAmountCents, 'line unitAmountCents');
    if (!Number.isSafeInteger(l.quantity) || l.quantity < 1) throw new RangeError('email: line quantity');
    if (!['musician_pay', 'gamo_admin', 'other'].includes(l.kind)) throw new RangeError('email: line kind');
    requireText(l.description, 'line description', 200);
    return l;
  });
  if (sum !== requireCents(p.totalCents, 'totalCents'))
    throw new RangeError('email: invoice total does not equal its lines');
  return lines;
}

function lineRow(l: InvoiceLineInput): { description: string; amount: string } {
  const d = l.description.trim();
  return {
    description: l.quantity === 1 ? d : `${d} (${l.quantity} x ${formatUsd(l.unitAmountCents)})`,
    amount: formatUsd(l.amountCents),
  };
}

/** Invoice to the church. Musician pay and Gamo administrative lines are separate sections with their own subtotals. */
export function renderInvoiceSent(p: InvoiceSentPayload): RenderedEmail {
  const number = requireText(p.number, 'number', 40);
  const billTo = requireText(p.billToName, 'billToName', 120);
  const dueDate = requireText(p.dueDate, 'dueDate', 80);
  const lines = validateLines(p);
  const hostedUrl = p.hostedUrl ? requireHttpUrl(p.hostedUrl, 'hostedUrl') : undefined;
  const manual = optionalText(p.manualInstructions, 1500);
  if (!hostedUrl && !manual) throw new RangeError('email: invoice needs a pay link or payment instructions');

  const sections: Array<[string, InvoiceLineKind]> = [
    ['Musician pay', 'musician_pay'],
    ['Gamo administrative contribution', 'gamo_admin'],
    ['Other', 'other'],
  ];
  const blocks: Block[] = [
    { t: 'p', text: `Hello ${billTo}, here is your invoice. Thank you for hosting a service with us.` },
    {
      t: 'kv',
      rows: [
        ['Invoice', number],
        ['Bill to', billTo],
        ['Due', dueDate],
      ],
    },
  ];
  for (const [title, kind] of sections) {
    const rows = lines.filter((l) => l.kind === kind);
    if (rows.length === 0) continue;
    blocks.push({
      t: 'lines',
      title,
      rows: rows.map(lineRow),
      subtotalLabel: `${title} subtotal`,
      subtotal: formatUsd(rows.reduce((s, l) => s + l.amountCents, 0)),
    });
  }
  blocks.push({ t: 'total', label: 'Total due', amount: formatUsd(p.totalCents) });
  if (hostedUrl) {
    blocks.push({ t: 'link', label: 'View and pay the invoice', url: hostedUrl });
  } else if (manual) {
    blocks.push({ t: 'p', text: 'How to pay:' }, { t: 'pre', text: manual });
  }
  return compose(
    `Invoice ${number} from Gamo Studios`,
    `Invoice ${number}`,
    blocks,
    signatureFor('web', p.contactEmail),
  );
}

export function renderInvoicePaidReceipt(p: InvoicePaidReceiptPayload): RenderedEmail {
  const number = requireText(p.number, 'number', 40);
  const billTo = requireText(p.billToName, 'billToName', 120);
  const rows: Array<[string, string]> = [
    ['Invoice', number],
    ['Amount paid', formatUsd(requireCents(p.totalCents, 'totalCents'))],
    ['Paid on', requireText(p.paidDate, 'paidDate', 80)],
  ];
  const method = optionalText(p.method, 60);
  const reference = optionalText(p.reference, 120);
  if (method) rows.push(['Method', method]);
  if (reference) rows.push(['Reference', reference]);
  return compose(
    `Receipt for invoice ${number}`,
    'Payment received',
    [
      { t: 'p', text: `Hello ${billTo}, we received your payment. Thank you.` },
      { t: 'kv', rows },
      { t: 'small', text: 'Keep this email as your receipt.' },
    ],
    signatureFor('web', p.contactEmail),
  );
}
