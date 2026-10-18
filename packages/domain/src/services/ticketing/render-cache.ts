/**
 * Ticket PDFs cached in R2 (`MEDIA_BUCKET`, private) by ticket id and version: `tickets/<id>@<v>.pdf`,
 * and order bundles by the hash of every (id, version) they contain. A version bump (transfer, reissue)
 * changes the key, so a cached file can never show an old QR. Without the binding PDFs are rendered on
 * every request. Objects are only ever served through the authorised download routes, never by URL.
 */
import { sha256Hex } from '../../security/crypto.ts';
import { renderTicketsPdf } from './render-pdf.ts';
import type { TicketRenderModel } from './render-model.ts';
import type { TicketingEnv } from './orders-shared.ts';

interface R2Like {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  put(key: string, value: Uint8Array, options?: { httpMetadata?: Record<string, string> }): Promise<unknown>;
}

function bucket(env: TicketingEnv): R2Like | null {
  const b = env.MEDIA_BUCKET as Partial<R2Like> | undefined;
  return b && typeof b.get === 'function' && typeof b.put === 'function' ? (b as R2Like) : null;
}

/**
 * `tickets/<id>@<version>.<fingerprint>.pdf`. The fingerprint covers everything else printed (event
 * date, venue, holder, category …): a reschedule keeps the ticket version (design §5.5) but must not
 * serve a PDF with the old date.
 */
export async function ticketsPdfCacheKey(tickets: TicketRenderModel[]): Promise<string> {
  const fingerprint = (await sha256Hex(JSON.stringify(tickets))).slice(0, 16);
  if (tickets.length === 1) return `tickets/${tickets[0].ticketId}@${tickets[0].version}.${fingerprint}.pdf`;
  const id = await sha256Hex(tickets.map((t) => `${t.ticketId}@${t.version}`).join('|'));
  return `tickets/bundle-${id.slice(0, 32)}.${fingerprint}.pdf`;
}

/** The PDF for these tickets, from R2 when cached (valid tickets only are cached). */
export async function ticketsPdf(
  env: TicketingEnv,
  tickets: TicketRenderModel[],
  title?: string,
): Promise<Uint8Array> {
  const r2 = bucket(env);
  const cacheable = r2 && tickets.length > 0 && tickets.every((t) => t.status === 'valid');
  const key = cacheable ? await ticketsPdfCacheKey(tickets) : null;
  if (r2 && key) {
    try {
      const hit = await r2.get(key);
      if (hit) return new Uint8Array(await hit.arrayBuffer());
    } catch {
      console.warn('[ticketing] PDF cache read failed');
    }
  }
  const pdf = await renderTicketsPdf(tickets, title);
  if (r2 && key) {
    try {
      await r2.put(key, pdf, { httpMetadata: { contentType: 'application/pdf' } });
    } catch {
      console.warn('[ticketing] PDF cache write failed');
    }
  }
  return pdf;
}
