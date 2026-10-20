/**
 * The event's Door tab (docs/LIVE_SCREENS.md §I.3 O6): the dates with their door screens, staff links (create with a
 * name and permissions; the link and its 6-digit PIN are shown once; revoke), card readers (owners pair and remove;
 * everyone sees them, their online status asked from Stripe on each load) and every cash drawer with expected,
 * counted and difference. The page calls `loadDoorTab` to draw and `runDoorTabAction` for a POST.
 */
import { requireSameOrigin } from '@gamo/auth';
import {
  PaidError,
  createEventStaffLink,
  formatCents,
  getOrganizerEvent,
  listCashSessions,
  listReaders,
  listStaffLinks,
  pairReader,
  refreshReaderStatus,
  removeReader,
  revokeStaffLink,
  type MembershipSummary,
  type OrganizerEventDetail,
  type Reader,
  type StaffLinkState,
  type StaffPermissions,
} from '@gamo/domain';
import { FLASH_COOKIE, flashRedirect, readFlash, type FlashRedirectContext } from '@studio-gamo/ui/lib/flash';
import { DOOR_FLASH, doorErrorKey, doorErrorMessage, isDoorError } from './door-messages';
import type { DoorDeps } from './door-sell';
import { whenLabel } from './organizer-format';

export interface DoorTabDate {
  id: string;
  label: string;
  canceled: boolean;
  href: string;
}

export interface DoorTabLink {
  id: string;
  label: string;
  permissions: string;
  state: StaffLinkState;
  stateLabel: string;
  detail: string;
  canRevoke: boolean;
}

export interface DoorTabReader {
  id: string;
  label: string;
  status: Reader['status'];
  statusLabel: string;
  lastSeen: string | null;
  /** The status could not be asked from Stripe just now (the stored one is shown). */
  stale: boolean;
}

export interface DoorTabDrawer {
  id: string;
  date: string;
  openedBy: string;
  open: boolean;
  float: string;
  expected: string;
  counted: string | null;
  difference: string | null;
  /** Counted minus expected: below 0 is short, above 0 is over. */
  differenceCents: number | null;
  when: string;
}

export interface DoorTabView {
  eventId: string;
  eventTitle: string;
  admission: string;
  timezone: string;
  dates: DoorTabDate[];
  links: DoorTabLink[];
  readers: DoorTabReader[];
  drawers: DoorTabDrawer[];
  isOwner: boolean;
  /** Why readers cannot be paired right now (card payments not ready), or null. */
  pairUnavailable: string | null;
  venue: { line1: string; city: string; state: string };
}

export interface CreatedLinkView {
  label: string;
  url: string;
  pin: string;
  permissions: string;
  expires: string;
}

export interface DoorTabFormState {
  created?: CreatedLinkView;
  linkErrors?: Partial<Record<'label' | 'permissions' | 'form', string>>;
  linkValues?: { label: string; permissions: string[] };
  pairErrors?: Partial<
    Record<'label' | 'registrationCode' | 'line1' | 'city' | 'state' | 'postalCode' | 'form', string>
  >;
  pairValues?: { label: string; line1: string; city: string; state: string; postalCode: string };
}

export type DoorTabResult =
  { kind: 'redirect'; location: string; flash: string } | { kind: 'render'; state: DoorTabFormState };

export function permissionsText(p: StaffPermissions): string {
  return [p.checkIn && 'Check in', p.sell && 'Sell', p.comp && 'Comp'].filter(Boolean).join(' · ');
}

const STATE_LABEL: Record<StaffLinkState, string> = {
  active: 'Active',
  locked: 'Locked',
  revoked: 'Turned off',
  expired: 'Expired',
};

const READER_STATUS: Record<Reader['status'], string> = {
  online: 'Online',
  offline: 'Offline',
  unknown: 'Status unknown',
};

const PAIR_UNAVAILABLE =
  'Card readers can be paired once card payments are ready for this organization (Organization → Payments).';

