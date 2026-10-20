/**
 * Organizer settings: the person's own profile (name, default time zone), their sign-in sessions, and a copy of the
 * personal data Gamo Live holds about them. Organization details live in `organizers.ts`; this file never touches
 * an organization.
 */
import { sha256Hex } from '../security/crypto.ts';
import { allRows, changesOf, type SqlDatabase } from '../security/sql-database.ts';
import { EVENT_TIME_ZONES } from './events.ts';

export interface SettingsInput {
  displayName: string;
  timezone: string;
}
export type SettingsErrors = Partial<Record<keyof SettingsInput, string>>;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

/** Clean values and the problems with them. A name is required; the time zone is optional. */
export function validateSettings(input: SettingsInput): {
  values: SettingsInput;
  errors: SettingsErrors;
} {
  const displayName = input.displayName.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  const timezone = input.timezone.trim();
  const errors: SettingsErrors = {};
  if (displayName.length < 1) errors.displayName = 'Enter your name.';
  else if (displayName.length > 80) errors.displayName = 'Use 80 characters or fewer.';
  if (timezone && !EVENT_TIME_ZONES.some((z) => z.value === timezone))
    errors.timezone = 'Choose a time zone from the list.';
  return { values: { displayName, timezone }, errors };
}

/** Saves the profile. A name typed here is kept: signing in again no longer replaces it. */
export async function updateOrganizerSettings(
  db: SqlDatabase,
  input: { organizerId: string; values: SettingsInput },
): Promise<void> {
  await db
    .prepare('UPDATE organizers SET display_name = ?1, timezone = ?2, name_edited = 1 WHERE id = ?3')
    .bind(input.values.displayName, input.values.timezone || null, input.organizerId)
    .run();
}

export interface SessionView {
  /** Position in the list, for display only (the real id is never shown). */
  position: number;
  current: boolean;
  signedInAt: number;
  expiresAt: number;
}

/** The person's live sessions, newest first, with the one making this request marked. */
export async function listOrganizerSessions(
  db: SqlDatabase,
  organizerId: string,
  currentToken: string | null,
  now: number,
): Promise<SessionView[]> {
  const currentId = currentToken ? await sha256Hex(currentToken) : null;
  const rows = await allRows<{ id: string; created_at: number; expires_at: number }>(db, {
    sql: `SELECT id, created_at, expires_at FROM organizer_sessions
           WHERE organizer_id = ?1 AND expires_at > ?2 ORDER BY created_at DESC, id`,
    params: [organizerId, now],
  });
  return rows.map((r, i) => ({
    position: i + 1,
    current: r.id === currentId,
    signedInAt: r.created_at,
    expiresAt: r.expires_at,
  }));
}

/** Ends every session of the person except the one making this request. Returns how many were ended. */
export async function endOtherSessions(
  db: SqlDatabase,
  organizerId: string,
  currentToken: string | null,
): Promise<number> {
  if (!currentToken) return 0;
  const result = await db
    .prepare('DELETE FROM organizer_sessions WHERE organizer_id = ?1 AND id != ?2')
    .bind(organizerId, await sha256Hex(currentToken))
    .run();
  return changesOf(result);
}

export interface OrganizerDataExport {
  exportedAt: string;
  account: { email: string; name: string | null; defaultTimeZone: string | null; createdAt: string };
  organizations: Array<{ name: string; role: string; since: string }>;
  signedInDevices: number;
}

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

/** Everything personal Gamo Live holds about the signed-in person. Nothing about other people. */
export async function exportOrganizerData(
  db: SqlDatabase,
  organizerId: string,
  now: number,
): Promise<OrganizerDataExport | null> {
  const person = (
    await allRows<{
      email: string;
      display_name: string | null;
      timezone: string | null;
      created_at: number;
    }>(db, {
      sql: 'SELECT email, display_name, timezone, created_at FROM organizers WHERE id = ?1',
      params: [organizerId],
    })
  )[0];
  if (!person) return null;
  const memberships = await allRows<{ name: string; role: string; created_at: number }>(db, {
    sql: `SELECT g.name, m.role, m.created_at FROM memberships m
            JOIN organizations g ON g.id = m.organization_id
           WHERE m.organizer_id = ?1 ORDER BY g.name`,
    params: [organizerId],
  });
  const sessions = await allRows<{ n: number }>(db, {
    sql: 'SELECT COUNT(*) AS n FROM organizer_sessions WHERE organizer_id = ?1 AND expires_at > ?2',
    params: [organizerId, now],
  });
  return {
    exportedAt: iso(now),
    account: {
      email: person.email,
      name: person.display_name,
      defaultTimeZone: person.timezone,
      createdAt: iso(person.created_at),
    },
    organizations: memberships.map((m) => ({ name: m.name, role: m.role, since: iso(m.created_at) })),
    signedInDevices: sessions[0]?.n ?? 0,
  };
}
