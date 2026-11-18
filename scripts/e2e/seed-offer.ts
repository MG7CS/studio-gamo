/**
 * Creates one real offer in an app's LOCAL D1 file (after `seed-forms.ts`) and prints `{"token":"..."}` on its last
 * line, so a browser test can open the emailed link. It does what staff do in admin: an approved musician, a church
 * request, an offer for the service. Sample names only; emails go to a fake provider that discards them.
 * Local state only (Miniflare SQLite under apps/<app>/.wrangler); never talks to Cloudflare or Resend.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSqliteD1 } from '../../packages/db/testing.ts';
import type { SqlDatabase } from '../../packages/domain/src/security/sql-database.ts';
import {
  approveApplication,
  createRequestFromSubmission,
  sendOffer,
  type WorshipEnv,
} from '../../packages/domain/src/worship/index.ts';

const app = process.argv[2] ?? 'web';
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const dir = join(root, 'apps', app, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
const file = existsSync(dir)
  ? readdirSync(dir).find((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite')
  : undefined;
if (!file) {
  console.error(`[e2e] seed-offer: no local database for ${app} (run the migrations and seed-forms first)`);
  process.exit(1);
}

const d1 = createSqliteD1(join(dir, file));
const db = d1 as unknown as SqlDatabase;
const now = Math.floor(Date.now() / 1000);
const unique = `${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const env = {
  ENVIRONMENT: 'local',
  RESEND_API_KEY: 're_test_example_key',
  INQUIRY_INBOX_EMAIL: 'inbox@example.invalid',
  PUBLIC_SITE_URL_ADMIN: 'http://127.0.0.1:4326',
  SERVICE_TIME_ZONE: 'America/Phoenix',
} as unknown as WorshipEnv;
const discard = { fetchImpl: (async () => Response.json({ id: 're_discarded' })) as typeof fetch };

function submission(slug: string, binds: Record<string, unknown>): string {
  const form = d1.sqlite
    .prepare('SELECT id, current_version_id AS version FROM forms WHERE slug = ?')
    .get(slug) as { id: string; version: string } | undefined;
  if (!form) throw new Error(`form ${slug} is not published (run seed-forms first)`);
  const id = `fsub_e2e_${slug}_${unique}`;
  d1.sqlite
    .prepare(
      `INSERT INTO form_submissions (id, form_id, form_version_id, reference, status, submitter_name,
         submitter_email_normalized, answers_json, binds_json, idempotency_key, submitted_at)
       VALUES (?, ?, ?, ?, 'new', ?, ?, '{}', ?, ?, ?)`,
    )
    .run(
      id,
      form.id,
      form.version,
      `E2E-${slug}-${unique}`,
      String(binds['contact.name']),
      String(binds['contact.email']).toLowerCase(),
      JSON.stringify(binds),
      `idem-${id}`,
      now,
    );
  return id;
}

const serviceDate = new Date((now + 14 * 86_400) * 1000).toISOString().slice(0, 10);
const musician = submission('worship-apply', {
  'contact.name': 'Sample Musician',
  'contact.email': `musician-${unique}@example.invalid`,
  'contact.phone': '555-0100',
  'roster.roles': ['Drums'],
  'roster.city': 'Phoenix',
  'roster.can_teach': false,
});
const church = submission('worship-request', {
  'request.church_name': 'Sample Church',
  'contact.name': 'Sample Pastor',
  'contact.email': `pastor-${unique}@example.invalid`,
  'contact.phone': '555-0200',
  'request.date': serviceDate,
  'request.start_time': '10:00',
  'request.address': '1 Example Way, Phoenix, AZ 85001',
  'request.roles_needed': ['Drums'],
});

const member = await approveApplication(
  db,
  env,
  { submissionId: musician, staffId: 'e2e_staff', now },
  discard,
);
const request = await createRequestFromSubmission(db, { submissionId: church, now });
const offer = await sendOffer(
  db,
  env,
  {
    requestId: request.id,
    rosterMemberId: member.id,
    role: 'Drums',
    payCents: 15_050,
    staffId: 'e2e_staff',
    siteOrigin: 'http://127.0.0.1:4321',
    now,
  },
  discard,
);
d1.sqlite.close();
console.log(JSON.stringify({ token: offer.url.split('/').pop() }));
