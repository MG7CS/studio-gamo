/**
 * Recording what someone agreed to (design §4.5): one `terms_acceptances` row per document, written in one
 * D1 batch together with the `terms_documents` rows they reference (inserted on first use; content is
 * immutable per version). Marketing consent is separate and opt-in (`marketing_consents`).
 *
 * The caller has already run `guardPublicForm` (which gives `ipHash`) and validated the form; a stale form
 * (an older version than the registry's current one) is refused so nobody is recorded as accepting a text
 * they never saw.
 */
import { PRODUCTS, type Product, type TermsSlug } from '../types/enums.ts';
import { newPrefixedId } from '../security/ids.ts';
import { isPlausibleEmail, normalizeEmail } from '../security/pii-hash.ts';
import { allRows, runBatch, type SqlDatabase, type SqlStatementSpec } from '../security/sql-database.ts';
import { getTermsDocument, termsContentHash } from './registry.ts';

export type TermsAcceptanceErrorCode =
  'UNKNOWN_TERMS' | 'OUTDATED_TERMS' | 'NO_DOCUMENTS' | 'NO_SUBJECT' | 'INVALID_CONTEXT';

/** Thrown for a request that must not be recorded. `message` is safe to show to the visitor. */
export class TermsAcceptanceError extends Error {
  constructor(
    readonly code: TermsAcceptanceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TermsAcceptanceError';
  }
}

const RELOAD_MESSAGE =
  'The terms on this page have changed since it was opened. Please reload the page, review the current terms and try again.';

export interface TermsSubject {
  personId?: string | null;
  userId?: string | null;
  customerProfileId?: string | null;
  email?: string | null;
}

export interface RecordTermsAcceptanceInput {
  /** What the form showed: hidden inputs from `TermsConsent` (`terms_slug` / `terms_version`). */
  documents: readonly { slug: string; version: string }[];
  subject: TermsSubject;
  /** Where it happened, e.g. `order:ord_…`, `registration:reg_…`, `onboarding:live.organizer`. 1–200 chars. */
  context: string;
  ipHash?: string | null;
  /** Epoch seconds. */
  now: number;
}

export interface RecordedAcceptance {
  id: string;
  slug: TermsSlug;
  version: string;
}

function validate(input: RecordTermsAcceptanceInput) {
  if (!input.documents.length) throw new TermsAcceptanceError('NO_DOCUMENTS', RELOAD_MESSAGE);
  const seen = new Set<string>();
  const docs = input.documents.map(({ slug, version }) => {
    const doc = getTermsDocument(slug);
    if (!doc) throw new TermsAcceptanceError('UNKNOWN_TERMS', RELOAD_MESSAGE);
    if (version !== doc.version) throw new TermsAcceptanceError('OUTDATED_TERMS', RELOAD_MESSAGE);
    if (seen.has(slug)) throw new TermsAcceptanceError('UNKNOWN_TERMS', RELOAD_MESSAGE);
    seen.add(slug);
    return doc;
  });
  const email = input.subject.email ? normalizeEmail(input.subject.email) : null;
  if (email !== null && !isPlausibleEmail(email))
    throw new TermsAcceptanceError('NO_SUBJECT', 'Please enter a valid email address.');
  const { personId = null, userId = null, customerProfileId = null } = input.subject;
  if (!personId && !userId && !customerProfileId && !email)
    throw new TermsAcceptanceError('NO_SUBJECT', 'Please enter your email address.');
  if (typeof input.context !== 'string' || input.context.length < 1 || input.context.length > 200)
    throw new TermsAcceptanceError('INVALID_CONTEXT', 'Something went wrong. Please try again.');
  return { docs, email, personId, userId, customerProfileId };
}

/**
 * The statements that record one acceptance per document (and insert the document rows on first use),
 * for callers that must write them in the same D1 batch as their own rows (e.g. an Academy registration
 * that references the acceptance ids). Validates exactly like `recordTermsAcceptance`; throws
 * `TermsAcceptanceError` for unknown slugs, stale versions or a missing subject.
 */
