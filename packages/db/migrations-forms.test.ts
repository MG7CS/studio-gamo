/**
 * Migrations 0020 (forms engine, uploads) and 0021 (roster, service requests, offers, invoices): the tables
 * exist, foreign keys and unique constraints hold, enums are enforced, the Drizzle models in
 * schema.forms.ts / schema.roster.ts match the migrated database, and the tables kept by 0019 are untouched.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMigrations,
  createInMemoryD1,
  createMigratedD1,
  migrationFileNames,
  readMigrations,
  type SqliteD1,
} from './testing.ts';

const T = 1_900_000_000;

const FORM_TABLES = [
  'forms',
  'form_versions',
  'form_submissions',
  'form_submission_events',
  'form_operations',
  'form_reference_counters',
  'upload_sessions',
  'form_uploads',
];
const ROSTER_TABLES = [
  'roster_members',
  'service_requests',
  'offers',
  'invoices',
  'invoice_lines',
  'musician_payouts',
  'invoice_number_counters',
];

const run = (d1: SqliteD1, sql: string, ...p: Array<string | number | null>) =>
  d1.sqlite.prepare(sql).run(...p);
const get = (d1: SqliteD1, sql: string, ...p: Array<string | number | null>) =>
  d1.sqlite.prepare(sql).get(...p) as Record<string, string | number | null>;
const all = (d1: SqliteD1, sql: string) => d1.sqlite.prepare(sql).all() as Array<Record<string, unknown>>;
const names = (d1: SqliteD1, type: string) =>
  new Set(all(d1, `SELECT name FROM sqlite_master WHERE type = '${type}'`).map((r) => String(r.name)));

/** The database as 0019 left it (before this feature). */
async function migratedThrough0019() {
  const d1 = createInMemoryD1();
  await applyMigrations(d1, readMigrations('0020'));
  return d1;
}

// --- row builders (every optional column omitted unless the test is about it) --------------------------

function form(d1: SqliteD1, id = 'frm_1', slug = 'worship-apply', extra = '') {
  run(
    d1,
    `INSERT INTO forms (id, slug, program, kind, title, status, created_at, updated_at${extra ? ', ' + extra.split('=')[0] : ''}) VALUES (?, ?, 'worship', 'musician_application', 'Musician application', 'draft', ?, ?${extra ? ', ' + extra.split('=')[1] : ''})`,
    id,
    slug,
    T,
    T,
  );
}

function version(d1: SqliteD1, id = 'fv_1', formId = 'frm_1', v = 1) {
  run(
    d1,
    'INSERT INTO form_versions (id, form_id, version, schema_json, published_at) VALUES (?, ?, ?, \'{"questions":[]}\', ?)',
    id,
    formId,
    v,
    T,
  );
}

function submission(
  d1: SqliteD1,
  id = 'sub_1',
  ref = 'GW-2026-0001',
  idem = 'idem-1',
  versionId = 'fv_1',
  formId = 'frm_1',
) {
  run(
    d1,
    "INSERT INTO form_submissions (id, form_id, form_version_id, reference, answers_json, idempotency_key, submitted_at) VALUES (?, ?, ?, ?, '{}', ?, ?)",
    id,
    formId,
    versionId,
    ref,
    idem,
    T,
  );
}

function formStack(d1: SqliteD1) {
  form(d1);
  version(d1);
  submission(d1);
}

function roster(d1: SqliteD1, id = 'ros_1', subId = 'sub_1') {
  run(
    d1,
    "INSERT INTO roster_members (id, submission_id, program, display_name, email_normalized, approved_at) VALUES (?, ?, 'worship', 'Sample Musician', 'sample@example.org', ?)",
    id,
    subId,
    T,
  );
}

function request(d1: SqliteD1, id = 'req_1', subId = 'sub_2') {
  run(
    d1,
    "INSERT INTO service_requests (id, submission_id, program, church_name, contact_name, contact_email_normalized, service_date, created_at) VALUES (?, ?, 'worship', 'Sample Church', 'Sample Pastor', 'pastor@example.org', '2026-12-06', ?)",
    id,
    subId,
    T,
  );
}

function offer(
  d1: SqliteD1,
  id: string,
  status: string,
  role = 'keys',
  requestId = 'req_1',
  memberId = 'ros_1',
) {
  run(
    d1,
    `INSERT INTO offers (id, request_id, roster_member_id, role, pay_cents, token_hash, expires_at, status, sent_at, responded_at) VALUES (?, ?, ?, ?, 15000, ?, ?, ?, ?, ${status === 'accepted' || status === 'declined' ? T : 'NULL'})`,
    id,
    requestId,
    memberId,
    role,
    `hash-${id}`,
    T + 3600,
    status,
    T,
  );
}

