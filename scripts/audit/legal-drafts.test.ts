/**
 * Draft legal documents (design §4.5): every terms slug has a text, the registry hash is the hash of that
 * text, a text cannot change within a version, the drafts never use forbidden status language, and every
 * legal page shows the "DRAFT — requires legal review" banner.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { TERMS_SLUGS } from '../../packages/domain/src/types/enums.ts';
import { TERMS_DOCUMENTS, TERMS_REGISTRY } from '../../packages/domain/src/terms/registry.ts';
import { syncTermsDocuments } from '../../packages/domain/src/terms/sync.ts';
import { createMigratedD1 } from '../../packages/db/testing.ts';
import {
  LEGAL_DOCUMENT_CONTENT,
  getLegalDocumentContent,
  legalDocumentCanonicalText,
} from '../../packages/ui/src/components/legal/content/index.ts';

/**
 * Every (slug, version) ever published with its text hash. Append a row when you bump a version; never
 * change an existing row (acceptances point at slug + version, so its text must stay what people saw).
 */
const PUBLISHED_VERSIONS: Record<string, Record<string, string>> = {
  'site-terms': {
    '2026-10-18-draft.2': '4b11245915577c29c065ee875e1689f9f315792c9a955ce858d5453dff48588f',
  },
  'privacy-policy': {
    '2026-10-18-draft.2': '1b4f267a5f962991584df2558602287b31d07c6f40bcb70790aebc8068a2262d',
  },
  'ticket-terms': {
    '2026-10-18-draft.2': '616ab80c8dff8cf2f8fe43ae65e25195fab97aaa1ae263e5da6c3e6179e92c10',
  },
  'organizer-terms': {
    '2026-10-18-draft.2': 'ef8a7897690fb9d304375cce45f5fc5ca700b25fd61ce74812949950b5f4316c',
  },
  'provider-terms': {
    '2026-10-18-draft.2': '9f81eb4d39d3147404476153d37ef4b580fbcf203a3a1c77fad874b8d82e2155',
  },
  'academy-enrollment-terms': {
    '2026-10-18-draft.2': '828e9d4ec877cbb186d55572dccb92510e67f328897612fc07085b4b5afc89ae',
  },
  'academy-guardian-consent': {
    '2026-10-18-draft.2': '7e825c193a223b647672ba33423765c4fa0c23e6d3d68520cc00e05694274fdf',
  },
  'academy-child-safety-consent': {
    '2026-10-18-draft.2': 'e83055c744bbc5e1468b7fc7511b4a5012909c7119ef3b1e13b0af9f663715a2',
  },
};

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const allText = (slug: string) => legalDocumentCanonicalText(getLegalDocumentContent(slug)!);
const FORBIDDEN =
  /non-?profit|not-for-profit|501\s*\(c\)|tax[- ]?exempt|tax[- ]?deductible|charit|donat|donor|\bIRS\b/i;

test('every terms slug has a draft text whose slug and title match the registry', () => {
  assert.deepEqual(Object.keys(LEGAL_DOCUMENT_CONTENT).sort(), [...TERMS_SLUGS].sort());
  for (const doc of TERMS_DOCUMENTS) {
    const content = getLegalDocumentContent(doc.slug);
    assert.ok(content, doc.slug);
    assert.equal(content.slug, doc.slug);
    assert.equal(content.title, doc.title);
    assert.ok(content.sections.length >= 3, `${doc.slug}: at least three sections`);
    const ids = content.sections.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, `${doc.slug}: section ids unique`);
    for (const id of ids) assert.match(id, /^[a-z0-9-]+$/);
  }
  assert.equal(getLegalDocumentContent('constructor'), null);
  assert.equal(getLegalDocumentContent('nope'), null);
});

test('registry contentHash is the hash of the text; a text never changes within a published version', () => {
  for (const doc of TERMS_DOCUMENTS) {
    const hash = sha256(allText(doc.slug));
    assert.equal(
      doc.contentHash,
      hash,
      `${doc.slug}: the text changed — bump the version in registry.ts and set contentHash to ${hash}`,
    );
    const published = PUBLISHED_VERSIONS[doc.slug]?.[doc.version];
    assert.ok(published, `${doc.slug}@${doc.version}: add it to PUBLISHED_VERSIONS`);
    assert.equal(published, hash, `${doc.slug}@${doc.version} was published with another text — bump it`);
  }
});