/** Everything the Door tab shows for this event. */
export async function loadDoorTab(
  deps: DoorDeps,
  active: MembershipSummary,
  event: OrganizerEventDetail,
  now: number,
): Promise<DoorTabView> {
  const { db } = deps;
  const orgId = active.organizationId;
  const tz = event.values.timezone;
  const [links, readers, drawers] = await Promise.all([
    listStaffLinks(db, { organizationId: orgId, scopeId: event.id, now }),
    listReaders(db, { organizationId: orgId, eventId: event.id }),
    listCashSessions(db, orgId, event.id),
  ]);
  const gateway = deps.runtime.gateway();
  const freshReaders: DoorTabReader[] = [];
  for (const r of readers) {
    let reader = r;
    let stale = true;
    if (gateway) {
      try {
        reader = await refreshReaderStatus(db, { organizationId: orgId, readerId: r.id, gateway, now });
        stale = false;
      } catch (error) {
        if (!(error instanceof PaidError)) throw error;
      }
    }
    freshReaders.push({
      id: reader.id,
      label: reader.label,
      status: reader.status,
      statusLabel: READER_STATUS[reader.status],
      lastSeen: reader.lastSeenAt ? whenLabel(reader.lastSeenAt, tz) : null,
      stale,
    });
  }
  const dateLabel = new Map(event.occurrences.map((o) => [o.id, whenLabel(o.startsAt, tz)]));
  const resolved = await deps.runtime.routingForOrganization(orgId);
  return {
    eventId: event.id,
    eventTitle: event.values.title,
    admission: event.admission,
    timezone: tz,
    dates: [...event.occurrences]
      .sort((a, b) => a.startsAt - b.startsAt)
      .map((o) => ({
        id: o.id,
        label: whenLabel(o.startsAt, tz),
        canceled: o.canceled,
        href: `/organizer/door/${encodeURIComponent(o.id)}`,
      })),
    links: links.map((l) => ({
      id: l.id,
      label: l.label,
      permissions: permissionsText(l.permissions),
      state: l.state,
      stateLabel: STATE_LABEL[l.state],
      detail: [
        l.lastUsedAt ? `Last used ${whenLabel(l.lastUsedAt, tz)}` : 'Not used yet',
        l.state === 'locked' && l.lockedUntil
          ? `Locked until ${whenLabel(l.lockedUntil, tz)}`
          : l.state === 'revoked' && l.revokedAt
            ? `Turned off ${whenLabel(l.revokedAt, tz)}`
            : `${l.state === 'expired' ? 'Expired' : 'Expires'} ${whenLabel(l.expiresAt, tz)}`,
        l.activeDevices > 0
          ? `${l.activeDevices} ${l.activeDevices === 1 ? 'device' : 'devices'} signed in`
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
      canRevoke: l.state === 'active' || l.state === 'locked',
    })),
    readers: freshReaders,
    drawers: drawers.map((d) => ({
      id: d.id,
      date: dateLabel.get(d.occurrenceId) ?? '',
      openedBy: d.openedBy ?? 'Unknown',
      open: d.status === 'open',
      float: formatCents(d.floatCents),
      expected: formatCents(d.expectedCents),
      counted: d.countedCents === null ? null : formatCents(d.countedCents),
      difference: d.differenceCents === null ? null : formatCents(d.differenceCents),
      differenceCents: d.differenceCents,
      when:
        d.status === 'open'
          ? `Opened ${whenLabel(d.openedAt, tz)}`
          : `Closed ${whenLabel(d.closedAt ?? d.openedAt, tz)}`,
    })),
    isOwner: active.role === 'owner',
    pairUnavailable: resolved.available ? null : PAIR_UNAVAILABLE,
    venue: { line1: event.values.address, city: event.values.city, state: event.values.state },
  };
}

const text = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === 'string' ? v : '';
};

