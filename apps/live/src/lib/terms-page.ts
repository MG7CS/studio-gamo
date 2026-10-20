/**
 * The organizer terms an owner accepts before the organization may sell tickets (docs/LIVE_REQUIREMENTS.md §8.1 item
 * 7): the current version, whether this person and any owner accepted it, and recording the acceptance in the
 * existing `terms_acceptances` table (one row per person, document and version; accepting twice changes nothing).
 */
import { TERMS_REGISTRY, type SqlDatabase } from '@gamo/domain';

export const ORGANIZER_TERMS = 'organizer-terms';

export interface TermsView {
  version: string;
  title: string;
  /** Path of the draft on the web app (gamostudio.org). */
  path: string;
  /** When this person accepted the current version (epoch seconds), or null. */
  acceptedAt: number | null;
  /** Some owner of the organization accepted the current version (what selling needs). */
  ownerAccepted: boolean;
}

export async function organizerTermsView(
  db: SqlDatabase,
  input: { organizationId: string; organizerId: string },
): Promise<TermsView> {
  const doc = TERMS_REGISTRY[ORGANIZER_TERMS];
  const row = (await db
    .prepare(
      `SELECT (SELECT accepted_at FROM terms_acceptances WHERE organizer_id = ?2 AND document = ?3 AND version = ?4)
                AS mine,
              EXISTS (SELECT 1 FROM memberships m JOIN terms_acceptances a ON a.organizer_id = m.organizer_id
                       WHERE m.organization_id = ?1 AND m.role = 'owner' AND a.document = ?3 AND a.version = ?4)
                AS owner`,
    )
    .bind(input.organizationId, input.organizerId, ORGANIZER_TERMS, doc.version)
    .first()) as { mine: number | null; owner: number } | null;
  return {
    version: doc.version,
    title: doc.title,
    path: doc.path,
    acceptedAt: row?.mine == null ? null : Number(row.mine),
    ownerAccepted: Number(row?.owner ?? 0) === 1,
  };
}

/**
 * Records that this owner accepted the current organizer terms. Only owners may accept for the organization; the
 * page checks the role, and the insert checks it again so a stale page cannot record it.
 */
export async function acceptOrganizerTerms(
  db: SqlDatabase,
  input: { organizationId: string; organizerId: string; now: number },
): Promise<{ accepted: boolean }> {
  const version = TERMS_REGISTRY[ORGANIZER_TERMS].version;
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO terms_acceptances (organizer_id, document, version, accepted_at)
       SELECT ?1, ?2, ?3, ?4
        WHERE EXISTS (SELECT 1 FROM memberships WHERE organization_id = ?5 AND organizer_id = ?1 AND role = 'owner')`,
    )
    .bind(input.organizerId, ORGANIZER_TERMS, version, input.now, input.organizationId)
    .run();
  if (Number(result.meta?.changes ?? 0) > 0) return { accepted: true };
  const view = await organizerTermsView(db, input);
  return { accepted: view.acceptedAt != null };
}

export const TERMS_FLASH: Record<string, string> = {
  accepted: 'Thank you. The current Organizer Terms are accepted for your organization.',
};

export type AcceptResult = { kind: 'done'; flash: 'accepted' } | { kind: 'error'; error: string };

/** The accept form: the box must be ticked (never pre-ticked); only owners accept. */
export async function runAcceptTerms(input: {
  db: SqlDatabase;
  organizationId: string;
  organizerId: string;
  isOwner: boolean;
  form: FormData;
  now: number;
}): Promise<AcceptResult> {
  if (!input.isOwner)
    return { kind: 'error', error: 'Only an owner of the organization can accept the terms.' };
  if (input.form.get('agree') !== 'yes')
    return { kind: 'error', error: 'Tick the box to confirm you have read and accept the Organizer Terms.' };
  const { accepted } = await acceptOrganizerTerms(input.db, input);
  return accepted
    ? { kind: 'done', flash: 'accepted' }
    : { kind: 'error', error: 'Only an owner of the organization can accept the terms.' };
}