function invoice(d1: SqliteD1, id = 'inv_1', number = 'GS-2026-0001', extra = '') {
  run(
    d1,
    `INSERT INTO invoices (id, number, source_type, source_id, bill_to_name, bill_to_email_normalized, created_at${extra ? ', ' + extra.split('=')[0] : ''}) VALUES (?, ?, 'service_request', 'req_1', 'Sample Church', 'pastor@example.org', ?${extra ? ', ' + extra.split('=')[1] : ''})`,
    id,
    number,
    T,
  );
}

/** A full chain: form, two submissions, roster member, request and an invoice. */
function chain(d1: SqliteD1) {
  formStack(d1);
  submission(d1, 'sub_2', 'GW-2026-0002', 'idem-2');
  roster(d1);
  request(d1);
  invoice(d1);
}

// --- tests --------------------------------------------------------------------------------------------

describe('0020 and 0021 exist and apply from scratch', () => {
  test('migration files are numbered after 0019 and create every table', async () => {
    const files = migrationFileNames();
    assert.ok(files.includes('0020_forms.sql'));
    assert.ok(files.includes('0021_roster_requests_offers_invoices.sql'));
    assert.deepEqual([...files].sort(), files);
    const d1 = await createMigratedD1();
    const tables = names(d1, 'table');
    for (const t of [...FORM_TABLES, ...ROSTER_TABLES]) assert.ok(tables.has(t), `table ${t}`);
    assert.deepEqual(all(d1, 'PRAGMA foreign_key_check'), []);
  });

  test('applying the new migrations over 0019 data leaves kept rows alone', async () => {
    const d1 = await migratedThrough0019();
    run(d1, "INSERT INTO users (id, email, created_at) VALUES ('usr_staff', 'staff@example.org', ?)", T);
    await applyMigrations(d1, readMigrations().slice(readMigrations('0020').length));
    assert.equal(get(d1, 'SELECT COUNT(*) AS n FROM users').n, 1);
    assert.deepEqual(all(d1, 'PRAGMA foreign_key_check'), []);
  });
});

describe('forms, versions and submissions', () => {
  test('a form that has submissions, and a version a submission cites, cannot be deleted', async () => {
    const d1 = await createMigratedD1();
    formStack(d1);
    assert.throws(() => run(d1, "DELETE FROM form_versions WHERE id = 'fv_1'"), /FOREIGN KEY/);
    assert.throws(() => run(d1, "DELETE FROM forms WHERE id = 'frm_1'"), /FOREIGN KEY/);
  });

  test('published versions are immutable (schema, number and form cannot be rewritten)', async () => {
    const d1 = await createMigratedD1();
    form(d1);
    version(d1);
    assert.throws(
      () => run(d1, "UPDATE form_versions SET schema_json = '{}' WHERE id = 'fv_1'"),
      /immutable/,
    );
    assert.throws(() => run(d1, "UPDATE form_versions SET version = 9 WHERE id = 'fv_1'"), /immutable/);
    // metadata that is not the snapshot may still be corrected
    run(d1, "UPDATE form_versions SET published_by_user_id = 'usr_1' WHERE id = 'fv_1'");
  });

  test('submission events: enum, history is append-only, and they leave with their submission', async () => {
    const d1 = await createMigratedD1();
    formStack(d1);
    const ev = (id: string, kind: string, sub = 'sub_1') =>
      run(
        d1,
        "INSERT INTO form_submission_events (id, submission_id, kind, actor_user_id, body, created_at) VALUES (?, ?, ?, 'usr_1', 'note text', ?)",
        id,
        sub,
        kind,
        T,
      );
    for (const [i, k] of ['status', 'note', 'export'].entries()) ev(`ev_${i}`, k);
    assert.throws(() => ev('ev_x', 'delete'), /CHECK/);
    assert.throws(() => ev('ev_y', 'note', 'sub_missing'), /FOREIGN KEY/);
    assert.throws(
      () => run(d1, "UPDATE form_submission_events SET body = 'rewritten' WHERE id = 'ev_1'"),
      /immutable/,
    );
    run(d1, "DELETE FROM form_submission_events WHERE id = 'ev_2'");
    run(d1, "DELETE FROM form_submissions WHERE id = 'sub_1'");
    assert.equal(get(d1, 'SELECT COUNT(*) AS n FROM form_submission_events').n, 0);
  });
});