/** One POST of the Door tab. Creating a link renders its URL and PIN once; everything else redirects. */
export async function runDoorTabAction(
  deps: DoorDeps,
  input: {
    active: MembershipSummary;
    organizerId: string;
    event: OrganizerEventDetail;
    form: FormData;
    now: number;
  },
): Promise<DoorTabResult> {
  const { db } = deps;
  const { active, event, form, now } = input;
  const orgId = active.organizationId;
  const back = `/organizer/events/${encodeURIComponent(event.id)}/door`;
  const action = text(form, 'action');

  if (action === 'create-link') {
    const label = text(form, 'label');
    const permissions = form.getAll('permissions').filter((p): p is string => typeof p === 'string');
    try {
      const created = await createEventStaffLink(db, deps.env, {
        organizationId: orgId,
        eventId: event.id,
        label,
        permissions,
        createdBy: input.organizerId,
        now,
      });
      return {
        kind: 'render',
        state: {
          created: {
            label: label.trim().replace(/\s+/g, ' '),
            url: `${deps.origin.replace(/\/+$/, '')}/door/${created.token}`,
            pin: created.pin,
            permissions: permissionsText(created.permissions),
            expires: whenLabel(created.expiresAt, event.values.timezone),
          },
        },
      };
    } catch (error) {
      if (!isDoorError(error)) throw error;
      const detail = error instanceof PaidError ? error.detail : undefined;
      const fieldName = detail === 'label' || detail === 'permissions' ? detail : 'form';
      const message =
        error instanceof PaidError && error.code === 'expired'
          ? 'This event has no date left, so a door link would expire at once.'
          : doorErrorMessage(error);
      return {
        kind: 'render',
        state: { linkErrors: { [fieldName]: message }, linkValues: { label, permissions } },
      };
    }
  }

  if (action === 'pair-reader') {
    const values = {
      label: text(form, 'label'),
      line1: text(form, 'line1'),
      city: text(form, 'city'),
      state: text(form, 'state'),
      postalCode: text(form, 'postalCode'),
    };
    try {
      const resolved = await deps.runtime.routingForOrganization(orgId);
      if (!resolved.available) throw new PaidError('payments_unavailable', { detail: resolved.reason });
      try {
        await pairReader(db, {
          routing: resolved.routing,
          organizationId: orgId,
          role: active.role,
          label: values.label,
          registrationCode: text(form, 'registrationCode'),
          address: values,
          eventId: null,
          now,
        });
      } finally {
        await deps.runtime.flush();
      }
      return { kind: 'redirect', location: `${back}#readers`, flash: 'door-ok-reader-paired' };
    } catch (error) {
      if (!isDoorError(error)) throw error;
      const detail = error instanceof PaidError ? error.detail : undefined;
      const known = ['label', 'registrationCode', 'line1', 'city', 'state', 'postalCode'] as const;
      const fieldName = known.find((k) => k === detail) ?? 'form';
      const message =
        error instanceof PaidError && error.code === 'payments_unavailable'
          ? PAIR_UNAVAILABLE
          : doorErrorMessage(error);
      return { kind: 'render', state: { pairErrors: { [fieldName]: message }, pairValues: values } };
    }
  }

  try {
    if (action === 'revoke-link') {
      const result = await revokeStaffLink(db, { organizationId: orgId, linkId: text(form, 'link'), now });
      return {
        kind: 'redirect',
        location: `${back}#links`,
        flash: result.revoked ? 'door-ok-link-revoked' : 'door-ok-link-already-revoked',
      };
    }
    if (action === 'remove-reader') {
      const gateway = deps.runtime.gateway();
      if (!gateway) throw new PaidError('payments_unavailable', { detail: 'stripe_not_configured' });
      try {
        await removeReader(db, {
          organizationId: orgId,
          role: active.role,
          readerId: text(form, 'reader'),
          gateway,
          now,
        });
      } finally {
        await deps.runtime.flush();
      }
      return { kind: 'redirect', location: `${back}#readers`, flash: 'door-ok-reader-removed' };
    }
  } catch (error) {
    if (!isDoorError(error)) throw error;
    return { kind: 'redirect', location: back, flash: doorErrorKey(error) };
  }
  return { kind: 'redirect', location: back, flash: 'door-e-invalid' };
}

export type DoorTabOutcome =
  | { response: Response }
  | {
      response: null;
      view: DoorTabView;
      state: DoorTabFormState;
      flash: { tone: 'success' | 'danger'; text: string } | null;
    };

/**
 * The Door tab's request: this organization's paid event (404 otherwise; another admission goes to the event page),
 * a POST checked for the same origin and run, then the view.
 */
export async function handleDoorTab(
  astro: FlashRedirectContext & { request: Request; url: URL },
  deps: DoorDeps,
  input: { active: MembershipSummary; organizerId: string; eventId: string; now: number },
): Promise<DoorTabOutcome> {
  const event = await getOrganizerEvent(deps.db, input.active.organizationId, input.eventId, input.now);
  if (!event) return { response: new Response(null, { status: 404 }) };
  if (event.admission !== 'paid_tickets')
    return { response: astro.redirect(`/organizer/events/${encodeURIComponent(event.id)}`, 303) };
  let state: DoorTabFormState = {};
  if (astro.request.method === 'POST') {
    try {
      requireSameOrigin(astro.request);
    } catch {
      return { response: new Response('Forbidden', { status: 403 }) };
    }
    const form = await astro.request.formData().catch(() => null);
    if (!form) return { response: new Response('Bad request', { status: 400 }) };
    const result = await runDoorTabAction(deps, {
      active: input.active,
      organizerId: input.organizerId,
      event,
      form,
      now: input.now,
    });
    if (result.kind === 'redirect') return { response: flashRedirect(astro, result.location, result.flash) };
    state = result.state;
  }
  const key = astro.cookies.get(FLASH_COOKIE)?.value ?? '';
  const text = readFlash(astro, DOOR_FLASH);
  return {
    response: null,
    view: await loadDoorTab(deps, input.active, event, input.now),
    state,
    flash: text ? { tone: key.startsWith('door-e-') ? 'danger' : 'success', text } : null,
  };
}
