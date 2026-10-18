import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1 } from '@gamo/db/testing';
import { TERMS_SLUGS } from '../types/enums.ts';
import {
  TERMS_DOCUMENTS,
  TERMS_DRAFT_VERSION,
  TERMS_REGISTRY,
  getTermsDocument,
  termsContentHash,
  termsDocumentsFor,
} from './registry.ts';
import {
  TermsAcceptanceError,
  currentMarketingConsent,
  missingTermsAcceptances,
  recordMarketingConsent,
  recordTermsAcceptance,
} from './acceptance.ts';

const NOW = 1_900_000_000;
const IP_HASH = 'a'.repeat(64);

test('registry: every TERMS_SLUGS document, all drafts requiring legal review, at /legal/<slug>', async () => {
  assert.deepEqual(
    TERMS_DOCUMENTS.map((d) => d.slug),
    [...TERMS_SLUGS],
  );
  for (const doc of TERMS_DOCUMENTS) {
    assert.equal(doc.version, TERMS_DRAFT_VERSION);
    assert.equal(doc.status, 'draft');
    assert.equal(doc.legalReviewStatus, 'draft_requires_review');
    assert.equal(doc.path, `/legal/${doc.slug}`);
    assert.match(doc.version, /^[A-Za-z0-9.-]{1,32}$/);
    assert.match(await termsContentHash(doc), /^[0-9a-f]{64}$/);
    assert.ok(!/non-?profit|tax-?exempt|501\(c\)|donat|charit/i.test(`${doc.title} ${doc.summary}`));
  }
  assert.equal(getTermsDocument('nope'), null);
  assert.deepEqual(
    termsDocumentsFor(['ticket-terms', 'privacy-policy']).map((d) => d.title),
    ['Ticket Terms', 'Privacy Policy'],
  );
  assert.ok(Object.isFrozen(TERMS_REGISTRY));
});

test('recordTermsAcceptance writes documents and acceptances in one batch; repeats reuse the document row', async () => {
  const db = await createMigratedD1();
  const documents = [
    { slug: 'ticket-terms', version: TERMS_DRAFT_VERSION },
    { slug: 'privacy-policy', version: TERMS_DRAFT_VERSION },
  ];
  const first = await recordTermsAcceptance(db, {
    documents,
    subject: { email: ' Sam@Example.org ' },
    context: 'order:ord_sample',
    ipHash: IP_HASH,
    now: NOW,
  });
  assert.deepEqual(
    first.map((r) => r.slug),
    ['ticket-terms', 'privacy-policy'],
  );
  await recordTermsAcceptance(db, {
    documents,
    subject: { email: 'other@example.org' },
    context: 'order:ord_other',
    now: NOW + 5,
  });
  const docs = db.sqlite
    .prepare('SELECT slug, version, status, legal_review_status FROM terms_documents ORDER BY slug')
    .all();
  assert.equal(docs.length, 2);
  assert.deepEqual(
    { ...docs[1] },
    {
      slug: 'ticket-terms',
      version: TERMS_DRAFT_VERSION,
      status: 'draft',
      legal_review_status: 'draft_requires_review',
    },
  );
  const row = db.sqlite
    .prepare('SELECT email_normalized, context, ip_hash, accepted_at FROM terms_acceptances WHERE id = ?')
    .get(first[0].id) as Record<string, unknown>;
  assert.deepEqual(
    { ...row },
    { email_normalized: 'sam@example.org', context: 'order:ord_sample', ip_hash: IP_HASH, accepted_at: NOW },
  );
});

