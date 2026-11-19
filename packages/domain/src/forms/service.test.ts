import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1, type SqliteD1 } from '@gamo/db/testing';
import {
  FormAnswersError,
  FormsError,
  FormsService,
  addMonthsUtc,
  csvCell,
  isFormsError,
  type Form,
} from './service.ts';

const T0 = Date.UTC(2026, 5, 1, 12, 0, 0) / 1000; // 2026-06-01
const STAFF = 'stf_a';
type Raw = Record<string, unknown>;
const q = {
  name: (): Raw => ({
    id: 'name',
    type: 'short_text',
    label: 'Your name',
    required: true,
    bind: 'contact.name',
  }),
  email: (): Raw => ({
    id: 'email',
    type: 'short_text',
    label: 'Your email',
    required: true,
    bind: 'contact.email',
    validation: { kind: 'email' },
  }),
  phone: (): Raw => ({
    id: 'phone',
    type: 'short_text',
    label: 'Your phone',
    bind: 'contact.phone',
    validation: { kind: 'phone' },
  }),
};
const schemaOf = (...extra: Raw[]) => ({
  sections: [{ id: 's1', title: 'Your details', questions: [q.name(), q.email(), ...extra] }],
});
async function setup(
  options: {
    kind?: 'contact' | 'church_request' | 'musician_application';
    program?: Form['program'];
    slug?: string;
    retentionMonths?: number;
  } = {},
) {
  const db = await createMigratedD1();
  const forms = new FormsService(db, { now: T0 });
  const form = await forms.create({
    slug: options.slug ?? 'contact',
    program: options.program ?? 'web',
    kind: options.kind ?? 'contact',
    title: 'Contact message',
    retentionMonths: options.retentionMonths,
    staffId: STAFF,
  });
  return { db, forms, form };
}

/** Create a published contact form from `schema`. */
async function published(schema: unknown = schemaOf(), options: Parameters<typeof setup>[0] = {}) {
  const ctx = await setup(options);
  const { revision } = await ctx.forms.saveDraft({
    formId: ctx.form.id,
    schema,
    expectedRevision: ctx.form.revision,
    staffId: STAFF,
  });
  const result = await ctx.forms.publish({ formId: ctx.form.id, expectedRevision: revision, staffId: STAFF });
  return { ...ctx, revision, result };
}

const answers = (name = 'Ana Reyes', email = 'Ana@Example.org'): Record<string, string> => ({ name, email });
let n = 0;
const key = () => `idem-${++n}`;
const count = (db: SqliteD1, table: string) =>
  (db.sqlite.prepare(`SELECT count(*) AS c FROM ${table}`).get() as { c: number }).c;

describe('create', () => {});

describe('draft revision and operations', () => {});

describe('publish and versions', () => {});