test('drafts use approved status wording only and cover the required points', () => {
  for (const slug of TERMS_SLUGS) {
    const text = allText(slug);
    assert.ok(!FORBIDDEN.test(text), `${slug}: forbidden wording ${text.match(FORBIDDEN)?.[0]}`);
    assert.ok(!/certif/i.test(text), `${slug}: no certification claims`);
  }
  const privacy = allText('privacy-policy');
  for (const point of [
    '30 days',
    '180 days',
    '13 months',
    'Rate-limit counters',
    'hello@gamostudio.org',
    'Cloudflare',
    'Stripe',
    'test mode',
    'Resend',
    'Clerk',
  ])
    assert.ok(privacy.includes(point), `privacy policy mentions ${point}`);
  const tickets = allText('ticket-terms');
  for (const point of ['No resale', 'Transfers', 'Refunds', 'first scan wins', 'personal', 'Cancelled'])
    assert.ok(tickets.toLowerCase().includes(point.toLowerCase()), `ticket terms mention ${point}`);
  const provider = allText('provider-terms');
  for (const point of ['Code of Conduct', 'in person', 'separate line items', 'never affects vetting'])
    assert.ok(provider.includes(point), `provider terms mention ${point}`);
  for (const slug of ['academy-enrollment-terms', 'academy-child-safety-consent'])
    assert.match(allText(slug), /never a birth date|never asks? for a birth date/i);
  assert.match(allText('academy-enrollment-terms'), /Photos/);
  assert.match(allText('site-terms'), /Public Benefit Corporation/);
});

test('every legal page and the components show the DRAFT banner; pages are on demand', () => {
  const banner = readFileSync('packages/ui/src/components/legal/LegalDraftBanner.astro', 'utf8');
  assert.match(banner, /DRAFT — requires legal review/);
  assert.match(banner, /Not yet in effect/);
  const documentComponent = readFileSync('packages/ui/src/components/legal/LegalDocument.astro', 'utf8');
  assert.match(documentComponent, /<LegalDraftBanner[^>]*version=\{version\}/);
  assert.equal((documentComponent.match(/<h1\s/g) ?? []).length, 1);
  const slugPage = readFileSync('apps/web/src/pages/legal/[slug].astro', 'utf8');
  assert.match(slugPage, /<LegalDocument /);
  assert.match(slugPage, /Astro\.rewrite\('\/404'\)/);
  const indexPage = readFileSync('apps/web/src/pages/legal/index.astro', 'utf8');
  assert.match(indexPage, /<LegalDraftBanner/);
  for (const source of [slugPage, indexPage]) assert.doesNotMatch(source, /prerender\s*=\s*true/);
  for (const file of [
    'packages/ui/src/components/legal/LegalDraftBanner.astro',
    'packages/ui/src/components/legal/LegalDocument.astro',
    'packages/ui/src/components/legal/LegalSection.astro',
    'packages/ui/src/components/legal/LegalIndexList.astro',
    'apps/web/src/pages/legal/index.astro',
  ]) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /<script(?![^>]*type="application\/ld\+json")/);
    assert.doesNotMatch(source, /\son[a-z]+=/);
    assert.ok(!FORBIDDEN.test(source), `${file}: forbidden wording`);
  }
});

test('every footer links the legal documents', () => {
  const shared = readFileSync('packages/ui/src/components/SiteFooter.astro', 'utf8');
  const live = readFileSync('apps/live/src/components/LiveFooter.astro', 'utf8');
  for (const footer of [shared, live]) {
    assert.match(footer, /\/legal'/);
    assert.match(footer, /\/legal\/privacy-policy/);
    assert.match(footer, /\/legal\/site-terms/);
  }
  assert.match(live, /\/legal\/ticket-terms/);
});

test('syncTermsDocuments inserts every current version once and never rewrites rows', async () => {
  const db = await createMigratedD1();
  await syncTermsDocuments(db, 1_900_000_000);
  await syncTermsDocuments(db, 1_900_000_100);
  const rows = db.sqlite
    .prepare('SELECT slug, version, content_hash, status, created_at FROM terms_documents ORDER BY slug')
    .all() as { slug: string; version: string; content_hash: string; status: string; created_at: number }[];
  assert.equal(rows.length, TERMS_SLUGS.length);
  for (const row of rows) {
    const doc = TERMS_REGISTRY[row.slug as keyof typeof TERMS_REGISTRY];
    assert.equal(row.version, doc.version);
    assert.equal(row.content_hash, doc.contentHash);
    assert.equal(row.status, 'draft');
    assert.equal(Number(row.created_at), 1_900_000_000);
  }
});
