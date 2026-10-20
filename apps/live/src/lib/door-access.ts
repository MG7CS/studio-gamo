/**
 * Who is standing at the door, for both ways in (docs/LIVE_SCREENS.md §I.3 O7 and §I.2 P8):
 *
 * - a signed-in organizer member (`/organizer/door/[occurrenceId]`): actor kind `organizer`, every permission, may open
 *   and close check-in by hand;
 * - door staff with a staff link and PIN (`/door/[token]`): the PIN page, then a device cookie (HttpOnly, SameSite=Strict,
 *   Secure on https, path `/door/`) whose value comes from `enterPin` and is re-checked with `resolveStaffDevice` on
 *   every request. The link's permissions and event scope come from the device, never from the request.
 *
 * Nothing here stores or logs a token, PIN or cookie value.
 */
import {
  CHECKIN_CLOSES_AFTER_SECONDS,
  LiveCatalog,
  PaidError,
  StaffPinError,
  endStaffDevice,
  enterPin,
  getCheckInOccurrence,
  getOrganizerEvent,
  loadDoorOccurrence,
  previewStaffLink,
  resolveStaffDevice,
  waitPhrase,
  type CheckInOccurrence,
  type DoorOccurrence,
  type PaidEnv,
  type SqlDatabase,
  type StaffActor,
  type StaffDevice,
} from '@gamo/domain';
import { isWellFormedPin, sha256Hex } from '@gamo/domain/security';
import { whenLabel } from './organizer-format';

/** One date's door, as the door screen sees it. */
export interface DoorAccess {
  actor: StaffActor;
  /** The date with its check-in counts (registrations). */
  occurrence: CheckInOccurrence;
  /** The date's admission and statuses. */
  door: DoorOccurrence;
  /** Where this door screen lives (`/organizer/door/<id>` or `/door/<token>/<id>`). */
  basePath: string;
  /** Organizers may open and close check-in by hand and see the lists behind the numbers. */
  organizer: boolean;
  /** The staff link's name, or null for an organizer. */
  staffLabel: string | null;
}

async function accessFor(
  db: SqlDatabase,
  actor: StaffActor,
  occurrenceId: string,
  basePath: string,
): Promise<DoorAccess | null> {
  const occurrence = await getCheckInOccurrence(db, actor.organizationId, occurrenceId);
  if (!occurrence) return null;
  if (actor.kind === 'staff' && occurrence.eventId !== actor.scopeId) return null;
  const door = await loadDoorOccurrence(db, occurrenceId);
  if (!door || door.organizationId !== actor.organizationId) return null;
  return {
    actor,
    occurrence,
    door,
    basePath,
    organizer: actor.kind === 'organizer',
    staffLabel: actor.kind === 'staff' ? actor.label : null,
  };
}

/** The door of one date for a signed-in member of its organization, or null (404) when the date is not theirs. */
export function organizerDoorAccess(
  db: SqlDatabase,
  input: { organizerId: string; organizationId: string; occurrenceId: string },
): Promise<DoorAccess | null> {
  return accessFor(
    db,
    { kind: 'organizer', organizerId: input.organizerId, organizationId: input.organizationId },
    input.occurrenceId,
    `/organizer/door/${encodeURIComponent(input.occurrenceId)}`,
  );
}

// ── Staff device cookie ────────────────────────────────────────────────────────────────────────────────────────

export const DOOR_COOKIE_PREFIX = 'gl_door_';
export const DOOR_COOKIE_PATH = '/door/';

/**
 * The device cookie's name for one link: a short hash of the token, so a device can hold several links and a cookie
 * of one link is never read on another link's pages. The name reveals nothing about the token.
 */
export async function doorCookieName(token: string): Promise<string> {
  return `${DOOR_COOKIE_PREFIX}${(await sha256Hex(`gamo-live-door-cookie:${token}`)).slice(0, 16)}`;
}

