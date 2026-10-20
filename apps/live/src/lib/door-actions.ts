/**
 * Every POST of the door screen, for both ways in: the page checks identity and same origin, then calls
 * `runDoorPost` once and answers with what it returns: a JSON reply (the camera scanner), the check-in result to
 * draw (the typed-code form), or a redirect with a flash key. Each action calls one function in door-checkin.ts or
 * door-sell.ts; anything that touched Stripe or the stand-in has flushed it before this returns.
 */
import { requireSameOrigin } from '@gamo/auth';
import {
  PaidError,
  getOrganizerEvent,
  hasPermission,
  paymentsRuntime,
  type PaidEnv,
  type SqlDatabase,
} from '@gamo/domain';
import { siteOrigin } from '@studio-gamo/ui/lib/sites';
import { FLASH_COOKIE, flashRedirect, readFlash, type FlashRedirectContext } from '@studio-gamo/ui/lib/flash';
import type { DoorAccess } from './door-access';
import { doorCheckIn, setDoorCheckIn, type CheckInReply } from './door-checkin';
import { DOOR_FLASH, doorErrorKey, isDoorError } from './door-messages';
import { sellHref, type PayChoice } from './door-screen';
import {
  doorCancelSale,
  doorCloseDrawer,
  doorOpenDrawer,
  doorRefund,
  doorSellCash,
  doorSellComp,
  doorSellPhone,
  doorSellReader,
  doorSimulateTap,
  emailDoorTickets,
  optionalEmail,
  parseSelection,
  type DoorDeps,
  type SaleResult,
} from './door-sell';

export type DoorPostResult =
  | { kind: 'json'; body: CheckInReply }
  | { kind: 'render'; checkIn: CheckInReply }
  | { kind: 'redirect'; location: string; flash: string | null };

const field = (form: FormData | null, name: string) => {
  const v = form?.get(name);
  return typeof v === 'string' ? v : '';
};

const PAY_OF: Record<string, PayChoice> = {
  'sell-cash': 'cash',
  'sell-phone': 'phone',
  'sell-reader': 'reader',
  'sell-comp': 'comp',
  'open-drawer': 'cash',
};

/**
 * Handles one door POST. `json` is the scanner's `{ code }` body; `form` the posted form otherwise.
 */
export async function runDoorPost(
  deps: DoorDeps,
  access: DoorAccess,
  input: { json?: unknown; form: FormData | null; now: number },
): Promise<DoorPostResult> {
  const { now } = input;
  const base = access.basePath;
  if (input.json !== undefined) {
    const code = (input.json as { code?: unknown } | null)?.code;
    return { kind: 'json', body: await doorCheckIn(deps.db, deps.env, access, { code, now }) };
  }
  const form = input.form;
  const action = field(form, 'action');
  if (action === 'checkin')
    return {
      kind: 'render',
      checkIn: await doorCheckIn(deps.db, deps.env, access, { code: form?.get('code'), now }),
    };
  if (action === 'open-checkin' || action === 'close-checkin') {
    const flash = await setDoorCheckIn(deps.db, access, { open: action === 'open-checkin', now });
    return { kind: 'redirect', location: `${base}?mode=checkin`, flash };
  }

  const sel = parseSelection(field(form, 'sel'));
  const orderId = field(form, 'order');
  const back = sellHref(base, sel, PAY_OF[action] ?? null);
  const toSale = (result: SaleResult): DoorPostResult => ({
    kind: 'redirect',
    location: `${base}?mode=sell&sale=${encodeURIComponent(result.orderId)}`,
    flash:
      result.emailed === true
        ? 'door-ok-email-sent'
        : result.emailed === false
          ? 'door-ok-email-failed'
          : null,
  });
  try {
    if (!hasPermission(access.actor, 'sell')) throw new PaidError('forbidden', { detail: 'sell' });
    switch (action) {
      case 'sell-cash':
        return toSale(
          await doorSellCash(deps, access, {
            selection: sel,
            received: form?.get('received'),
            email: form?.get('email'),
            now,
          }),
        );
      case 'sell-comp':
        return toSale(
          await doorSellComp(deps, access, {
            selection: sel,
            reason: form?.get('reason'),
            email: form?.get('email'),
            now,
          }),
        );
      case 'sell-phone': {
        const event = await getOrganizerEvent(
          deps.db,
          access.actor.organizationId,
          access.occurrence.eventId,
          now,
        );
        return toSale(
          await doorSellPhone(deps, access, {
            selection: sel,
            email: form?.get('email'),
            eventSlug: event?.slug ?? '',
            now,
          }),
        );
      }
      case 'sell-reader':
        return toSale(
          await doorSellReader(deps, access, {
            selection: sel,
            readerId: form?.get('reader'),
            email: form?.get('email'),
            now,
          }),
        );
      case 'cancel-sale': {
        const released = await doorCancelSale(deps, access, { orderId, now });
        return {
          kind: 'redirect',
          location: sellHref(base, ''),
          flash: released ? 'door-ok-sale-canceled' : 'door-ok-sale-gone',
        };
      }
      case 'simulate-tap':
        await doorSimulateTap(deps, access, { orderId, now });
        return {
          kind: 'redirect',
          location: `${base}?mode=sell&sale=${encodeURIComponent(orderId)}`,
          flash: 'door-ok-tap-sent',
        };
      case 'refund':
        return {
          kind: 'redirect',
          location: sellHref(base, ''),
          flash: await doorRefund(deps, access, { orderId, reason: form?.get('reason'), now }),
        };
      case 'email-tickets': {
        const to = optionalEmail(form?.get('email'));
        if (!to) throw new PaidError('invalid', { detail: 'email' });
        const sent = await emailDoorTickets(deps, access, { orderId, to, now });
        return {
          kind: 'redirect',
          location: `${base}?mode=sell&sale=${encodeURIComponent(orderId)}`,
          flash: sent ? 'door-ok-email-sent' : 'door-ok-email-failed',
        };
      }
      case 'open-drawer':
        await doorOpenDrawer(deps, access, { float: form?.get('float'), now });
        return { kind: 'redirect', location: back, flash: 'door-ok-drawer-opened' };
      case 'close-drawer': {
        const id = await doorCloseDrawer(deps, access, {
          counted: form?.get('counted'),
          note: form?.get('note'),
          now,
        });
        return {
          kind: 'redirect',
          location: `${base}?mode=sell&drawer=${encodeURIComponent(id)}`,
          flash: 'door-ok-drawer-closed',
        };
      }
      default:
        return { kind: 'redirect', location: base, flash: null };
    }
  } catch (error) {
    if (!isDoorError(error)) throw error;
    const location =
      orderId && (action === 'simulate-tap' || action === 'email-tickets' || action === 'cancel-sale')
        ? `${base}?mode=sell&sale=${encodeURIComponent(orderId)}`
        : back;
    return { kind: 'redirect', location, flash: doorErrorKey(error) };
  }
}

