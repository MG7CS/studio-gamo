/** Test-only fixtures for the worship services (seed forms and submissions by SQL, fake Resend). */
import { createMigratedD1, type SqliteD1 } from '@gamo/db/testing';
import type { WorshipEnv } from './common.ts';

export const NOW = 1_900_000_000; // 2030-03-17T17:46:40Z
export const PII = 'pii-hash-secret-for-worship-tests-000000001';
export const ENV = {
  ENVIRONMENT: 'production',
  PII_HASH_SECRET: PII,
  RESEND_API_KEY: 're_live_example_key',
  INQUIRY_INBOX_EMAIL: 'inbox@gamostudio.org',
  PUBLIC_SITE_URL_ADMIN: 'https://admin.gamostudio.org',
  SERVICE_TIME_ZONE: 'America/Phoenix',
} as unknown as WorshipEnv;

/** A fake Resend: records every message; each call returns a fresh id. */
export function fakeResend() {
  const calls: Array<{ to: string; subject: string; text: string; html: string }> = [];
  const impl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push({
      to: [body.to].flat().join(','),
      subject: String(body.subject),
      text: String(body.text ?? ''),
      html: String(body.html ?? ''),
    });
    return Response.json({ id: `re_${calls.length}` });
  }) as typeof fetch;
  return { impl, calls, options: { fetchImpl: impl } };
}

export const run = (d1: SqliteD1, sql: string, ...p: Array<string | number | null>) =>
  d1.sqlite.prepare(sql).run(...p);
export const get = (d1: SqliteD1, sql: string, ...p: Array<string | number | null>) =>
  d1.sqlite.prepare(sql).get(...p) as Record<string, unknown> | undefined;
export const all = (d1: SqliteD1, sql: string, ...p: Array<string | number | null>) =>
  d1.sqlite.prepare(sql).all(...p) as Array<Record<string, unknown>>;

export async function newDb() {
  const d1 = await createMigratedD1();
  run(
    d1,
    "INSERT INTO users (id, email, status, created_at) VALUES ('staff_1', 'staff@example.org', 'active', 1)",
  );
  return d1;
}

/** A form of `kind` with one published version; returns its id and version id. */
export function seedForm(d1: SqliteD1, kind: string, program: string) {
  const formId = `frm_${kind}`;
  run(
    d1,
    `INSERT INTO forms (id, slug, program, kind, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'published', 1, 1)`,
    formId,
    `${kind}-slug`,
    program,
    kind,
    `Form ${kind}`,
  );
  run(
    d1,
    `INSERT INTO form_versions (id, form_id, version, schema_json, published_at) VALUES (?, ?, 1, '{"questions":[]}', 1)`,
    `fv_${kind}`,
    formId,
  );
  return { formId, versionId: `fv_${kind}` };
}

let counter = 0;
export function seedSubmission(
  d1: SqliteD1,
  o: {
    kind: string;
    program: string;
    binds: Record<string, unknown>;
    id?: string;
    status?: string;
    email?: string;
  },
) {
  const exists = get(d1, 'SELECT id FROM forms WHERE kind = ?', o.kind);
  const form = exists
    ? { formId: String(exists.id), versionId: `fv_${o.kind}` }
    : seedForm(d1, o.kind, o.program);
  counter += 1;
  const id = o.id ?? `sub_${counter}`;
  run(
    d1,
    `INSERT INTO form_submissions (id, form_id, form_version_id, reference, status, submitter_name, submitter_email_normalized,
       answers_json, binds_json, idempotency_key, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, 1)`,
    id,
    form.formId,
    form.versionId,
    `GW-2030-${String(counter).padStart(4, '0')}`,
    o.status ?? 'new',
    typeof o.binds['contact.name'] === 'string' ? (o.binds['contact.name'] as string) : null,
    o.email ??
      (typeof o.binds['contact.email'] === 'string'
        ? (o.binds['contact.email'] as string).toLowerCase()
        : null),
    JSON.stringify(o.binds),
    `idem_${id}`,
  );
  return id;
}

export const musicianBinds = (over: Record<string, unknown> = {}) => ({
  'contact.name': 'Ana Reyes',
  'contact.email': 'Ana@Example.org',
  'contact.phone': '555-0100',
  'roster.roles': ['Drums', 'Bass'],
  'roster.city': 'Phoenix',
  'roster.can_teach': true,
  ...over,
});

export const requestBinds = (over: Record<string, unknown> = {}) => ({
  'request.church_name': 'Grace Community Church',
  'contact.name': 'Pastor Sam Lee',
  'contact.email': 'Pastor@Grace.example.org',
  'contact.phone': '555-0200',
  'request.date': '2030-03-24',
  'request.start_time': '10:00',
  'request.address': '12 Main St, Phoenix, AZ 85001',
  'request.roles_needed': ['Drums', 'Bass'],
  ...over,
});