describe('submit', () => {
  test('draft and unknown forms are NOT_FOUND; closed is FORM_CLOSED until reopened', async () => {
    const draft = await setup();
    const call = (forms: FormsService, slug = 'contact') =>
      forms.submit({ slug, raw: answers(), uploads: {}, idempotencyKey: key() });
    await assert.rejects(call(draft.forms), (e: unknown) => isFormsError(e) && e.code === 'NOT_FOUND');
    await assert.rejects(
      call(draft.forms, 'nope'),
      (e: unknown) => isFormsError(e) && e.code === 'NOT_FOUND',
    );
    const { forms, form } = await published();
    await forms.close(form.id);
    await assert.rejects(
      call(forms),
      (e: unknown) => e instanceof FormsError && e.code === 'FORM_CLOSED' && e.status === 410,
    );
    await forms.reopen(form.id);
    assert.equal((await call(forms)).created, true);
  });

  test('validation errors throw FormAnswersError with the question ids and store nothing', async () => {
    const { db, forms } = await published();
    let caught: unknown;
    try {
      await forms.submit({
        slug: 'contact',
        raw: { name: '', email: 'not-an-email' },
        uploads: {},
        idempotencyKey: key(),
      });
    } catch (e) {
      caught = e;
    }
    assert.ok(caught instanceof FormAnswersError);
    assert.equal(caught.code, 'ANSWERS_INVALID');
    assert.deepEqual(caught.errors.map((e) => e.questionId).sort(), ['email', 'name']);
    assert.equal(count(db, 'form_submissions'), 0);
    assert.equal(count(db, 'form_reference_counters'), 0);
  });

  test('stores binds, normalised email, phone, answers and the version; ip hash stays internal', async () => {
    const { db, forms, result } = await published(schemaOf(q.phone()));
    const out = await forms.submit({
      slug: 'contact',
      raw: { name: 'Ana Reyes', email: '  Ana@Example.ORG ', phone: '555 010 0100' },
      uploads: {},
      idempotencyKey: key(),
      ipHash: 'iphash',
      now: T0 + 5,
    });
    const s = out.submission;
    assert.equal(s.status, 'new');
    assert.equal(s.formVersionId, result.version.id);
    assert.equal(s.submitterName, 'Ana Reyes');
    assert.equal(s.submitterEmail, 'ana@example.org');
    assert.equal(s.submitterPhone, '555 010 0100');
    assert.equal(s.submittedAt, T0 + 5);
    assert.deepEqual(s.binds, {
      'contact.name': 'Ana Reyes',
      'contact.email': 'ana@example.org',
      'contact.phone': '555 010 0100',
    });
    assert.equal(s.answers.name, 'Ana Reyes');
    assert.equal('ipHash' in s, false);
    const row = db.sqlite.prepare('SELECT ip_hash FROM form_submissions WHERE id = ?').get(s.id) as {
      ip_hash: string;
    };
    assert.equal(row.ip_hash, 'iphash');
    assert.deepEqual(
      { id: out.form.slug, program: out.form.program, kind: out.form.kind },
      { id: 'contact', program: 'web', kind: 'contact' },
    );
  });

  test('the same idempotency key returns the stored submission and creates nothing', async () => {
    const { db, forms, form } = await published();
    const k = key();
    const first = await forms.submit({ slug: 'contact', raw: answers(), uploads: {}, idempotencyKey: k });
    const second = await forms.submit({
      slug: 'contact',
      raw: answers('Someone Else', 'x@example.org'),
      uploads: {},
      idempotencyKey: k,
    });
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.submission.id, first.submission.id);
    assert.equal(second.submission.submitterName, 'Ana Reyes');
    assert.equal(count(db, 'form_submissions'), 1);
    // Still idempotent after the form closes.
    await forms.close(form.id);
    assert.equal(
      (await forms.submit({ slug: 'contact', raw: answers(), uploads: {}, idempotencyKey: k })).created,
      false,
    );
  });

  test('delete_after is now plus the form retention in calendar months, or null', async () => {
    const withRetention = await published(schemaOf(), { retentionMonths: 12 });
    const a = await withRetention.forms.submit({
      slug: 'contact',
      raw: answers(),
      uploads: {},
      idempotencyKey: key(),
      now: T0,
    });
    assert.equal(a.submission.deleteAfter, Date.UTC(2027, 5, 1, 12, 0, 0) / 1000);
    const without = await published(schemaOf());
    const b = await without.forms.submit({
      slug: 'contact',
      raw: answers(),
      uploads: {},
      idempotencyKey: key(),
    });
    assert.equal(b.submission.deleteAfter, null);
    assert.equal(addMonthsUtc(Date.UTC(2026, 0, 31) / 1000, 1), Date.UTC(2026, 1, 28) / 1000);
    assert.equal(addMonthsUtc(Date.UTC(2026, 10, 30) / 1000, 3), Date.UTC(2027, 1, 28) / 1000);
  });
});

describe('inbox', () => {});

describe('status, notes and events', () => {});