export async function buildTermsAcceptanceStatements(
  input: RecordTermsAcceptanceInput,
): Promise<{ specs: SqlStatementSpec[]; recorded: RecordedAcceptance[] }> {
  const { docs, email, personId, userId, customerProfileId } = validate(input);
  const specs: SqlStatementSpec[] = [];
  const recorded: RecordedAcceptance[] = [];
  for (const doc of docs) {
    specs.push({
      sql: "INSERT INTO terms_documents (id, slug, version, title, status, content_hash, legal_review_status, created_at) VALUES (?1, ?2, ?3, ?4, 'draft', ?5, 'draft_requires_review', ?6) ON CONFLICT(slug, version) DO NOTHING",
      params: [
        newPrefixedId('tdoc'),
        doc.slug,
        doc.version,
        doc.title,
        await termsContentHash(doc),
        input.now,
      ],
    });
    const id = newPrefixedId('tacc');
    specs.push({
      sql: 'INSERT INTO terms_acceptances (id, document_slug, document_version, person_id, user_id, customer_profile_id, email_normalized, context, ip_hash, accepted_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)',
      params: [
        id,
        doc.slug,
        doc.version,
        personId,
        userId,
        customerProfileId,
        email,
        input.context,
        input.ipHash ?? null,
        input.now,
      ],
    });
    recorded.push({ id, slug: doc.slug, version: doc.version });
  }
  return { specs, recorded };
}

/**
 * Writes one acceptance per document (and the document rows on first use) in one transaction.
 * Throws `TermsAcceptanceError` for unknown slugs, stale versions or a missing subject.
 */
export async function recordTermsAcceptance(
  db: SqlDatabase,
  input: RecordTermsAcceptanceInput,
): Promise<RecordedAcceptance[]> {
  const { specs, recorded } = await buildTermsAcceptanceStatements(input);
  await runBatch(db, specs);
  return recorded;
}

/**
 * The slugs (of those asked) that the subject has NOT accepted in their current version — what a gated
 * action must ask for again. Matches on any of the subject's identifiers.
 */
export async function missingTermsAcceptances(
  db: SqlDatabase,
  subject: TermsSubject,
  slugs: readonly TermsSlug[],
): Promise<TermsSlug[]> {
  const clauses: string[] = [];
  const params: (string | null)[] = [];
  const add = (column: string, value: string | null | undefined) => {
    if (!value) return;
    params.push(value);
    clauses.push(`${column} = ?${params.length}`);
  };
  add('person_id', subject.personId);
  add('user_id', subject.userId);
  add('customer_profile_id', subject.customerProfileId);
  add('email_normalized', subject.email ? normalizeEmail(subject.email) : null);
  if (!clauses.length) return [...slugs];
  const rows = await allRows<{ slug: string; version: string }>(db, {
    sql: `SELECT DISTINCT document_slug AS slug, document_version AS version FROM terms_acceptances WHERE ${clauses.join(' OR ')}`,
    params,
  });
  return slugs.filter((slug) => {
    const current = getTermsDocument(slug)?.version;
    return !rows.some((r) => r.slug === slug && r.version === current);
  });
}

export interface RecordMarketingConsentInput {
  email: string;
  product: Product;
  /** true when the (never pre-ticked) box was ticked; false only for an explicit opt-out/unsubscribe. */
  granted: boolean;
  /** Where it happened, e.g. `live.rsvp`, `academy.registration`, `unsubscribe`. 1–100 chars. */
  source: string;
  ipHash?: string | null;
  now: number;
}

/**
 * Appends a marketing-consent row (the latest row per email + product wins). Record a grant only when the
 * box was ticked: an unticked box on a ticket form is not a withdrawal of an earlier choice.
 */
export async function recordMarketingConsent(
  db: SqlDatabase,
  input: RecordMarketingConsentInput,
): Promise<{ id: string }> {
  const email = normalizeEmail(input.email);
  if (!isPlausibleEmail(email))
    throw new TermsAcceptanceError('NO_SUBJECT', 'Please enter a valid email address.');
  if (!(PRODUCTS as readonly string[]).includes(input.product))
    throw new RangeError('recordMarketingConsent: product');
  if (!input.source || input.source.length > 100) throw new RangeError('recordMarketingConsent: source');
  const id = newPrefixedId('mkc');
  await runBatch(db, [
    {
      sql: 'INSERT INTO marketing_consents (id, email_normalized, product, granted, source, ip_hash, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)',
      params: [
        id,
        email,
        input.product,
        input.granted ? 1 : 0,
        input.source,
        input.ipHash ?? null,
        input.now,
      ],
    },
  ]);
  return { id };
}

/** The current choice for an email + product: true, false, or null when never asked. */
export async function currentMarketingConsent(
  db: SqlDatabase,
  email: string,
  product: Product,
): Promise<boolean | null> {
  const rows = await allRows<{ granted: number }>(db, {
    sql: 'SELECT granted FROM marketing_consents WHERE email_normalized = ?1 AND product = ?2 ORDER BY created_at DESC, rowid DESC LIMIT 1',
    params: [normalizeEmail(email), product],
  });
  return rows.length ? Number(rows[0].granted) === 1 : null;
}
