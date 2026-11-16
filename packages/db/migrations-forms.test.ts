/**
 * Migrations 0020 (forms engine, uploads) and 0021 (roster, service requests, offers, invoices): the tables
 * exist, foreign keys and unique constraints hold, enums are enforced, the Drizzle models in
 * schema.forms.ts / schema.roster.ts match the migrated database, and the tables kept by 0019 are untouched.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import {
  applyMigrations,
  createInMemoryD1,
  createMigratedD1,
  migrationFileNames,
  readMigrations,
  type SqliteD1,
} from './testing.ts';
import * as formsSchema from './schema.forms.ts';
import * as rosterSchema from './schema.roster.ts';

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
const userTables = (d1: SqliteD1) => [...names(d1, 'table')].filter((t) => !t.startsWith('sqlite_')).sort();
const columns = (d1: SqliteD1, table: string) =>
  new Set(all(d1, `PRAGMA table_info(${table})`).map((r) => String(r.name)));

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

  test('the tables kept by 0019 are exactly as before and nothing else appears', async () => {
    const before = await migratedThrough0019();
    const after = await createMigratedD1();
    assert.deepEqual(userTables(after), [...userTables(before), ...FORM_TABLES, ...ROSTER_TABLES].sort());
    for (const t of userTables(before)) {
      assert.deepEqual(
        all(after, `PRAGMA table_info(${t})`),
        all(before, `PRAGMA table_info(${t})`),
        `${t} columns unchanged`,
      );
      assert.deepEqual(
        all(after, `PRAGMA foreign_key_list(${t})`),
        all(before, `PRAGMA foreign_key_list(${t})`),
        `${t} foreign keys unchanged`,
      );
    }
  });

  test('applying the new migrations over 0019 data leaves kept rows alone', async () => {
    const d1 = await migratedThrough0019();
    run(d1, "INSERT INTO users (id, email, created_at) VALUES ('usr_staff', 'staff@example.org', ?)", T);
    await applyMigrations(d1, readMigrations().slice(readMigrations('0020').length));
    assert.equal(get(d1, 'SELECT COUNT(*) AS n FROM users').n, 1);
    assert.deepEqual(all(d1, 'PRAGMA foreign_key_check'), []);
  });

  test('every new foreign key points at a real table and the new triggers are single-line', async () => {
    const d1 = await createMigratedD1();
    const tables = names(d1, 'table');
    for (const t of [...FORM_TABLES, ...ROSTER_TABLES])
      for (const fk of all(d1, `PRAGMA foreign_key_list(${t})`))
        assert.ok(tables.has(String(fk.table)), `${t} -> ${String(fk.table)}`);
    for (const sql of readMigrations().slice(readMigrations('0020').length))
      for (const stmt of sql.split('--> statement-breakpoint'))
        if (/CREATE TRIGGER/i.test(stmt)) {
          const body = stmt.split('\n').filter((l) => l.trim() && !l.trim().startsWith('--'));
          assert.equal(body.length, 1, body[0]?.slice(0, 80));
        }
  });

  test('new objects are idempotent to re-apply (IF NOT EXISTS)', async () => {
    const d1 = await createMigratedD1();
    await applyMigrations(d1, readMigrations().slice(readMigrations('0020').length));
    assert.deepEqual(all(d1, 'PRAGMA foreign_key_check'), []);
  });
});

describe('Drizzle models match the migrated tables', () => {
  const models = [...Object.values(formsSchema), ...Object.values(rosterSchema)].filter(
    (v): v is SQLiteTable => is(v, SQLiteTable),
  );

  test('every new table has a model and every model has a table', async () => {
    const modelNames = models.map((m) => getTableName(m)).sort();
    assert.deepEqual(modelNames, [...FORM_TABLES, ...ROSTER_TABLES].sort());
  });

  test('model columns equal database columns, and model foreign keys equal database foreign keys', async () => {
    const d1 = await createMigratedD1();
    for (const model of models) {
      const table = getTableName(model);
      const modelCols = Object.values(getTableColumns(model)).map((c) => c.name);
      assert.deepEqual([...modelCols].sort(), [...columns(d1, table)].sort(), `${table} columns`);
      const dbFks = all(d1, `PRAGMA foreign_key_list(${table})`);
      const modelFks = getTableConfig(model).foreignKeys.map((fk) => {
        const ref = fk.reference();
        return `${ref.columns.map((c) => c.name).join(',')}->${getTableName(ref.foreignTable)}(${ref.foreignColumns.map((c) => c.name).join(',')})`;
      });
      const dbFkSigs = new Map<number, { from: string[]; table: string; to: string[] }>();
      for (const r of dbFks) {
        const id = Number(r.id);
        const e = dbFkSigs.get(id) ?? { from: [], table: String(r.table), to: [] };
        e.from.push(String(r.from));
        e.to.push(String(r.to));
        dbFkSigs.set(id, e);
      }
      const dbSigs = [...dbFkSigs.values()].map((e) => `${e.from.join(',')}->${e.table}(${e.to.join(',')})`);
      assert.deepEqual(modelFks.sort(), dbSigs.sort(), `${table} foreign keys`);
    }
  });

  test('model not-null flags match the database', async () => {
    const d1 = await createMigratedD1();
    for (const model of models) {
      const table = getTableName(model);
      const dbNotNull = new Map(
        all(d1, `PRAGMA table_info(${table})`).map((r) => [
          String(r.name),
          Number(r.notnull) === 1 || Number(r.pk) > 0,
        ]),
      );
      for (const col of Object.values(getTableColumns(model)))
        assert.equal(col.notNull || col.primary, dbNotNull.get(col.name), `${table}.${col.name} not null`);
    }
  });
});

describe('forms, versions and submissions', () => {
  test('slug, reference and idempotency key are unique', async () => {
    const d1 = await createMigratedD1();
    formStack(d1);
    assert.throws(() => form(d1, 'frm_2', 'worship-apply'), /UNIQUE/);
    assert.throws(() => submission(d1, 'sub_2', 'GW-2026-0001', 'idem-2'), /UNIQUE/);
    assert.throws(() => submission(d1, 'sub_2', 'GW-2026-0002', 'idem-1'), /UNIQUE/);
    submission(d1, 'sub_2', 'GW-2026-0002', 'idem-2');
    assert.equal(get(d1, 'SELECT COUNT(*) AS n FROM form_submissions').n, 2);
  });

  test('a form has one row per version number', async () => {
    const d1 = await createMigratedD1();
    form(d1);
    version(d1, 'fv_1', 'frm_1', 1);
    assert.throws(() => version(d1, 'fv_dup', 'frm_1', 1), /UNIQUE/);
    version(d1, 'fv_2', 'frm_1', 2);
    form(d1, 'frm_2', 'other');
    version(d1, 'fv_3', 'frm_2', 1);
  });

  test('versions need a real form, submissions a real form and a version of that same form', async () => {
    const d1 = await createMigratedD1();
    assert.throws(() => version(d1, 'fv_x', 'nope', 1), /FOREIGN KEY/);
    form(d1);
    form(d1, 'frm_2', 'other');
    version(d1);
    assert.throws(() => submission(d1, 'sub_x', 'GW-2026-0009', 'k', 'nope', 'frm_1'), /FOREIGN KEY/);
    assert.throws(() => submission(d1, 'sub_x', 'GW-2026-0009', 'k', 'fv_1', 'nope'), /FOREIGN KEY/);
    // fv_1 belongs to frm_1; a submission to frm_2 cannot cite it
    assert.throws(() => submission(d1, 'sub_x', 'GW-2026-0009', 'k', 'fv_1', 'frm_2'), /FOREIGN KEY/);
  });

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

  test('enums, JSON and normalised email are enforced', async () => {
    const d1 = await createMigratedD1();
    form(d1);
    version(d1);
    assert.throws(() => run(d1, "UPDATE forms SET status = 'archived' WHERE id = 'frm_1'"), /CHECK/);
    run(d1, "UPDATE forms SET status = 'published' WHERE id = 'frm_1'");
    run(d1, "UPDATE forms SET status = 'closed' WHERE id = 'frm_1'");
    assert.throws(() => run(d1, "UPDATE forms SET program = 'live' WHERE id = 'frm_1'"), /CHECK/);
    assert.throws(() => run(d1, "UPDATE forms SET slug = 'Not Lower' WHERE id = 'frm_1'"), /CHECK/);
    assert.throws(
      () => run(d1, "UPDATE forms SET draft_schema_json = 'not json' WHERE id = 'frm_1'"),
      /CHECK/,
    );
    assert.throws(
      () => run(d1, "UPDATE form_versions SET schema_json = 'x' WHERE id = 'fv_1'"),
      /immutable|CHECK/,
    );
    assert.throws(
      () =>
        run(
          d1,
          "INSERT INTO form_versions (id, form_id, version, schema_json, published_at) VALUES ('fv_bad', 'frm_1', 2, 'not json', 1)",
        ),
      /CHECK/,
    );
    assert.throws(
      () =>
        run(
          d1,
          "INSERT INTO form_versions (id, form_id, version, schema_json, published_at) VALUES ('fv_bad', 'frm_1', 0, '{}', 1)",
        ),
      /CHECK/,
    );
    submission(d1);
    for (const status of ['new', 'in_review', 'handled', 'spam', 'archived', 'approved', 'declined']) {
      run(d1, `UPDATE form_submissions SET status = '${status}' WHERE id = 'sub_1'`);
    }
    assert.throws(() => run(d1, "UPDATE form_submissions SET status = 'closed' WHERE id = 'sub_1'"), /CHECK/);
    assert.throws(
      () =>
        run(
          d1,
          "UPDATE form_submissions SET submitter_email_normalized = 'Sample@Example.org' WHERE id = 'sub_1'",
        ),
      /CHECK/,
    );
    assert.throws(
      () => run(d1, "UPDATE form_submissions SET answers_json = '[' WHERE id = 'sub_1'"),
      /CHECK/,
    );
    assert.throws(() => run(d1, "UPDATE form_submissions SET binds_json = '{' WHERE id = 'sub_1'"), /CHECK/);
    run(
      d1,
      "UPDATE form_submissions SET submitter_email_normalized = 'sample@example.org' WHERE id = 'sub_1'",
    );
    assert.equal(get(d1, "SELECT status AS s FROM forms WHERE id = 'frm_1'").s, 'closed');
  });

  test('forms start at revision 1; revision and retention are bounded; versions take a note and hash', async () => {
    const d1 = await createMigratedD1();
    form(d1);
    const f = get(d1, 'SELECT revision, retention_months AS r, updated_by_user_id AS u FROM forms');
    assert.deepEqual([f.revision, f.r, f.u], [1, null, null]);
    run(
      d1,
      "UPDATE forms SET revision = revision + 1, updated_by_user_id = 'usr_1', retention_months = 12 WHERE id = 'frm_1'",
    );
    assert.equal(get(d1, 'SELECT revision AS r FROM forms').r, 2);
    assert.throws(() => run(d1, 'UPDATE forms SET revision = 0'), /CHECK/);
    assert.throws(() => run(d1, 'UPDATE forms SET retention_months = 0'), /CHECK/);
    run(d1, 'UPDATE forms SET retention_months = NULL');
    run(
      d1,
      "INSERT INTO form_versions (id, form_id, version, schema_json, published_at, change_note, content_hash) VALUES ('fv_n', 'frm_1', 1, '{}', 1, 'Added video question', 'sha256-abc')",
    );
    const v = get(d1, "SELECT change_note AS n, content_hash AS h FROM form_versions WHERE id = 'fv_n'");
    assert.deepEqual([v.n, v.h], ['Added video question', 'sha256-abc']);
    assert.throws(
      () => run(d1, "UPDATE form_versions SET content_hash = 'other'"),
      /immutable/,
      'the hash seals the snapshot',
    );
    run(d1, "UPDATE form_versions SET change_note = 'Fixed typo in note'"); // the note may be corrected
  });

  test('form operations are keyed by op_id (a repeated click is refused) and follow their form', async () => {
    const d1 = await createMigratedD1();
    form(d1);
    form(d1, 'frm_2', 'other');
    const op = (id: string, formId: string) =>
      run(
        d1,
        "INSERT INTO form_operations (op_id, form_id, action, created_at) VALUES (?, ?, 'publish', ?)",
        id,
        formId,
        T,
      );
    op('op-1', 'frm_1');
    assert.throws(() => op('op-1', 'frm_1'), /UNIQUE/);
    assert.throws(() => op('op-1', 'frm_2'), /UNIQUE/);
    assert.throws(() => op('op-2', 'frm_missing'), /FOREIGN KEY/);
    assert.throws(
      () =>
        run(
          d1,
          "INSERT INTO form_operations (op_id, form_id, action, created_at) VALUES ('op-3', 'frm_1', '', 1)",
        ),
      /CHECK/,
    );
    op('op-2', 'frm_2');
    run(d1, "DELETE FROM forms WHERE id = 'frm_2'");
    assert.equal(get(d1, 'SELECT COUNT(*) AS n FROM form_operations').n, 1);
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

  test('new submissions default to status new with empty binds', async () => {
    const d1 = await createMigratedD1();
    formStack(d1);
    const row = get(d1, 'SELECT status, binds_json AS b FROM form_submissions');
    assert.equal(row.status, 'new');
    assert.equal(row.b, '{}');
  });

  test('reference counters hold one sequence per prefix and year and cannot go below 1', async () => {
    const d1 = await createMigratedD1();
    run(d1, "INSERT INTO form_reference_counters (prefix_year) VALUES ('GW-2026')");
    assert.equal(
      get(d1, "SELECT next_value AS n FROM form_reference_counters WHERE prefix_year = 'GW-2026'").n,
      1,
    );
    assert.throws(
      () => run(d1, "INSERT INTO form_reference_counters (prefix_year) VALUES ('GW-2026')"),
      /UNIQUE/,
    );
    assert.throws(
      () => run(d1, "INSERT INTO form_reference_counters (prefix_year, next_value) VALUES ('GP-2026', 0)"),
      /CHECK/,
    );
    // the service's atomic increment: upsert and read the value just handed out
    const sql =
      "INSERT INTO form_reference_counters (prefix_year, next_value) VALUES ('GW-2026', 2) ON CONFLICT(prefix_year) DO UPDATE SET next_value = next_value + 1 RETURNING next_value";
    assert.equal(get(d1, sql).next_value, 2);
    assert.equal(get(d1, sql).next_value, 3);
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

  test('session token hash and r2 key are unique; sessions count files from zero', async () => {
    const d1 = await createMigratedD1();
    session(d1);
    assert.throws(() => session(d1, 'ups_2', 'h1'), /UNIQUE/);
    assert.equal(get(d1, 'SELECT file_count AS n FROM upload_sessions').n, 0);
    assert.throws(() => run(d1, "UPDATE upload_sessions SET file_count = -1 WHERE id = 'ups_1'"), /CHECK/);
    upload(d1);
    assert.throws(() => upload(d1, 'upl_2', 'ups_1', 'forms/pending/ups_1/upl_1'), /UNIQUE/);
    assert.throws(() => upload(d1, 'upl_3', 'ups_missing', 'forms/pending/x'), /FOREIGN KEY/);
  });

  test('upload defaults and enums', async () => {
    const d1 = await createMigratedD1();
    session(d1);
    upload(d1);
    const row = get(d1, 'SELECT status, parts_json AS p, submission_id AS s FROM form_uploads');
    assert.equal(row.status, 'started');
    assert.equal(row.p, '[]');
    assert.equal(row.s, null);
    for (const status of ['started', 'uploaded', 'verified', 'rejected', 'deleted'])
      run(d1, `UPDATE form_uploads SET status = '${status}' WHERE id = 'upl_1'`);
    assert.throws(() => run(d1, "UPDATE form_uploads SET status = 'done' WHERE id = 'upl_1'"), /CHECK/);
    for (const kind of ['image', 'video', 'pdf', 'other'])
      run(d1, `UPDATE form_uploads SET kind = '${kind}' WHERE id = 'upl_1'`);
    assert.throws(() => run(d1, "UPDATE form_uploads SET kind = 'audio' WHERE id = 'upl_1'"), /CHECK/);
    assert.throws(() => run(d1, "UPDATE form_uploads SET bytes = -1 WHERE id = 'upl_1'"), /CHECK/);
    assert.throws(() => run(d1, "UPDATE form_uploads SET parts_json = 'nope' WHERE id = 'upl_1'"), /CHECK/);
  });

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

describe('roster members and service requests', () => {
  test('one roster member and one request per submission; the submission must exist', async () => {
    const d1 = await createMigratedD1();
    formStack(d1);
    submission(d1, 'sub_2', 'GW-2026-0002', 'idem-2');
    roster(d1);
    assert.throws(() => roster(d1, 'ros_2', 'sub_1'), /UNIQUE/);
    assert.throws(() => roster(d1, 'ros_3', 'sub_missing'), /FOREIGN KEY/);
    request(d1);
    assert.throws(() => request(d1, 'req_2', 'sub_2'), /UNIQUE/);
    assert.throws(() => request(d1, 'req_3', 'sub_missing'), /FOREIGN KEY/);
    assert.throws(() => run(d1, "DELETE FROM form_submissions WHERE id = 'sub_1'"), /FOREIGN KEY/);
  });

  test('defaults, enums, JSON, normalised emails and date formats', async () => {
    const d1 = await createMigratedD1();
    chain(d1);
    const r = get(d1, 'SELECT status, can_teach AS t, roles_json AS j FROM roster_members');
    assert.deepEqual([r.status, r.t, r.j], ['active', 0, '[]']);
    const q = get(d1, 'SELECT status, roles_needed_json AS j FROM service_requests');
    assert.deepEqual([q.status, q.j], ['new', '[]']);
    for (const s of ['active', 'paused', 'removed']) run(d1, `UPDATE roster_members SET status = '${s}'`);
    assert.throws(() => run(d1, "UPDATE roster_members SET status = 'banned'"), /CHECK/);
    assert.throws(() => run(d1, 'UPDATE roster_members SET can_teach = 2'), /CHECK/);
    assert.throws(
      () => run(d1, "UPDATE roster_members SET email_normalized = 'Sample@Example.org'"),
      /CHECK/,
    );
    assert.throws(() => run(d1, "UPDATE roster_members SET roles_json = '['"), /CHECK/);
    assert.throws(() => run(d1, "UPDATE roster_members SET program = 'live'"), /CHECK/);
    for (const s of ['new', 'matching', 'offered', 'confirmed', 'completed', 'cancelled'])
      run(d1, `UPDATE service_requests SET status = '${s}'`);
    assert.throws(() => run(d1, "UPDATE service_requests SET status = 'open'"), /CHECK/);
    assert.throws(
      () => run(d1, "UPDATE service_requests SET contact_email_normalized = 'Pastor@Example.org'"),
      /CHECK/,
    );
    assert.throws(() => run(d1, "UPDATE service_requests SET service_date = '12/06/2026'"), /CHECK/);
    assert.throws(() => run(d1, "UPDATE service_requests SET service_date = '2026-13-45'"), /CHECK/);
    run(d1, "UPDATE service_requests SET start_time = '09:30'");
    assert.throws(() => run(d1, "UPDATE service_requests SET start_time = '9:30am'"), /CHECK/);
    assert.throws(() => run(d1, "UPDATE service_requests SET start_time = '25:99'"), /CHECK/);
    assert.throws(() => run(d1, "UPDATE service_requests SET roles_needed_json = 'keys'"), /CHECK/);
  });
});

describe('offers', () => {
  test('token hash is unique; statuses, pay and foreign keys are enforced', async () => {
    const d1 = await createMigratedD1();
    chain(d1);
    offer(d1, 'off_1', 'pending');
    assert.throws(
      () =>
        run(
          d1,
          "INSERT INTO offers (id, request_id, roster_member_id, role, pay_cents, token_hash, expires_at, sent_at) VALUES ('off_x', 'req_1', 'ros_1', 'drums', 1, 'hash-off_1', 1, 1)",
        ),
      /UNIQUE/,
    );
    assert.throws(() => offer(d1, 'off_2', 'pending', 'keys', 'req_nope'), /FOREIGN KEY/);
    assert.throws(() => offer(d1, 'off_3', 'pending', 'keys', 'req_1', 'ros_nope'), /FOREIGN KEY/);
    assert.equal(get(d1, "SELECT status AS s FROM offers WHERE id = 'off_1'").s, 'pending');
    for (const s of ['pending', 'declined', 'withdrawn', 'expired', 'accepted'])
      run(d1, `UPDATE offers SET status = '${s}', responded_at = ${T} WHERE id = 'off_1'`);
    assert.throws(() => run(d1, "UPDATE offers SET status = 'maybe' WHERE id = 'off_1'"), /CHECK/);
    assert.throws(() => run(d1, "UPDATE offers SET pay_cents = -1 WHERE id = 'off_1'"), /CHECK/);
    assert.throws(() => run(d1, "UPDATE offers SET pay_cents = 150.5 WHERE id = 'off_1'"), /CHECK/);
    assert.throws(() => run(d1, "UPDATE offers SET responded_at = NULL WHERE id = 'off_1'"), /CHECK/);
  });

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

  test('a second request has its own accepted slot', async () => {
    const d1 = await createMigratedD1();
    chain(d1);
    submission(d1, 'sub_4', 'GW-2026-0004', 'idem-4');
    request(d1, 'req_2', 'sub_4');
    offer(d1, 'off_1', 'accepted', 'keys', 'req_1');
    offer(d1, 'off_2', 'accepted', 'keys', 'req_2');
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

  test('lines: kinds, positive quantity, integer cents and amount = quantity x unit', async () => {
    const d1 = await createMigratedD1();
    chain(d1);
    line(d1, 'ln_1');
    line(d1, 'ln_2', 'lesson', null, 4, 2500);
    line(d1, 'ln_3', 'production', null, 1, 80000);
    line(d1, 'ln_4', 'other', null, 1, 500);
    line(d1, 'ln_5', 'gamo_admin', null, 1, 1000);
    assert.throws(() => line(d1, 'ln_6', 'tip', null), /CHECK/);
    assert.throws(() => line(d1, 'ln_7', 'lesson', null, 0, 100, 0), /CHECK/);
    assert.throws(() => line(d1, 'ln_8', 'lesson', null, 2, 100, 150), /CHECK/);
    assert.throws(() => line(d1, 'ln_9', 'lesson', null, 1, -100, -100), /CHECK/);
    assert.throws(() => line(d1, 'ln_10', 'lesson', null, 1, 100.5, 100.5), /CHECK/);
    assert.throws(() => line(d1, 'ln_11', 'musician_pay', 'ros_missing'), /FOREIGN KEY/);
    assert.throws(() => line(d1, 'ln_12', 'lesson', null, 1, 100, 100, 'inv_missing'), /FOREIGN KEY/);
    // musician pay always names who is paid
    assert.throws(() => line(d1, 'ln_13', 'musician_pay', null), /CHECK/);
    assert.equal(get(d1, 'SELECT COUNT(*) AS n FROM invoice_lines').n, 5);
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

  test('invoice number counters hold one sequence per year', async () => {
    const d1 = await createMigratedD1();
    run(d1, 'INSERT INTO invoice_number_counters (year) VALUES (2026)');
    assert.equal(get(d1, 'SELECT next_value AS n FROM invoice_number_counters WHERE year = 2026').n, 1);
    assert.throws(() => run(d1, 'INSERT INTO invoice_number_counters (year) VALUES (2026)'), /UNIQUE/);
    assert.throws(
      () => run(d1, 'INSERT INTO invoice_number_counters (year, next_value) VALUES (2027, 0)'),
      /CHECK/,
    );
    const sql =
      'INSERT INTO invoice_number_counters (year, next_value) VALUES (2026, 2) ON CONFLICT(year) DO UPDATE SET next_value = next_value + 1 RETURNING next_value';
    assert.equal(get(d1, sql).next_value, 2);
    assert.equal(get(d1, sql).next_value, 3);
  });

  test('indexes for the admin lists exist', async () => {
    const d1 = await createMigratedD1();
    const idx = names(d1, 'index');
    for (const i of [
      'forms_program_status_idx',
      'form_submissions_form_status_idx',
      'form_submissions_status_idx',
      'form_submissions_email_idx',
      'form_uploads_session_idx',
      'form_uploads_submission_idx',
      'upload_sessions_expires_idx',
      'roster_members_status_idx',
      'roster_members_email_idx',
      'service_requests_status_date_idx',
      'service_requests_email_idx',
      'offers_request_idx',
      'offers_member_idx',
      'offers_one_accepted_per_role',
      'invoices_status_created_idx',
      'invoices_email_idx',
      'invoices_source_idx',
      'invoice_lines_invoice_idx',
      'musician_payouts_member_idx',
    ])
      assert.ok(idx.has(i), `index ${i}`);
  });
});