/** `Set-Cookie` for the device cookie: HttpOnly, SameSite=Strict, path `/door/`, Secure on https. 0 clears it. */
export function doorCookieHeader(
  name: string,
  value: string,
  maxAgeSeconds: number,
  secure: boolean,
): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${DOOR_COOKIE_PATH}`,
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.trunc(maxAgeSeconds))}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

// ── The staff link page: PIN, then the dates ───────────────────────────────────────────────────────────────────

export interface StaffDate {
  id: string;
  label: string;
  href: string;
}

export type StaffEntry =
  /** Unknown or malformed link. */
  | { kind: 'invalid' }
  /** Turned off or expired: nothing to do but ask for a new link. */
  | { kind: 'closed'; reason: 'revoked' | 'expired'; label: string }
  /** Ask for the PIN (with the lock, when five wrong PINs locked it). */
  | { kind: 'pin'; label: string; eventTitle: string | null; lockedMessage: string | null }
  /** Signed in: the dates of the link's event that still have a door. */
  | {
      kind: 'ready';
      label: string;
      eventTitle: string;
      dates: StaffDate[];
      /** Exactly one date: go straight to it. */
      redirect: string | null;
    };

async function publicEvent(db: SqlDatabase, eventId: string, now: number) {
  try {
    return await new LiveCatalog(db, () => now).getEvent(eventId);
  } catch {
    return null;
  }
}

function lockedMessage(until: number, now: number, timezone: string | null): string {
  const at = timezone ? ` (until ${whenLabel(until, timezone)})` : '';
  return `Too many wrong PINs. This link is locked for ${waitPhrase(until - now)}${at}.`;
}

/** The device behind this link's cookie, when it is still valid and belongs to this link's event. */
async function deviceFor(
  db: SqlDatabase,
  input: { cookieValue: string | null; linkId: string; now: number },
): Promise<StaffDevice | null> {
  const device = await resolveStaffDevice(db, { cookieValue: input.cookieValue, now: input.now });
  if (!device || device.linkId !== input.linkId) return null;
  return device;
}

/**
 * What `/door/[token]` shows: the PIN form, why the link no longer works, or (signed in) the dates of its event that
 * still have a door (check-in closes 12 hours after a date starts).
 */
export async function staffEntry(
  db: SqlDatabase,
  env: PaidEnv,
  input: { token: string; cookieValue: string | null; now: number },
): Promise<StaffEntry> {
  const preview = await previewStaffLink(db, env, { token: input.token, now: input.now });
  if (!preview) return { kind: 'invalid' };
  if (preview.state === 'revoked' || preview.state === 'expired')
    return { kind: 'closed', reason: preview.state, label: preview.label };
  const device =
    preview.state === 'active'
      ? await deviceFor(db, {
          cookieValue: input.cookieValue,
          linkId: preview.linkId,
          now: input.now,
        })
      : null;
  if (!device) {
    const event = await publicEvent(db, preview.scopeId, input.now);
    return {
      kind: 'pin',
      label: preview.label,
      eventTitle: event?.title ?? null,
      lockedMessage:
        preview.state === 'locked' && preview.lockedUntil
          ? lockedMessage(preview.lockedUntil, input.now, event?.timezone ?? null)
          : null,
    };
  }
  const event = await getOrganizerEvent(db, device.actor.organizationId, device.scopeId, input.now);
  if (!event) return { kind: 'invalid' };
  const tz = event.values.timezone;
  const base = `/door/${encodeURIComponent(input.token)}`;
  const dates = event.occurrences
    .filter((o) => !o.canceled && o.startsAt + CHECKIN_CLOSES_AFTER_SECONDS > input.now)
    .sort((a, b) => a.startsAt - b.startsAt)
    .map((o) => ({
      id: o.id,
      label: whenLabel(o.startsAt, tz),
      href: `${base}/${encodeURIComponent(o.id)}`,
    }));
  return {
    kind: 'ready',
    label: preview.label,
    eventTitle: event.values.title,
    dates,
    redirect: dates.length === 1 ? dates[0].href : null,
  };
}

export type PinOutcome =
  | { ok: true; cookieName: string; cookieValue: string; maxAgeSeconds: number }
  | { ok: false; message: string };

/** Checks a PIN typed on the link page. On success the caller sets the device cookie and reloads the page. */
export async function submitPin(
  db: SqlDatabase,
  env: PaidEnv,
  input: { token: string; pin: unknown; ipHash?: string | null; now: number },
): Promise<PinOutcome> {
  const pin = typeof input.pin === 'string' ? input.pin.replace(/\s+/g, '') : '';
  if (!isWellFormedPin(pin))
    return { ok: false, message: 'Enter the 6-digit PIN you were given with the link.' };
  try {
    const entered = await enterPin(db, env, {
      token: input.token,
      pin,
      ipHash: input.ipHash ?? null,
      now: input.now,
    });
    return {
      ok: true,
      cookieName: await doorCookieName(input.token),
      cookieValue: entered.cookieValue,
      maxAgeSeconds: entered.expiresAt - input.now,
    };
  } catch (error) {
    if (error instanceof StaffPinError)
      return {
        ok: false,
        message:
          error.attemptsLeft > 0
            ? `That PIN is not right. ${error.attemptsLeft} ${error.attemptsLeft === 1 ? 'try' : 'tries'} left before the link locks for 15 minutes.`
            : 'That PIN is not right. The link is now locked for 15 minutes.',
      };
    if (!(error instanceof PaidError)) throw error;
    switch (error.code) {
      case 'locked': {
        const preview = await previewStaffLink(db, env, { token: input.token, now: input.now });
        const event = preview ? await publicEvent(db, preview.scopeId, input.now) : null;
        return {
          ok: false,
          message: lockedMessage(
            input.now + (error.retryAfterSeconds ?? 15 * 60),
            input.now,
            event?.timezone ?? null,
          ),
        };
      }
      case 'rate_limited':
        return {
          ok: false,
          message: `Too many PIN tries from this network. Try again in ${waitPhrase(error.retryAfterSeconds)}.`,
        };
      case 'forbidden':
        return { ok: false, message: 'This link was turned off by the organizer. Ask them for a new one.' };
      case 'expired':
        return {
          ok: false,
          message: 'This link has expired. Links stop working 12 hours after the event’s last date.',
        };
      default:
        return { ok: false, message: 'This link is not valid. Check that you opened the whole link.' };
    }
  }
}

/** Signs this device out of the link ("Leave"); the caller clears the cookie. */
export async function leaveDoor(db: SqlDatabase, cookieValue: string | null): Promise<void> {
  await endStaffDevice(db, { cookieValue });
}

/** The door of one date for a signed-in staff device, or null: the caller then sends the person to the PIN page. */
export async function staffDoorAccess(
  db: SqlDatabase,
  env: PaidEnv,
  input: { token: string; cookieValue: string | null; occurrenceId: string; now: number },
): Promise<DoorAccess | null> {
  const preview = await previewStaffLink(db, env, { token: input.token, now: input.now });
  if (!preview || preview.state !== 'active') return null;
  const device = await deviceFor(db, {
    cookieValue: input.cookieValue,
    linkId: preview.linkId,
    now: input.now,
  });
  if (!device) return null;
  return accessFor(
    db,
    device.actor,
    input.occurrenceId,
    `/door/${encodeURIComponent(input.token)}/${encodeURIComponent(input.occurrenceId)}`,
  );
}