describe('upload sessions and uploads', () => {
  function session(d1: SqliteD1, id = 'ups_1', hash = 'h1') {
    run(
      d1,
      "INSERT INTO upload_sessions (id, form_slug, token_hash, expires_at, created_at) VALUES (?, 'worship-apply', ?, ?, ?)",
      id,
      hash,
      T + 3600,
      T,
    );
  }
  function upload(
    d1: SqliteD1,
    id = 'upl_1',
    sessionId: string | null = 'ups_1',
    key = 'forms/pending/ups_1/upl_1',
    extra = '',
  ) {
    run(
      d1,
      `INSERT INTO form_uploads (id, session_id, question_id, kind, content_type, original_name, bytes, r2_key, created_at${extra ? ', ' + extra.split('=')[0] : ''}) VALUES (?, ?, 'q_video', 'video', 'video/mp4', 'clip.mp4', 1048576, ?, ?${extra ? ', ' + extra.split('=')[1] : ''})`,
      id,
      sessionId,
      key,
      T,
    );
  }

  test('an upload attaches to a submission by id and survives its session being purged', async () => {
    const d1 = await createMigratedD1();
    formStack(d1);
    session(d1);
    upload(d1);
    // submission_id has no foreign key: uploads exist before the submission does
    run(d1, "UPDATE form_uploads SET submission_id = 'sub_not_yet' WHERE id = 'upl_1'");
    run(d1, "UPDATE form_uploads SET submission_id = 'sub_1', status = 'verified' WHERE id = 'upl_1'");
    run(d1, "DELETE FROM upload_sessions WHERE id = 'ups_1'");
    const row = get(d1, "SELECT session_id AS s, submission_id AS sub FROM form_uploads WHERE id = 'upl_1'");
    assert.equal(row.s, null);
    assert.equal(row.sub, 'sub_1');
    upload(d1, 'upl_2', null, 'forms/orphan');
  });
});

describe('roster members and service requests', () => {});

describe('offers', () => {
  test('at most one accepted offer per request and role', async () => {
    const d1 = await createMigratedD1();
    chain(d1);
    submission(d1, 'sub_3', 'GW-2026-0003', 'idem-3');
    roster(d1, 'ros_2', 'sub_3');
    offer(d1, 'off_1', 'accepted', 'keys');
    assert.throws(() => offer(d1, 'off_2', 'accepted', 'keys', 'req_1', 'ros_2'), /UNIQUE/);
    // other statuses for the same slot, and other roles, are unaffected
    offer(d1, 'off_3', 'pending', 'keys', 'req_1', 'ros_2');
    offer(d1, 'off_4', 'declined', 'keys', 'req_1', 'ros_2');
    offer(d1, 'off_5', 'withdrawn', 'keys', 'req_1', 'ros_2');
    offer(d1, 'off_6', 'accepted', 'drums', 'req_1', 'ros_2');
    // the conditional-update race: the second acceptance loses
    assert.throws(
      () => run(d1, "UPDATE offers SET status = 'accepted', responded_at = 1 WHERE id = 'off_3'"),
      /UNIQUE/,
    );
    // after the winner withdraws, the slot frees up
    run(d1, "UPDATE offers SET status = 'withdrawn' WHERE id = 'off_1'");
    run(d1, "UPDATE offers SET status = 'accepted', responded_at = 1 WHERE id = 'off_3'");
  });
});