test('unknown slugs, stale versions, duplicates and missing subjects are refused with a reload message; nothing is written', async () => {
  const db = await createMigratedD1();
  const attempt = (
    documents: { slug: string; version: string }[],
    subject: object = { email: 'sam@example.org' },
  ) => recordTermsAcceptance(db, { documents, subject, context: 'order:ord_x', now: NOW });
  const expectCode = async (p: Promise<unknown>, code: string) =>
    assert.rejects(p, (err: unknown) => {
      assert.ok(err instanceof TermsAcceptanceError);
      assert.equal(err.code, code);
      return true;
    });
  await expectCode(attempt([{ slug: 'made-up-terms', version: TERMS_DRAFT_VERSION }]), 'UNKNOWN_TERMS');
  await expectCode(
    attempt([
      { slug: 'ticket-terms', version: TERMS_DRAFT_VERSION },
      { slug: 'privacy-policy', version: '2026-01-01-draft.0' },
    ]),
    'OUTDATED_TERMS',
  );
  await expectCode(
    attempt([
      { slug: 'ticket-terms', version: TERMS_DRAFT_VERSION },
      { slug: 'ticket-terms', version: TERMS_DRAFT_VERSION },
    ]),
    'UNKNOWN_TERMS',
  );
  await expectCode(attempt([]), 'NO_DOCUMENTS');
  await expectCode(attempt([{ slug: 'ticket-terms', version: TERMS_DRAFT_VERSION }], {}), 'NO_SUBJECT');
  await expectCode(
    recordTermsAcceptance(db, {
      documents: [{ slug: 'ticket-terms', version: TERMS_DRAFT_VERSION }],
      subject: { email: 'sam@example.org' },
      context: '',
      now: NOW,
    }),
    'INVALID_CONTEXT',
  );
  await assert.rejects(attempt([{ slug: 'ticket-terms', version: 'old' }]), /reload the page/);
  assert.equal(
    (db.sqlite.prepare('SELECT count(*) AS n FROM terms_acceptances').get() as { n: number }).n,
    0,
  );
});

test('a failed batch rolls back the document rows too (customer profile that does not exist)', async () => {
  const db = await createMigratedD1();
  await assert.rejects(
    recordTermsAcceptance(db, {
      documents: [{ slug: 'ticket-terms', version: TERMS_DRAFT_VERSION }],
      subject: { customerProfileId: 'cus_missing' },
      context: 'order:ord_x',
      now: NOW,
    }),
  );
  assert.equal((db.sqlite.prepare('SELECT count(*) AS n FROM terms_documents').get() as { n: number }).n, 0);
});

test('missingTermsAcceptances lists what must be accepted again', async () => {
  const db = await createMigratedD1();
  await recordTermsAcceptance(db, {
    documents: [{ slug: 'ticket-terms', version: TERMS_DRAFT_VERSION }],
    subject: { email: 'sam@example.org' },
    context: 'order:ord_1',
    now: NOW,
  });
  assert.deepEqual(
    await missingTermsAcceptances(db, { email: 'SAM@example.org' }, ['ticket-terms', 'privacy-policy']),
    ['privacy-policy'],
  );
  assert.deepEqual(await missingTermsAcceptances(db, {}, ['ticket-terms']), ['ticket-terms']);
});

test('marketing consent: separate rows, latest wins, validated', async () => {
  const db = await createMigratedD1();
  assert.equal(await currentMarketingConsent(db, 'sam@example.org', 'live'), null);
  await recordMarketingConsent(db, {
    email: 'Sam@Example.org',
    product: 'live',
    granted: true,
    source: 'live.rsvp',
    ipHash: IP_HASH,
    now: NOW,
  });
  assert.equal(await currentMarketingConsent(db, 'sam@example.org', 'live'), true);
  assert.equal(await currentMarketingConsent(db, 'sam@example.org', 'academy'), null, 'per product');
  await recordMarketingConsent(db, {
    email: 'sam@example.org',
    product: 'live',
    granted: false,
    source: 'unsubscribe',
    now: NOW,
  });
  assert.equal(
    await currentMarketingConsent(db, 'sam@example.org', 'live'),
    false,
    'same second: the later row wins',
  );
  await assert.rejects(
    recordMarketingConsent(db, { email: 'nope', product: 'live', granted: true, source: 'x', now: NOW }),
    TermsAcceptanceError,
  );
  await assert.rejects(
    recordMarketingConsent(db, {
      email: 'sam@example.org',
      product: 'admin' as never,
      granted: true,
      source: 'x',
      now: NOW,
    }),
    RangeError,
  );
});