describe('retention purge', () => {
  async function aged() {
    const ctx = await published(schemaOf(), { retentionMonths: 1 });
    const ids: Record<string, string> = {};
    for (const status of ['new', 'handled', 'declined', 'spam', 'archived', 'in_review'] as const) {
      const r = await ctx.forms.submit({
        slug: 'contact',
        raw: answers(status, `${status}@example.org`),
        uploads: {},
        idempotencyKey: key(),
        now: T0,
      });
      if (status !== 'new') {
        // `declined` is only valid for applications; set it directly for this retention test.
        if (status === 'declined')
          ctx.db.sqlite
            .prepare("UPDATE form_submissions SET status = 'declined' WHERE id = ?")
            .run(r.submission.id);
        else
          await ctx.forms.setStatus({ submissionId: r.submission.id, status, staffId: STAFF, now: T0 + 1 });
      }
      ids[status] = r.submission.id;
    }
    ctx.db.sqlite
      .prepare(
        `INSERT INTO form_uploads (id, submission_id, question_id, kind, content_type, bytes, r2_key, status, created_at) VALUES ('upl_h', ?, 'photo', 'image', 'image/webp', 5, 'forms/h', 'verified', ?)`,
      )
      .run(ids.handled!, T0);
    return { ...ctx, ids, due: addMonthsUtc(T0, 1) };
  }

  test('deletes only due submissions in declined, spam, archived or handled; files hook runs first', async () => {
    const { db, forms, ids, due } = await aged();
    assert.deepEqual(
      await forms.purgeExpiredSubmissions(due),
      { deleted: 0, ids: [] },
      'not before delete_after',
    );
    const order: string[] = [];
    const result = await forms.purgeExpiredSubmissions(due + 1, {
      beforeDelete: async (hookIds) => {
        const still = db.sqlite
          .prepare(
            `SELECT count(*) AS c FROM form_submissions WHERE id IN (${hookIds.map(() => '?').join(',')})`,
          )
          .get(...hookIds) as { c: number };
        const uploads = db.sqlite.prepare('SELECT count(*) AS c FROM form_uploads').get() as { c: number };
        order.push(`hook:${hookIds.length}:rows=${still.c}:uploads=${uploads.c}`);
      },
    });
    assert.deepEqual(order, ['hook:4:rows=4:uploads=1']);
    assert.equal(result.deleted, 4);
    assert.deepEqual([...result.ids].sort(), [ids.handled, ids.declined, ids.spam, ids.archived].sort());
    const left = db.sqlite.prepare('SELECT status FROM form_submissions ORDER BY status').all() as {
      status: string;
    }[];
    assert.deepEqual(
      left.map((r) => r.status),
      ['in_review', 'new'],
    );
    assert.equal(count(db, 'form_uploads'), 0);
    assert.equal(
      count(db, 'form_submission_events'),
      1,
      'events of deleted submissions are gone; the in_review one keeps its status event',
    );
  });

  test('submissions that a roster member or service request references are kept, and the rest still go', async () => {
    const { db, forms, ids, due } = await aged();
    db.sqlite
      .prepare(
        `INSERT INTO roster_members (id, submission_id, program, display_name, email_normalized, status, approved_at)
         VALUES ('ros_k', ?, 'worship', 'Kept Member', 'kept@example.org', 'active', ?)`,
      )
      .run(ids.archived!, T0);
    db.sqlite
      .prepare(
        `INSERT INTO service_requests (id, submission_id, program, church_name, contact_email_normalized, service_date, created_at)
         VALUES ('req_k', ?, 'worship', 'Kept Church', 'church@example.org', '2030-01-06', ?)`,
      )
      .run(ids.handled!, T0);
    const hooked: string[][] = [];
    const result = await forms.purgeExpiredSubmissions(due + 1, {
      beforeDelete: async (hookIds) => {
        hooked.push([...hookIds]);
      },
    });
    assert.deepEqual([...result.ids].sort(), [ids.declined, ids.spam].sort());
    assert.deepEqual(
      hooked.flat().sort(),
      [ids.declined, ids.spam].sort(),
      'files of kept rows are not touched',
    );
    assert.equal(count(db, 'roster_members'), 1);
    assert.equal(count(db, 'service_requests'), 1);
    assert.equal(count(db, 'form_submissions'), 4);
  });

  test('if the files hook throws nothing is deleted', async () => {
    const { db, forms, due } = await aged();
    await assert.rejects(
      forms.purgeExpiredSubmissions(due + 1, {
        beforeDelete: async () => {
          throw new Error('r2 unavailable');
        },
      }),
      /r2 unavailable/,
    );
    assert.equal(count(db, 'form_submissions'), 6);
    assert.equal(count(db, 'form_uploads'), 1);
  });
});

describe('csv export', () => {
  test('csvCell quotes everything, doubles quotes and neutralises formula starters (incl. full-width)', () => {
    assert.equal(csvCell('plain'), '"plain"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell('a,b\nc'), '"a,b\nc"');
    for (const start of ['=', '+', '-', '@', '\t', '\r', '\n', '＝', '＋', '－', '＠']) {
      assert.equal(
        csvCell(`${start}SUM(1)`),
        `"'${start}SUM(1)"`.replace(/\r/g, '\r'),
        `prefix for U+${start.codePointAt(0)!.toString(16)}`,
      );
    }
    assert.equal(csvCell('-5', { numeric: true }), '"-5"');
    assert.equal(csvCell('=1+1', { numeric: false }), `"'=1+1"`);
    assert.equal(csvCell(''), '""');
    assert.equal(csvCell('ok = fine'), '"ok = fine"');
  });
});

describe('settings', () => {});