/** The door actions' dependencies for this request. */
export function doorDeps(live: { db: SqlDatabase; env: unknown }, url: URL): DoorDeps {
  const env = live.env as PaidEnv;
  const runtime = paymentsRuntime(live.db, env);
  // Links Stripe sends buyers back to come from the configuration; with the local stand-in this server is the site
  // (so a phone on the same Wi-Fi reaches it).
  return { db: live.db, env, runtime, origin: runtime.standin ? url.origin : siteOrigin('live') };
}

export interface DoorRequestContext extends FlashRedirectContext {
  request: Request;
  url: URL;
}

export type DoorRequestOutcome =
  | { response: Response }
  | {
      response: null;
      checkIn: CheckInReply | null;
      flash: { tone: 'success' | 'danger'; text: string } | null;
    };

/**
 * The door screen's request handling for both pages, after the actor is known: a POST is checked for the same origin,
 * run, and answered (JSON for the scanner, a redirect with a flash, or the typed code's result to draw); a GET reads
 * the one-time flash message.
 */
export async function handleDoorRequest(
  astro: DoorRequestContext,
  deps: DoorDeps,
  access: DoorAccess,
  now: number,
): Promise<DoorRequestOutcome> {
  let checkIn: CheckInReply | null = null;
  if (astro.request.method === 'POST') {
    try {
      requireSameOrigin(astro.request);
    } catch {
      return { response: new Response('Forbidden', { status: 403 }) };
    }
    const asJson = (astro.request.headers.get('content-type') ?? '').includes('application/json');
    const result = asJson
      ? await runDoorPost(deps, access, {
          json: await astro.request.json().catch(() => null),
          form: null,
          now,
        })
      : await runDoorPost(deps, access, { form: await astro.request.formData().catch(() => null), now });
    if (result.kind === 'json')
      return {
        response: new Response(JSON.stringify(result.body), {
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        }),
      };
    if (result.kind === 'redirect')
      return {
        response: result.flash
          ? flashRedirect(astro, result.location, result.flash)
          : astro.redirect(result.location, 303),
      };
    checkIn = result.checkIn;
  }
  const key = astro.cookies.get(FLASH_COOKIE)?.value ?? '';
  const text = readFlash(astro, DOOR_FLASH);
  return {
    response: null,
    checkIn,
    flash: text ? { tone: key.startsWith('door-e-') ? 'danger' : 'success', text } : null,
  };
}
