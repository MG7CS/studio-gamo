import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1 } from '@gamo/db/testing';
import { sendSubmissionEmails } from './emails.ts';

const PII = 'pii-hash-secret-for-form-email-tests-000001';
const NOW = 1_900_000_000;
const base = { ENVIRONMENT: 'production', PII_HASH_SECRET: PII, RESEND_API_KEY: 're_live_example_key' };

function resend() {
  const calls: { body: any }[] = [];
  const impl = (async (_u: string | URL | Request, init?: RequestInit) => {
    calls.push({ body: JSON.parse(String(init?.body)) });
    return Response.json({ id: `re_${calls.length}` });
  }) as typeof fetch;
  return { impl, calls };
}

const input = {
  submission: {
    id: 'sub_1',
    reference: 'GW-2026-0001',
    submitterEmail: 'Ana@Example.org',
    submitterName: 'Ana Reyes',
  },
  form: { title: 'Musician application', program: 'worship' },
  adminUrl: 'https://admin.gamostudio.org/submissions/sub_1',
  now: NOW,
};

test('sends a receipt to the submitter and a notice to the inbox; subjects hold no personal data', async () => {
  const db = await createMigratedD1();
  const r = resend();
  const env = { ...base, INQUIRY_INBOX_EMAIL: 'inbox@gamostudio.org' };
  const out = await sendSubmissionEmails(db, env as never, input, { fetchImpl: r.impl });
  assert.equal(out.received.status, 'sent');
  assert.notEqual(out.staff, 'skipped');
  assert.equal(r.calls.length, 2);
  const received = r.calls.find((c) => String(c.body.to).includes('ana@example.org'))!;
  const staff = r.calls.find((c) => String(c.body.to).includes('inbox@gamostudio.org'))!;
  assert.match(received.body.subject, /GW-2026-0001/);
  assert.ok(!/Ana/.test(received.body.subject));
  assert.equal(staff.body.subject, 'New Musician application #GW-2026-0001');
  const reply = staff.body.reply_to ?? staff.body.replyTo;
  assert.ok(String(reply).toLowerCase().includes('ana@example.org'));
  assert.match(staff.body.text, /submissions\/sub_1/);
  const rows = db.sqlite
    .prepare('SELECT kind, idempotency_key, related_id FROM email_log ORDER BY kind')
    .all() as any[];
  assert.deepEqual(
    rows.map((x) => [x.kind, x.idempotency_key, x.related_id]),
    [
      ['form_received', 'form_received:sub_1', 'sub_1'],
      ['form_staff_notice', 'form_staff_notice:sub_1', 'sub_1'],
    ],
  );
});

test('staff notice is skipped (and the receipt still sent) when INQUIRY_INBOX_EMAIL is unset', async () => {
  const db = await createMigratedD1();
  const r = resend();
  const warn = console.warn;
  const logged: string[] = [];
  console.warn = (...a: unknown[]) => void logged.push(a.join(' '));
  try {
    const out = await sendSubmissionEmails(db, base as never, input, { fetchImpl: r.impl });
    assert.equal(out.received.status, 'sent');
    assert.equal(out.staff, 'skipped');
  } finally {
    console.warn = warn;
  }
  assert.equal(r.calls.length, 1);
  const line = logged.find((l) => l.includes('INQUIRY_INBOX_EMAIL'));
  assert.ok(line, 'name-only log');
  assert.ok(!line.includes('ana@example.org') && !line.includes('Ana'));
});

test('a second call is idempotent: nothing more is sent', async () => {
  const db = await createMigratedD1();
  const r = resend();
  const env = { ...base, INQUIRY_INBOX_EMAIL: 'inbox@gamostudio.org' };
  await sendSubmissionEmails(db, env as never, input, { fetchImpl: r.impl });
  const again = await sendSubmissionEmails(
    db,
    env as never,
    { ...input, now: NOW + 5 },
    { fetchImpl: r.impl },
  );
  assert.equal(again.received.deduplicated, true);
  assert.equal((again.staff as { deduplicated: boolean }).deduplicated, true);
  assert.equal(r.calls.length, 2);
});

test('an invalid inbox address is skipped rather than thrown', async () => {
  const db = await createMigratedD1();
  const r = resend();
  const out = await sendSubmissionEmails(
    db,
    { ...base, INQUIRY_INBOX_EMAIL: 'not-an-email' } as never,
    input,
    {
      fetchImpl: r.impl,
    },
  );
  assert.equal(out.staff, 'skipped');
  assert.equal(r.calls.length, 1);
});
