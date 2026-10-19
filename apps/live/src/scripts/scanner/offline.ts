/**
 * Offline decision on the device (design T-10): verify the code against the manifest (SHA-256 of the
 * MAC — the device never has the signing key) and apply the same rules as the server, using the
 * manifest's presence plus this device's queued, unsynced scans. The server re-decides every queued
 * scan on sync; this result is provisional and says so.
 */
import { macMatchesDigest, parseTicketQr, sha256Hex } from '@gamo/domain/security';
import type { QueuedScan } from './store';
import type { ManifestTicket, ScanOutcomeView, ScannerManifest } from './types';

const TITLES: Record<string, string> = {
  admitted: 'Admitted',
  exited: 'Exit recorded',
  already_inside: 'Already inside',
  already_used: 'Already used',
  reentry_denied: 'Re-entry limit reached',
  not_inside: 'Not inside',
  wrong_zone: 'Wrong entrance',
  voided: 'Ticket voided',
  refunded: 'Ticket refunded',
  stale_version: 'Old ticket code',
  invalid: 'Not a valid ticket',
  not_found: 'Ticket not found',
  not_open_yet: 'Not open yet',
  event_cancelled: 'Event cancelled',
  event_ended: 'Event has ended',
};
const MESSAGES: Record<string, string> = {
  admitted: 'Welcome them in. (Offline: will be confirmed when the scanner reconnects.)',
  exited: 'Exit saved on this phone; it will sync when online.',
  already_inside: 'This ticket is already inside. Do not admit twice.',
  already_used: 'This ticket was already used. Re-entry is not allowed for this event.',
  reentry_denied: 'This ticket has used all its entries for today.',
  not_inside: 'This ticket has not been scanned in today.',
  wrong_zone: 'Send the guest to the right entrance.',
  voided: 'Do not admit. Send the guest to the help desk.',
  refunded: 'This ticket was refunded. Do not admit.',
  stale_version: 'This ticket was transferred or reissued. Ask for the latest ticket.',
  invalid: 'The code could not be verified. Try again, or use manual lookup when online.',
  not_found: 'This ticket is not on this phone’s list. It will be checked when the scanner reconnects.',
  not_open_yet: 'Scanning is not open yet for this ticket.',
  event_cancelled: 'This event was cancelled.',
  event_ended: 'Scanning closed after the event ended. Ask the organizer.',
};

export function venueDayKey(epochSeconds: number, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(epochSeconds * 1000))
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const view = (result: string, ticket: ManifestTicket | null, manifest: ScannerManifest): ScanOutcomeView => ({
  result,
  admitted: result === 'admitted',
  title: TITLES[result] ?? 'Not recorded',
  message: MESSAGES[result] ?? '',
  repeated: false,
  offline: true,
  conflict: 'none',
  ticket: ticket
    ? {
        holder: ticket.n,
        category: ticket.c ? (manifest.categories[ticket.c]?.name ?? null) : null,
        section: ticket.s,
        zone: ticket.z[0] ?? null,
        seatsPerTicket: ticket.c ? (manifest.categories[ticket.c]?.seats ?? 1) : 1,
      }
    : null,
});

/** Decides one scan offline. Returns the result and the manifest key used to track local presence. */
export async function decideOffline(input: {
  manifest: ScannerManifest;
  queue: QueuedScan[];
  code: string;
  direction: 'in' | 'out';
  gateZones: string[];
  now: number;
}): Promise<{ outcome: ScanOutcomeView; ticketKey: string | null }> {
  const { manifest } = input;
  const code = input.code.trim();
  if (manifest.cancelled) return { outcome: view('event_cancelled', null, manifest), ticketKey: null };
  if (/^gamt_/.test(code)) {
    const h = await sha256Hex(code);
    const legacy = manifest.legacy.find((l) => l.h === h);
    if (!legacy) return { outcome: view('not_found', null, manifest), ticketKey: null };
    if (input.direction === 'out') return { outcome: view('not_inside', null, manifest), ticketKey: h };
    const used =
      legacy.st === 'checked_in' ||
      input.queue.some((q) => q.ticketKey === h && q.localResult === 'admitted');
    if (legacy.st === 'voided' || legacy.st === 'refunded')
      return { outcome: view(legacy.st, null, manifest), ticketKey: h };
    return { outcome: view(used ? 'already_used' : 'admitted', null, manifest), ticketKey: h };
  }
  const parsed = parseTicketQr(code);
  if (!parsed.ok) return { outcome: view('invalid', null, manifest), ticketKey: null };
  const key = parsed.ticketId.slice(4).toUpperCase();
  const ticket = manifest.tickets.find((t) => t.i === key) ?? null;
  if (!ticket) return { outcome: view('not_found', null, manifest), ticketKey: key };
  if (parsed.version < ticket.v) return { outcome: view('stale_version', ticket, manifest), ticketKey: key };
  if (parsed.version > ticket.v || !(await macMatchesDigest(parsed.mac, ticket.d)))
    return { outcome: view('invalid', null, manifest), ticketKey: key };
  if (ticket.st !== 'valid') return { outcome: view(ticket.st, ticket, manifest), ticketKey: key };
  if (input.now > manifest.endsAt + 6 * 3600)
    return { outcome: view('event_ended', null, manifest), ticketKey: key };
  if (input.now < manifest.opensAt)
    return { outcome: view('not_open_yet', ticket, manifest), ticketKey: key };
  // Same presence key as the server (operatingDayKey): one per event, or the 05:00-shifted local date for multi-day passes.
  const validDays = ticket.c ? manifest.categories[ticket.c]?.validDays : null;
  const dayOf = (at: number) =>
    validDays?.length ? venueDayKey(at - 5 * 3600, manifest.timeZone) : manifest.eventDayKey;
  const day = dayOf(input.now);
  if (validDays?.length && !validDays.includes(day))
    return { outcome: view('not_open_yet', ticket, manifest), ticketKey: key };
  if (input.direction === 'in' && input.gateZones.length) {
    const allowed = new Set(input.gateZones.map((z) => z.toLowerCase()));
    if (!ticket.z.some((z) => allowed.has(z.toLowerCase())))
      return { outcome: view('wrong_zone', ticket, manifest), ticketKey: key };
  }
  // Presence: the manifest's state for today, then this device's unsynced scans in order.
  let state = ticket.p[day]?.s ?? 'outside';
  let entries = ticket.p[day]?.e ?? 0;
  for (const q of input.queue) {
    if (q.ticketKey !== key || dayOf(q.deviceScannedAt) !== day) continue;
    if (q.localResult === 'admitted') {
      state = 'inside';
      entries++;
    } else if (q.localResult === 'exited') state = 'outside';
  }
  if (input.direction === 'out')
    return { outcome: view(state === 'inside' ? 'exited' : 'not_inside', ticket, manifest), ticketKey: key };
  if (state === 'inside') return { outcome: view('already_inside', ticket, manifest), ticketKey: key };
  const max = manifest.maxEntriesPerDay;
  if (max !== null && entries >= max)
    return { outcome: view(max === 1 ? 'already_used' : 'reentry_denied', ticket, manifest), ticketKey: key };
  return { outcome: view('admitted', ticket, manifest), ticketKey: key };
}