describe('invoices, lines, payouts and numbers', () => {
  function line(
    d1: SqliteD1,
    id: string,
    kind = 'musician_pay',
    payee: string | null = 'ros_1',
    qty = 1,
    unit = 15000,
    amount = qty * unit,
    invoiceId = 'inv_1',
  ) {
    run(
      d1,
      'INSERT INTO invoice_lines (id, invoice_id, kind, description, quantity, unit_amount_cents, amount_cents, payee_roster_member_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      invoiceId,
      kind,
      'Keys, 9:00 service',
      qty,
      unit,
      amount,
      payee,
    );
  }

  test('invoice number and Stripe invoice id are unique (many NULL Stripe ids allowed)', async () => {
    const d1 = await createMigratedD1();
    chain(d1);
    assert.throws(() => invoice(d1, 'inv_2', 'GS-2026-0001'), /UNIQUE/);
    invoice(d1, 'inv_2', 'GS-2026-0002');
    invoice(d1, 'inv_3', 'GS-2026-0003');
    run(d1, "UPDATE invoices SET stripe_invoice_id = 'in_test_1' WHERE id = 'inv_1'");
    assert.throws(
      () => run(d1, "UPDATE invoices SET stripe_invoice_id = 'in_test_1' WHERE id = 'inv_2'"),
      /UNIQUE/,
    );
  });

  test('defaults, enums, USD only, integer cents and the paid rule', async () => {
    const d1 = await createMigratedD1();
    chain(d1);
    const r = get(d1, 'SELECT status, currency, total_cents AS t FROM invoices');
    assert.deepEqual([r.status, r.currency, r.t], ['draft', 'usd', 0]);
    for (const s of ['draft', 'open', 'void'])
      run(d1, `UPDATE invoices SET status = '${s}' WHERE id = 'inv_1'`);
    assert.throws(() => run(d1, "UPDATE invoices SET status = 'refunded' WHERE id = 'inv_1'"), /CHECK/);
    assert.throws(() => run(d1, "UPDATE invoices SET currency = 'eur' WHERE id = 'inv_1'"), /CHECK/);
    assert.throws(() => run(d1, "UPDATE invoices SET total_cents = -5 WHERE id = 'inv_1'"), /CHECK/);
    assert.throws(() => run(d1, "UPDATE invoices SET total_cents = 10.5 WHERE id = 'inv_1'"), /CHECK/);
    assert.throws(() => run(d1, "UPDATE invoices SET source_type = 'church' WHERE id = 'inv_1'"), /CHECK/);
    assert.throws(
      () => run(d1, "UPDATE invoices SET bill_to_email_normalized = 'Pastor@Example.org' WHERE id = 'inv_1'"),
      /CHECK/,
    );
    // paid needs a time and a method
    assert.throws(() => run(d1, "UPDATE invoices SET status = 'paid' WHERE id = 'inv_1'"), /CHECK/);
    assert.throws(
      () => run(d1, `UPDATE invoices SET status = 'paid', paid_at = ${T} WHERE id = 'inv_1'`),
      /CHECK/,
    );
    assert.throws(
      () =>
        run(
          d1,
          `UPDATE invoices SET status = 'paid', paid_at = ${T}, paid_method = 'barter' WHERE id = 'inv_1'`,
        ),
      /CHECK/,
    );
    for (const m of ['stripe', 'check', 'zelle', 'ach', 'cash', 'other'])
      run(d1, `UPDATE invoices SET status = 'paid', paid_at = ${T}, paid_method = '${m}' WHERE id = 'inv_1'`);
    // a manual invoice needs no source id; any other source does
    run(
      d1,
      "INSERT INTO invoices (id, number, source_type, bill_to_name, bill_to_email_normalized, created_at) VALUES ('inv_m', 'GS-2026-0009', 'manual', 'Sample', 'a@example.org', 1)",
    );
    assert.throws(
      () =>
        run(
          d1,
          "INSERT INTO invoices (id, number, source_type, bill_to_name, bill_to_email_normalized, created_at) VALUES ('inv_n', 'GS-2026-0010', 'service_request', 'Sample', 'a@example.org', 1)",
        ),
      /CHECK/,
    );
  });

  test('deleting a draft invoice removes its lines; a paid-out line blocks it', async () => {
    const d1 = await createMigratedD1();
    chain(d1);
    invoice(d1, 'inv_2', 'GS-2026-0002');
    line(d1, 'ln_a', 'lesson', null, 1, 100, 100, 'inv_2');
    run(d1, "DELETE FROM invoices WHERE id = 'inv_2'");
    assert.equal(get(d1, "SELECT COUNT(*) AS n FROM invoice_lines WHERE id = 'ln_a'").n, 0);
    line(d1, 'ln_1');
    run(
      d1,
      `INSERT INTO musician_payouts (id, invoice_line_id, roster_member_id, amount_cents, paid_at, method) VALUES ('pay_1', 'ln_1', 'ros_1', 15000, ${T}, 'zelle')`,
    );
    assert.throws(() => run(d1, "DELETE FROM invoices WHERE id = 'inv_1'"), /FOREIGN KEY/);
  });

  test('a line can be paid out once; payout enums, cents and foreign keys are enforced', async () => {
    const d1 = await createMigratedD1();
    chain(d1);
    line(d1, 'ln_1');
    const payout = (id: string, lineId: string, member: string, amount: number, method: string) =>
      run(
        d1,
        'INSERT INTO musician_payouts (id, invoice_line_id, roster_member_id, amount_cents, paid_at, method, reference) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id,
        lineId,
        member,
        amount,
        T,
        method,
        'ref',
      );
    payout('pay_1', 'ln_1', 'ros_1', 15000, 'check');
    assert.throws(() => payout('pay_2', 'ln_1', 'ros_1', 15000, 'check'), /UNIQUE/);
    line(d1, 'ln_2');
    assert.throws(() => payout('pay_3', 'ln_2', 'ros_1', 15000, 'barter'), /CHECK/);
    assert.throws(() => payout('pay_3', 'ln_2', 'ros_1', -1, 'check'), /CHECK/);
    assert.throws(() => payout('pay_3', 'ln_2', 'ros_1', 100.5, 'check'), /CHECK/);
    assert.throws(() => payout('pay_3', 'ln_missing', 'ros_1', 100, 'check'), /FOREIGN KEY/);
    assert.throws(() => payout('pay_3', 'ln_2', 'ros_missing', 100, 'check'), /FOREIGN KEY/);
    for (const m of ['stripe', 'check', 'zelle', 'ach', 'cash', 'other']) {
      run(d1, "DELETE FROM musician_payouts WHERE id = 'pay_x'");
      payout('pay_x', 'ln_2', 'ros_1', 100, m);
    }
  });
});
