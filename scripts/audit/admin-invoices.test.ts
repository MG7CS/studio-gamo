/**
 * Admin invoices (apps/admin): the pure helpers (money, the line-editor form, view-models, notices), the
 * API routes end to end against a migrated SQLite D1 with a real staff session (auth first, same-origin,
 * validation, send in manual and Stripe-test mode, paid / void idempotency, payouts), the registrations
 * list and static guarantees about the Astro screens (escaping, integer cents, semantic tokens only).
 *
 * Money is integer cents everywhere; Stripe is never reached (a stub fetch answers the few test-mode calls);
 * the email outbox runs in its local simulation (`ENVIRONMENT=local`, no Resend key).
 */
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createMigratedD1, type SqliteD1 } from '../../packages/db/testing.ts';
import { createDb } from '../../packages/db/index.ts';
import { createSession } from '../../packages/auth/index.ts';
import { StaffIdentityService } from '../../packages/domain/src/services/staff-identity.ts';
import * as invoicesRoute from '../../apps/admin/src/pages/api/invoices/index.ts';
import * as sendRoute from '../../apps/admin/src/pages/api/invoices/[id]/send.ts';
import * as markPaidRoute from '../../apps/admin/src/pages/api/invoices/[id]/mark-paid.ts';
import * as voidRoute from '../../apps/admin/src/pages/api/invoices/[id]/void.ts';
import * as payoutRoute from '../../apps/admin/src/pages/api/invoice-lines/[id]/payout.ts';
import {
  applyLineAction,
  blankLine,
  buildCreateInput,
  defaultDueDate,
  fieldIdFor,
  isRealIsoDate,
  linesToForm,
  parseInvoiceForm,
  problemsByField,
  problemsFromServiceError,
  MAX_FORM_LINES,
  type InvoiceFormValues,
} from '../../apps/admin/src/lib/invoices/form.ts';
import { centsToDollarsInput, dollarsToCents, formatUsd } from '../../apps/admin/src/lib/invoices/money.ts';
import { INVOICE_NOTICES, invoiceNoticeKey } from '../../apps/admin/src/lib/invoices/notices.ts';
import {
  invoiceActions,
  invoiceDto,
  lineGroups,
  maskEmail,
  sendModeNote,
  sourceLink,
  stripeTestConfigured,
} from '../../apps/admin/src/lib/invoices/view.ts';
import { listRegistrations, registrationLabel } from '../../apps/admin/src/lib/invoices/queries.ts';
import { processNewInvoiceForm } from '../../apps/admin/src/lib/invoices/actions.ts';
import { InvoiceError, InvoiceService } from '../../packages/domain/src/invoices/all.ts';
import { noticeFrom } from '../../apps/admin/src/lib/flash.ts';

const SECRET = 'admin-invoices-test-session-secret-0123456789';
const PII = 'admin-invoices-test-pii-hash-secret-0000001';
const T = 1_900_000_000;

// ---------------------------------------------------------------------------------------------
// World: migrated D1, a staff session, seeded roster / request / offers / registration
// ---------------------------------------------------------------------------------------------

const run = (d1: SqliteD1, sql: string, ...p: Array<string | number | null>) =>
  d1.sqlite.prepare(sql).run(...p);
const rows = (d1: SqliteD1, sql: string, ...p: Array<string | number | null>) =>
  d1.sqlite.prepare(sql).all(...p) as Array<Record<string, string | number | null>>;
const count = (d1: SqliteD1, table: string) =>
  Number((rows(d1, `SELECT COUNT(*) AS n FROM ${table}`)[0] as { n: number }).n);

function seed(d1: SqliteD1) {
  run(
    d1,
    "INSERT INTO forms (id, slug, program, kind, title, status, created_at, updated_at) VALUES ('frm_1', 'f', 'worship', 'musician_application', 'Apply', 'draft', ?, ?)",
    T,
    T,
  );
  run(
    d1,
    "INSERT INTO form_versions (id, form_id, version, schema_json, published_at) VALUES ('fv_1', 'frm_1', 1, '{\"questions\":[]}', ?)",
    T,
  );
  for (const n of [1, 2, 3]) {
    run(
      d1,
      "INSERT INTO form_submissions (id, form_id, form_version_id, reference, answers_json, idempotency_key, submitted_at) VALUES (?, 'frm_1', 'fv_1', ?, '{}', ?, ?)",
      `sub_${n}`,
      `GW-2030-000${n}`,
      `idem-${n}`,
      T,
    );
  }
  run(
    d1,
    "INSERT INTO roster_members (id, submission_id, program, display_name, email_normalized, approved_at) VALUES ('ros_1', 'sub_1', 'worship', 'Sample Pianist', 'p@example.org', ?)",
    T,
  );
  run(
    d1,
    "INSERT INTO roster_members (id, submission_id, program, display_name, email_normalized, approved_at) VALUES ('ros_2', 'sub_2', 'worship', 'Sample Drummer', 'd@example.org', ?)",
    T,
  );
  run(
    d1,
    "INSERT INTO service_requests (id, submission_id, program, church_name, contact_name, contact_email_normalized, service_date, created_at) VALUES ('req_1', 'sub_3', 'worship', 'Sample Church', 'Sample Pastor', 'pastor@example.org', '2030-04-07', ?)",
    T,
  );
  const offer = (id: string, member: string, role: string, pay: number, status: string) =>
    run(
      d1,
      `INSERT INTO offers (id, request_id, roster_member_id, role, pay_cents, token_hash, expires_at, status, sent_at, responded_at) VALUES (?, 'req_1', ?, ?, ?, ?, ?, ?, ?, ${status === 'accepted' ? T : 'NULL'})`,
      id,
      member,
      role,
      pay,
      `hash-${id}`,
      T + 3600,
      status,
      T,
    );
  offer('off_1', 'ros_1', 'keys', 15000, 'accepted');
  offer('off_2', 'ros_2', 'drums', 12000, 'accepted');
  offer('off_3', 'ros_2', 'bass', 9000, 'pending');
}

function seedRegistration(d1: SqliteD1, id: string, over: { email?: string; amount?: number } = {}) {
  if (rows(d1, "SELECT 1 FROM terms_documents WHERE slug = 'site-terms'").length === 0) {
    run(
      d1,
      "INSERT INTO terms_documents (id, slug, version, title, status, content_hash, created_at) VALUES ('td_1', 'site-terms', '1', 'Site Terms', 'active', ?, ?)",
      'a'.repeat(64),
      T,
    );
  }
  const terms = { slug: 'site-terms', version: '1' };
  const customer = `cus_${id}`;
  run(
    d1,
    'INSERT INTO customer_profiles (id, email_normalized, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    customer,
    over.email ?? 'ana@diaspora.org',
    'Sample Parent',
    T,
    T,
  );
  run(
    d1,
    "INSERT INTO terms_acceptances (id, document_slug, document_version, customer_profile_id, context, accepted_at) VALUES (?, ?, ?, ?, 'test', ?)",
    `ta_${id}`,
    terms.slug,
    terms.version,
    customer,
    T,
  );
  run(
    d1,
    `INSERT INTO academy_registrations (id, reference, program_slug, lesson_slug, location, student_first_name, student_age_band, customer_profile_id, status, terms_acceptance_id, amount_cents, idempotency_key, created_at, updated_at)
     VALUES (?, ?, 'piano', 'piano-basics', 'Sample Hall', 'Sample', '18_plus', ?, 'reserved', ?, ?, ?, ?, ?)`,
    id,
    `AC-${id}`,
    customer,
    `ta_${id}`,
    over.amount ?? 8000,
    `idem-${id}`,
    T,
    T,
  );
}

interface World {
  d1: SqliteD1;
  env: Record<string, unknown>;
  cookie: string;
  staffId: string;
}

async function world(envOver: Record<string, unknown> = {}): Promise<World> {
  const d1 = await createMigratedD1();
  seed(d1);
  const env: Record<string, unknown> = {
    ENVIRONMENT: 'local',
    DB: d1,
    SESSION_SECRET: SECRET,
    PII_HASH_SECRET: PII,
    INVOICE_PAYMENT_INSTRUCTIONS:
      'Make checks payable to Gamo Studios, or send Zelle to hello@gamostudio.org.',
    ...envOver,
  };
  const db = createDb(d1 as never);
  const identity = new StaffIdentityService(db);
  const user = await identity.findOrCreateUser('reviewer@example.org', 'Sample Reviewer');
  await identity.assignSystemRole(user.id, 'staff_reviewer');
  const session = await createSession(db, user.id, SECRET);
  return { d1, env, cookie: `__session=${encodeURIComponent(session.cookieValue)}`, staffId: user.id };
}

type Route = Record<string, unknown>;

interface CallOptions {
  method?: 'GET' | 'POST';
  query?: string;
  json?: unknown;
  form?: Record<string, string>;
  cookie?: string | null;
  origin?: string;
  params?: Record<string, string>;
}

async function call(w: World, route: Route, options: CallOptions = {}): Promise<Response> {
  const method = options.method ?? 'POST';
  const headers: Record<string, string> = { origin: options.origin ?? 'http://localhost' };
  const cookie = options.cookie === undefined ? w.cookie : options.cookie;
  if (cookie) headers.cookie = cookie;
  let body: string | undefined;
  if (options.json !== undefined) {
    headers['content-type'] = 'application/json';
    headers.accept = 'application/json';
    body = JSON.stringify(options.json);
  } else if (options.form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(options.form).toString();
  } else if (method === 'GET') {
    headers.accept = 'application/json';
  }
  const request = new Request(`http://localhost/api/x${options.query ?? ''}`, { method, headers, body });
  const handler = route[method] as (ctx: unknown) => Promise<Response>;
  return handler({ request, locals: { runtime: { env: w.env } }, params: options.params ?? {} });
}

const body = async (r: Response) =>
  (await r.json()) as { success: boolean; data?: any; error?: any; meta?: any };

const LINES = [
  {
    kind: 'musician_pay',
    description: 'Musician pay: Sample Pianist (keys)',
    unitAmountCents: 15000,
    payeeRosterMemberId: 'ros_1',
  },
  { kind: 'production', description: 'Sound setup', quantity: 2, unitAmountCents: 2500 },
];

async function createViaApi(w: World, over: Record<string, unknown> = {}): Promise<any> {
  const res = await call(w, invoicesRoute, {
    json: {
      sourceType: 'manual',
      billToName: 'Sample Church',
      billToEmail: 'pastor@example.org',
      dueDate: '2030-04-30',
      lines: LINES,
      ...over,
    },
  });
  const out = await body(res);
  assert.equal(res.status, 200, JSON.stringify(out));
  return out.data;
}

// A stub for the few Stripe test-mode calls (customer, invoice, items, finalize, void).
function stripeStub() {
  const calls: string[] = [];
  let total = 0;
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const path = u.replace('https://api.stripe.com/v1', '');
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${path}`);
    const inv = (status: string, hosted: string | null, due: number) =>
      Response.json({
        id: 'in_1',
        status,
        hosted_invoice_url: hosted,
        amount_due: due,
        amount_paid: 0,
        metadata: {},
      });
    if (u.startsWith('https://api.resend.com')) return Response.json({ id: 're_1' });
    if (path === '/customers') return Response.json({ id: 'cus_1' });
    if (path === '/invoiceitems') {
      const p = new URLSearchParams(String(init?.body ?? ''));
      total += Number(p.get('unit_amount_decimal')) * Number(p.get('quantity'));
      return Response.json({ id: 'ii_1' });
    }
    if (path === '/invoices' && method === 'POST') return inv('draft', null, 0);
    if (path === '/invoices/in_1' && method === 'GET') return inv('draft', null, total);
    if (path === '/invoices/in_1/finalize')
      return inv('open', 'https://invoice.stripe.com/i/test_abc', total);
    if (path === '/invoices/in_1/void') return inv('void', null, 0);
    throw new Error(`unexpected fetch ${method} ${u}`);
  }) as typeof fetch;
  return { impl, calls };
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

describe('money', () => {
  test('formats integer cents as USD and refuses anything else', () => {
    assert.equal(formatUsd(0), '$0.00');
    assert.equal(formatUsd(5), '$0.05');
    assert.equal(formatUsd(12550), '$125.50');
    assert.equal(formatUsd(123456789), '$1,234,567.89');
    assert.equal(formatUsd(12.5), '—');
    assert.equal(formatUsd(Number.NaN), '—');
  });

  test('dollars typed by staff become integer cents without floating point', () => {
    assert.equal(dollarsToCents('125'), 12500);
    assert.equal(dollarsToCents('125.5'), 12550);
    assert.equal(dollarsToCents('125.05'), 12505);
    assert.equal(dollarsToCents(' $1,250.00 '), 125000);
    assert.equal(dollarsToCents('0.29'), 29); // 0.29 * 100 is 28.999... in floating point
    assert.equal(dollarsToCents('19.99'), 1999);
    for (const bad of ['', 'abc', '-5', '1e3', '12.345', '1,2', '$', '.5', '5.', '12 50', '9'.repeat(30)]) {
      assert.equal(dollarsToCents(bad), null, bad);
    }
  });

  test('cents round-trip to a field value', () => {
    for (const c of [0, 1, 99, 100, 12550, 2500000]) assert.equal(dollarsToCents(centsToDollarsInput(c)), c);
    assert.equal(centsToDollarsInput(-1), '');
    assert.equal(centsToDollarsInput(1.5), '');
  });
});

describe('line editor form', () => {
  const values: InvoiceFormValues = {
    sourceType: 'service_request',
    sourceId: 'req_1',
    billToName: 'Sample Church',
    billToEmail: 'pastor@example.org',
    dueDate: '2030-04-30',
    lines: [
      { kind: 'musician_pay', description: 'Pianist', quantity: '1', price: '150.00', payee: 'ros_1' },
      { kind: 'production', description: 'Sound', quantity: '2', price: '25', payee: '' },
    ],
  };

  /** What the browser would post for these values (field names the editor renders). */
  function post(v: InvoiceFormValues, action = 'create'): Record<string, string> {
    const out: Record<string, string> = {
      sourceType: v.sourceType,
      sourceId: v.sourceId,
      billToName: v.billToName,
      billToEmail: v.billToEmail,
      dueDate: v.dueDate,
      line_count: String(v.lines.length),
      action,
    };
    v.lines.forEach((l, i) => {
      out[`line_kind_${i}`] = l.kind;
      out[`line_description_${i}`] = l.description;
      out[`line_quantity_${i}`] = l.quantity;
      out[`line_price_${i}`] = l.price;
      out[`line_payee_${i}`] = l.payee;
    });
    return out;
  }

  test('values round-trip through a post unchanged', () => {
    const parsed = parseInvoiceForm(post(values));
    assert.deepEqual(parsed.values, values);
    assert.deepEqual(parsed.action, { type: 'create' });
  });

  test('add another line keeps every typed value and appends one blank row', () => {
    const parsed = parseInvoiceForm(post(values, 'add_line'));
    assert.deepEqual(parsed.action, { type: 'add_line' });
    const next = applyLineAction(parsed.values, parsed.action);
    assert.equal(next.lines.length, 3);
    assert.deepEqual(next.lines.slice(0, 2), values.lines);
    assert.deepEqual(next.lines[2], blankLine());
    assert.equal(next.billToName, 'Sample Church');
  });

  test('remove line N removes exactly that row, and the last row is replaced by a blank one', () => {
    const parsed = parseInvoiceForm(post(values, 'remove_line_0'));
    assert.deepEqual(parsed.action, { type: 'remove_line', index: 0 });
    const next = applyLineAction(parsed.values, parsed.action);
    assert.deepEqual(next.lines, [values.lines[1]]);
    const last = applyLineAction(next, { type: 'remove_line', index: 0 });
    assert.deepEqual(last.lines, [blankLine()]);
    assert.deepEqual(applyLineAction(values, { type: 'remove_line', index: 9 }), values);
  });

  test('the editor never grows past the line limit', () => {
    let v = { ...values, lines: Array.from({ length: MAX_FORM_LINES }, () => blankLine()) };
    v = applyLineAction(v, { type: 'add_line' });
    assert.equal(v.lines.length, MAX_FORM_LINES);
  });

  test('unknown source types and hostile fields fall back safely', () => {
    const parsed = parseInvoiceForm({
      sourceType: 'evil',
      sourceId: 'x',
      line_count: '9999',
      action: 'remove_line_999999',
      __proto__: 'x',
    });
    assert.equal(parsed.values.sourceType, 'manual');
    assert.equal(parsed.values.sourceId, '');
    assert.equal(parsed.values.lines.length, MAX_FORM_LINES);
    assert.deepEqual(parsed.action, { type: 'create' });
  });

  test('builds the service input with integer cents; blank rows are dropped', () => {
    const withBlank = { ...values, lines: [...values.lines, blankLine()] };
    const built = buildCreateInput(withBlank, { gamoAdminFeeApproved: false });
    assert.ok(built.ok);
    assert.deepEqual(built.input.lines, [
      {
        kind: 'musician_pay',
        description: 'Pianist',
        quantity: 1,
        unitAmountCents: 15000,
        payeeRosterMemberId: 'ros_1',
      },
      { kind: 'production', description: 'Sound', quantity: 2, unitAmountCents: 2500 },
    ]);
    assert.deepEqual(built.rowIndexes, [0, 1]);
    assert.deepEqual(built.input.source, { type: 'service_request', id: 'req_1' });
    assert.ok(built.input.lines.every((l) => Number.isInteger(l.unitAmountCents)));
  });

  test('every problem names the field to focus, and the messages are by field', () => {
    const bad: InvoiceFormValues = {
      sourceType: 'manual',
      sourceId: '',
      billToName: ' ',
      billToEmail: 'not-an-email',
      dueDate: '2030-02-31',
      lines: [
        { kind: 'musician_pay', description: '', quantity: '0', price: '-5', payee: '' },
        { kind: 'gamo_admin', description: 'Fee', quantity: '1', price: '10', payee: '' },
        { kind: 'lesson', description: 'Fine', quantity: '1', price: '12.345', payee: '' },
      ],
    };
    const built = buildCreateInput(bad, { gamoAdminFeeApproved: false });
    assert.ok(!built.ok);
    const ids = built.problems.map((p) => p.fieldId);
    for (const id of [
      'bill-to-name',
      'bill-to-email',
      'due-date',
      fieldIdFor(0, 'description'),
      fieldIdFor(0, 'quantity'),
      fieldIdFor(0, 'price'),
      fieldIdFor(0, 'payee'),
      fieldIdFor(1, 'kind'),
      fieldIdFor(2, 'price'),
    ]) {
      assert.ok(ids.includes(id), `missing ${id} in ${ids.join(', ')}`);
    }
    assert.match(problemsByField(built.problems)[fieldIdFor(1, 'kind')] as string, /not approved/);
    // Approved: the same line is accepted.
    const ok = buildCreateInput(
      { ...bad, billToName: 'A', billToEmail: 'a@b.org', dueDate: '2030-02-28', lines: [bad.lines[1]!] },
      { gamoAdminFeeApproved: true },
    );
    assert.ok(ok.ok);
  });

  test('an invoice with no filled line asks for a line; due dates are real calendar dates', () => {
    const empty = buildCreateInput({ ...values, lines: [blankLine()] }, { gamoAdminFeeApproved: false });
    assert.ok(!empty.ok);
    assert.deepEqual(
      empty.problems.map((p) => p.fieldId),
      ['lines'],
    );
    assert.ok(isRealIsoDate('2030-02-28'));
    assert.ok(!isRealIsoDate('2030-02-30'));
    assert.ok(!isRealIsoDate('30/02/2030'));
    assert.equal(defaultDueDate(T, 30), '2030-04-16');
  });

  test('service field errors map back to the submitted rows', () => {
    const problems = problemsFromServiceError(
      new InvoiceError('INVOICE_INVALID', 'The invoice lines are not valid.', [
        { index: 1, code: 'invalid_amount', message: 'Amount must be a positive whole number of cents.' },
        { index: null, code: 'no_lines', message: 'An invoice needs at least one line.' },
      ]),
      [0, 3],
    );
    assert.deepEqual(
      problems.map((p) => p.fieldId),
      [fieldIdFor(3, 'price'), 'lines'],
    );
    assert.equal(
      problemsFromServiceError(
        new InvoiceError('INVOICE_INVALID', 'Bill-to email is not a valid address.'),
        [],
      )[0]?.fieldId,
      'bill-to-email',
    );
    assert.equal(
      problemsFromServiceError(
        new InvoiceError('INVOICE_INVALID', 'Due date must be a real date (YYYY-MM-DD).'),
        [],
      )[0]?.fieldId,
      'due-date',
    );
  });

  test('prefill lines become form text with at least one row', () => {
    const lines = linesToForm([
      {
        kind: 'musician_pay',
        description: 'P',
        quantity: 1,
        unitAmountCents: 15000,
        payeeRosterMemberId: 'ros_1',
      },
    ]);
    assert.deepEqual(lines, [
      { kind: 'musician_pay', description: 'P', quantity: '1', price: '150.00', payee: 'ros_1' },
    ]);
    assert.deepEqual(linesToForm([]), [blankLine()]);
  });
});

describe('view helpers', () => {
  test('masks emails: first letter of the name and of the domain, and the last label', () => {
    assert.equal(maskEmail('ana@diaspora.org'), 'a***@d***.org');
    assert.equal(maskEmail('Parent.One@Mail.Example.COM'), 'P***@M***.COM');
    assert.equal(maskEmail('x@y'), 'x***@y***');
    assert.equal(maskEmail('broken'), '***');
    assert.equal(maskEmail(null), '—');
    assert.ok(!maskEmail('ana@diaspora.org').includes('diaspora'));
  });

  test('actions follow the status', () => {
    assert.deepEqual(invoiceActions('draft'), {
      send: true,
      resend: false,
      markPaid: false,
      void: true,
      payouts: false,
    });
    assert.deepEqual(invoiceActions('open'), {
      send: false,
      resend: true,
      markPaid: true,
      void: true,
      payouts: false,
    });
    assert.deepEqual(invoiceActions('paid'), {
      send: false,
      resend: false,
      markPaid: false,
      void: false,
      payouts: true,
    });
    assert.deepEqual(invoiceActions('void'), {
      send: false,
      resend: false,
      markPaid: false,
      void: false,
      payouts: false,
    });
  });

  test('stripe test mode is only recognised for real test keys; the send note says so', () => {
    assert.ok(stripeTestConfigured({ STRIPE_SECRET_KEY: 'sk_test_abc123' }));
    assert.ok(stripeTestConfigured({ STRIPE_SECRET_KEY: 'rk_test_abc123' }));
    assert.ok(!stripeTestConfigured({ STRIPE_SECRET_KEY: 'sk_live_abc123' }));
    assert.ok(!stripeTestConfigured({ STRIPE_SECRET_KEY: 'sk_test_placeholder' }));
    assert.ok(!stripeTestConfigured({}));
    assert.match(sendModeNote(true).text, /Stripe is in test mode — no real charges/);
    assert.equal(sendModeNote(true).mode, 'stripe');
    assert.equal(sendModeNote(false).mode, 'manual');
    assert.ok(!/real charges/.test(sendModeNote(false).text));
  });

  test('notice keys are valid redirect keys and every invoice error code has wording', () => {
    for (const [key, notice] of Object.entries(INVOICE_NOTICES)) {
      assert.match(key, /^[a-z0-9-]{1,40}$/, key);
      assert.ok(notice.text.length > 10 && (notice.kind === 'ok' || notice.kind === 'error'), key);
      assert.ok(!/sk_|re_|whsec|cus_|in_[a-z0-9]/i.test(notice.text), `${key}: no ids or keys in notices`);
    }
    for (const code of [
      'INVOICE_NOT_FOUND',
      'LINE_NOT_FOUND',
      'SOURCE_NOT_FOUND',
      'INVOICE_INVALID',
      'INVOICE_STATE',
      'GAMO_ADMIN_NOT_APPROVED',
      'PAYMENT_NOT_CONFIGURED',
      'PAYOUT_EXISTS',
      'STRIPE_FAILED',
      'EMAIL_FAILED',
      'LIVEMODE_REFUSED',
    ] as const) {
      const key = invoiceNoticeKey(new InvoiceError(code, 'x'));
      assert.ok(INVOICE_NOTICES[key], `${code} -> ${key}`);
    }
    assert.equal(invoiceNoticeKey(new Error('boom')), 'error');
    // Only declared keys become notices.
    assert.equal(noticeFrom(new URL('http://x/?notice=__proto__'), INVOICE_NOTICES), null);
    assert.equal(noticeFrom(new URL('http://x/?notice=sent-manual'), INVOICE_NOTICES)?.kind, 'ok');
  });

  test('source links point to the request or registrations, manual has none', () => {
    assert.deepEqual(sourceLink({ sourceType: 'service_request', sourceId: 'req_1' }), {
      label: 'Service request',
      href: '/requests/req_1',
    });
    assert.equal(sourceLink({ sourceType: 'academy_registration', sourceId: 'r' }).href, '/registrations');
    assert.equal(sourceLink({ sourceType: 'manual', sourceId: null }).href, null);
  });
});

// ---------------------------------------------------------------------------------------------
// API: auth and same origin come first
// ---------------------------------------------------------------------------------------------

describe('auth and same origin', () => {
  const calls: Array<[string, Route, CallOptions]> = [
    ['list', invoicesRoute, { method: 'GET' }],
    ['create', invoicesRoute, { json: { sourceType: 'manual' } }],
    ['send', sendRoute, { json: {}, params: { id: 'inv_x' } }],
    ['mark-paid', markPaidRoute, { json: { method: 'check' }, params: { id: 'inv_x' } }],
    ['void', voidRoute, { json: {}, params: { id: 'inv_x' } }],
    ['payout', payoutRoute, { json: { method: 'check' }, params: { id: 'inl_x' } }],
  ];

  test('no staff session: 401 and nothing changes', async () => {
    const w = await world();
    for (const [name, route, options] of calls) {
      const res = await call(w, route, { ...options, cookie: null });
      assert.equal(res.status, 401, name);
      assert.equal((await body(res)).success, false, name);
    }
    assert.equal(count(w.d1, 'invoices'), 0);
  });

  test('a cross-origin write is refused (403) before anything runs', async () => {
    const w = await world();
    const before = count(w.d1, 'invoices');
    for (const [name, route, options] of calls.filter(([, , o]) => o.method !== 'GET')) {
      const res = await call(w, route, { ...options, origin: 'https://evil.example' });
      assert.equal(res.status, 403, name);
    }
    const form = await call(w, invoicesRoute, {
      form: { sourceType: 'manual', billToName: 'X', billToEmail: 'x@example.org' },
      origin: 'https://evil.example',
    });
    assert.equal(form.status, 403);
    assert.equal(count(w.d1, 'invoices'), before);
  });

  test('routes authenticate before reading anything (source order)', () => {
    const route = readFileSync('apps/admin/src/lib/invoices/route.ts', 'utf8');
    assert.ok(route.indexOf('adminApi(context)') < route.indexOf('readInvoiceBody(context.request)'));
    for (const file of [
      'apps/admin/src/pages/api/invoices/index.ts',
      'apps/admin/src/pages/api/invoices/[id]/send.ts',
      'apps/admin/src/pages/api/invoices/[id]/mark-paid.ts',
      'apps/admin/src/pages/api/invoices/[id]/void.ts',
      'apps/admin/src/pages/api/invoice-lines/[id]/payout.ts',
    ]) {
      const src = readFileSync(file, 'utf8');
      assert.match(src.replace(/\s+/g, ' '), /withStaff\( ?context/, file);
      assert.match(src, /export const prerender = false/, file);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// API: create
// ---------------------------------------------------------------------------------------------

describe('create draft', () => {
  test('JSON create returns the invoice with integer cents, ISO times and a numbered draft', async () => {
    const w = await world();
    const inv = await createViaApi(w);
    assert.match(inv.number, /^GS-\d{4}-0001$/);
    assert.equal(inv.status, 'draft');
    assert.equal(inv.totalCents, 15000 + 5000);
    assert.ok(Number.isInteger(inv.totalCents));
    assert.match(inv.createdAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(inv.billToEmail, 'pastor@example.org');
    assert.deepEqual(
      inv.lines.map((l: any) => [l.kind, l.amountCents]),
      [
        ['musician_pay', 15000],
        ['production', 5000],
      ],
    );
    assert.equal(rows(w.d1, 'SELECT created_by_user_id AS u FROM invoices')[0]?.u, w.staffId);
  });

  test('a service request with no lines is prefilled from accepted offers only', async () => {
    const w = await world();
    const inv = await createViaApi(w, {
      sourceType: 'service_request',
      sourceId: 'req_1',
      lines: undefined,
    });
    assert.equal(inv.sourceId, 'req_1');
    assert.equal(inv.lines.length, 2); // the pending offer is not billed
    assert.equal(inv.totalCents, 27000);
    assert.ok(inv.lines.every((l: any) => l.kind === 'musician_pay' && l.payeeRosterMemberId));
    assert.ok(
      !inv.lines.some((l: any) => l.kind === 'gamo_admin'),
      'no administrative line is ever added for you',
    );
  });

  test('Gamo administrative lines are refused until fees are approved, then kept separate', async () => {
    const w = await world();
    const gamo = { kind: 'gamo_admin', description: 'Administrative contribution', unitAmountCents: 1000 };
    const refused = await call(w, invoicesRoute, {
      json: {
        sourceType: 'manual',
        billToName: 'C',
        billToEmail: 'c@example.org',
        dueDate: '2030-04-30',
        lines: [...LINES, gamo],
      },
    });
    assert.equal(refused.status, 400);
    assert.equal((await body(refused)).error.code, 'GAMO_ADMIN_NOT_APPROVED');
    assert.equal(count(w.d1, 'invoices'), 0);

    const approved = await world({ GAMO_ADMIN_FEE_APPROVED: 'true' });
    const inv = await createViaApi(approved, { lines: [...LINES, gamo] });
    assert.equal(inv.totalCents, 15000 + 5000 + 1000);
    const pay = inv.lines.find((l: any) => l.kind === 'musician_pay');
    assert.equal(pay.amountCents, 15000, 'musician pay is never reduced by the contribution');
    // 'TRUE' and '1' do not approve.
    for (const v of ['TRUE', '1', 'yes']) {
      const w2 = await world({ GAMO_ADMIN_FEE_APPROVED: v });
      const r = await call(w2, invoicesRoute, {
        json: {
          sourceType: 'manual',
          billToName: 'C',
          billToEmail: 'c@example.org',
          dueDate: '2030-04-30',
          lines: [gamo],
        },
      });
      assert.equal(r.status, 400, v);
    }
  });

  test('rejects negative or fractional cents, a bad email, a bad date and a missing payee', async () => {
    const w = await world();
    const base = {
      sourceType: 'manual',
      billToName: 'C',
      billToEmail: 'c@example.org',
      dueDate: '2030-04-30',
    };
    const cases: Array<[string, Record<string, unknown>]> = [
      ['negative cents', { lines: [{ kind: 'other', description: 'x', unitAmountCents: -100 }] }],
      ['fractional cents', { lines: [{ kind: 'other', description: 'x', unitAmountCents: 12.5 }] }],
      ['zero cents', { lines: [{ kind: 'other', description: 'x', unitAmountCents: 0 }] }],
      ['text cents', { lines: [{ kind: 'other', description: 'x', unitAmountCents: '100' }] }],
      [
        'bad email',
        { billToEmail: 'nope', lines: [{ kind: 'other', description: 'x', unitAmountCents: 100 }] },
      ],
      [
        'bad date',
        { dueDate: '2030-13-45', lines: [{ kind: 'other', description: 'x', unitAmountCents: 100 }] },
      ],
      ['no lines', { lines: [] }],
      ['payee missing', { lines: [{ kind: 'musician_pay', description: 'x', unitAmountCents: 100 }] }],
      [
        'payee unknown',
        {
          lines: [
            { kind: 'musician_pay', description: 'x', unitAmountCents: 100, payeeRosterMemberId: 'ros_nope' },
          ],
        },
      ],
      ['unknown kind', { lines: [{ kind: 'tip', description: 'x', unitAmountCents: 100 }] }],
      [
        'unknown source',
        { sourceType: 'evil', lines: [{ kind: 'other', description: 'x', unitAmountCents: 100 }] },
      ],
    ];
    for (const [name, over] of cases) {
      const res = await call(w, invoicesRoute, { json: { ...base, ...over } });
      assert.equal(res.status, 400, name);
      assert.equal((await body(res)).success, false, name);
    }
    assert.equal(count(w.d1, 'invoices'), 0);
    assert.equal(count(w.d1, 'invoice_lines'), 0);
  });

  test('a missing request is a 404, a malformed body is a 400', async () => {
    const w = await world();
    const missing = await call(w, invoicesRoute, {
      json: {
        sourceType: 'service_request',
        sourceId: 'req_nope',
        billToName: 'C',
        billToEmail: 'c@example.org',
        dueDate: '2030-04-30',
      },
    });
    assert.equal(missing.status, 404);
    const bad = new Request('http://localhost/api/invoices', {
      method: 'POST',
      headers: { origin: 'http://localhost', cookie: w.cookie, 'content-type': 'application/json' },
      body: '{not json',
    });
    const res = await (invoicesRoute.POST as (c: unknown) => Promise<Response>)({
      request: bad,
      locals: { runtime: { env: w.env } },
      params: {},
    });
    assert.equal(res.status, 400);
  });

  test('a form post to the API uses dollars and answers 303 to the invoice with a notice', async () => {
    const w = await world();
    const res = await call(w, invoicesRoute, {
      form: {
        sourceType: 'manual',
        billToName: 'Sample Church',
        billToEmail: 'pastor@example.org',
        dueDate: '2030-04-30',
        line_count: '2',
        line_kind_0: 'lesson',
        line_description_0: 'Lessons',
        line_quantity_0: '4',
        line_price_0: '19.99',
        line_payee_0: '',
        line_kind_1: 'other',
        line_description_1: '',
        line_quantity_1: '1',
        line_price_1: '',
        line_payee_1: '',
      },
    });
    assert.equal(res.status, 303);
    const id = rows(w.d1, 'SELECT id, total_cents FROM invoices')[0]!;
    assert.equal(res.headers.get('location'), `/invoices/${id.id}?notice=created`);
    assert.equal(id.total_cents, 4 * 1999);

    const bad = await call(w, invoicesRoute, {
      form: { sourceType: 'manual', billToName: '', billToEmail: 'x', line_count: '0' },
    });
    assert.equal(bad.status, 303);
    assert.equal(bad.headers.get('location'), '/invoices/new?notice=invalid');
    assert.equal(count(w.d1, 'invoices'), 1);
  });

  test('page logic: errors keep every typed value; a clean post creates the draft', async () => {
    const w = await world();
    const deps = { env: w.env as never, staffId: w.staffId };
    const post: Record<string, string> = {
      sourceType: 'manual',
      sourceId: '',
      billToName: 'Sample <b>Church</b>',
      billToEmail: 'bad',
      dueDate: '2030-04-30',
      line_count: '1',
      action: 'create',
      line_kind_0: 'lesson',
      line_description_0: 'Lessons <script>alert(1)</script>',
      line_quantity_0: '2',
      line_price_0: '10.999',
      line_payee_0: '',
    };
    const out = await processNewInvoiceForm(post, deps);
    assert.equal(out.kind, 'problems');
    if (out.kind !== 'problems') return;
    assert.deepEqual(out.problems.map((p) => p.fieldId).sort(), ['bill-to-email', 'line-0-price']);
    assert.equal(out.values.billToName, 'Sample <b>Church</b>');
    assert.equal(out.values.lines[0]?.description, 'Lessons <script>alert(1)</script>');
    assert.equal(out.values.lines[0]?.price, '10.999');
    assert.equal(count(w.d1, 'invoices'), 0);

    const added = await processNewInvoiceForm({ ...post, action: 'add_line' }, deps);
    assert.equal(added.kind, 'rerender');
    if (added.kind === 'rerender') assert.equal(added.values.lines.length, 2);

    const ok = await processNewInvoiceForm(
      { ...post, billToEmail: 'ok@example.org', line_price_0: '10.50' },
      deps,
    );
    assert.equal(ok.kind, 'created');
    if (ok.kind === 'created') {
      assert.equal(ok.invoice.totalCents, 2100);
      // Stored text is the raw text; the screens escape it on output (see the static checks).
      assert.equal(ok.invoice.billToName, 'Sample <b>Church</b>');
    }
  });
});

// ---------------------------------------------------------------------------------------------
// API: list
// ---------------------------------------------------------------------------------------------

describe('list', () => {
  test('filters by status and pages with a cursor, newest first', async () => {
    const w = await world();
    const a = await createViaApi(w);
    const b = await createViaApi(w);
    const c = await createViaApi(w);
    await call(w, sendRoute, { json: {}, params: { id: b.id } });
    const all = await body(await call(w, invoicesRoute, { method: 'GET', query: '?limit=2' }));
    assert.equal(all.data.length, 2);
    assert.ok(all.meta.nextCursor);
    const next = await body(
      await call(w, invoicesRoute, {
        method: 'GET',
        query: `?limit=2&cursor=${encodeURIComponent(all.meta.nextCursor)}`,
      }),
    );
    assert.equal(next.data.length, 1);
    assert.equal(next.meta.nextCursor, null);
    assert.deepEqual([...all.data, ...next.data].map((i: any) => i.id).sort(), [a.id, b.id, c.id].sort());
    const open = await body(await call(w, invoicesRoute, { method: 'GET', query: '?status=open' }));
    assert.deepEqual(
      open.data.map((i: any) => i.id),
      [b.id],
    );
    for (const bad of ['?status=weird', '?limit=0', '?limit=101', '?limit=abc', '?cursor=%25%25']) {
      assert.equal((await call(w, invoicesRoute, { method: 'GET', query: bad })).status, 400, bad);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// API: send (manual and Stripe test mode)
// ---------------------------------------------------------------------------------------------

describe('send', () => {
  test('manual mode: the invoice email goes through the outbox and the invoice is open', async () => {
    const w = await world();
    const inv = await createViaApi(w);
    const res = await call(w, sendRoute, { form: {}, params: { id: inv.id } });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), `/invoices/${inv.id}?notice=sent-manual`);
    const row = rows(
      w.d1,
      'SELECT status, stripe_invoice_id, hosted_url FROM invoices WHERE id = ?',
      inv.id,
    )[0]!;
    assert.deepEqual({ ...row }, { status: 'open', stripe_invoice_id: null, hosted_url: null });
    const mail = rows(
      w.d1,
      "SELECT kind, status, related_id, recipient_email FROM email_log WHERE kind = 'invoice_sent'",
    );
    assert.equal(mail.length, 1);
    assert.equal(mail[0]?.related_id, inv.id);
    assert.equal(mail[0]?.recipient_email, 'pastor@example.org');
    assert.ok(['sent', 'queued', 'delivered'].includes(String(mail[0]?.status)), String(mail[0]?.status));
  });

  test('JSON send reports the mode; sending again only retries the email, never a second copy', async () => {
    const w = await world();
    const inv = await createViaApi(w);
    const first = await body(await call(w, sendRoute, { json: {}, params: { id: inv.id } }));
    assert.deepEqual(first.data, { invoiceId: inv.id, mode: 'manual', hostedUrl: null, status: 'open' });
    const again = await call(w, sendRoute, { form: {}, params: { id: inv.id } });
    assert.equal(again.headers.get('location'), `/invoices/${inv.id}?notice=resent`);
    assert.equal(count(w.d1, "email_log WHERE kind = 'invoice_sent'"), 1);
  });

  test('no Stripe key and no manual instructions: 503, and the invoice stays a draft', async () => {
    const w = await world({ INVOICE_PAYMENT_INSTRUCTIONS: undefined });
    const inv = await createViaApi(w);
    const res = await call(w, sendRoute, { json: {}, params: { id: inv.id } });
    assert.equal(res.status, 503);
    assert.equal((await body(res)).error.code, 'PAYMENT_NOT_CONFIGURED');
    assert.equal(rows(w.d1, 'SELECT status FROM invoices')[0]?.status, 'draft');
    const form = await call(w, sendRoute, { form: {}, params: { id: inv.id } });
    assert.equal(form.headers.get('location'), `/invoices/${inv.id}?notice=payment-not-configured`);
  });

  test('Stripe test mode: the hosted link is returned, no key or Stripe id leaks, live keys never reach Stripe', async () => {
    const stub = stripeStub();
    globalThis.fetch = stub.impl;
    const w = await world({
      STRIPE_SECRET_KEY: 'sk_test_adminInvoices123',
      INVOICE_PAYMENT_INSTRUCTIONS: undefined,
    });
    const inv = await createViaApi(w);
    const res = await call(w, sendRoute, { json: {}, params: { id: inv.id } });
    const text = await res.text();
    assert.equal(res.status, 200, text);
    const data = JSON.parse(text).data;
    assert.equal(data.mode, 'stripe');
    assert.equal(data.hostedUrl, 'https://invoice.stripe.com/i/test_abc');
    assert.ok(!text.includes('sk_test_'));
    assert.ok(stub.calls.includes('POST /invoices/in_1/finalize'));
    assert.equal(rows(w.d1, 'SELECT status FROM invoices')[0]?.status, 'open');

    const live = await world({ STRIPE_SECRET_KEY: 'sk_live_adminInvoices123' });
    const liveInv = await createViaApi(live);
    const before = stub.calls.length;
    const liveSend = await call(live, sendRoute, { json: {}, params: { id: liveInv.id } });
    assert.equal(liveSend.status, 200, 'a live key takes the manual path, not Stripe');
    assert.equal((await body(liveSend)).data.mode, 'manual');
    assert.equal(stub.calls.length, before, 'no Stripe call for a live key');
  });

  test('paid, void and unknown invoices cannot be sent', async () => {
    const w = await world();
    const inv = await createViaApi(w);
    await call(w, sendRoute, { json: {}, params: { id: inv.id } });
    await call(w, markPaidRoute, { json: { method: 'check' }, params: { id: inv.id } });
    assert.equal((await call(w, sendRoute, { json: {}, params: { id: inv.id } })).status, 409);
    assert.equal((await call(w, sendRoute, { json: {}, params: { id: 'inv_nope' } })).status, 404);
    const v = await createViaApi(w);
    await call(w, voidRoute, { json: {}, params: { id: v.id } });
    assert.equal((await call(w, sendRoute, { json: {}, params: { id: v.id } })).status, 409);
  });
});

// ---------------------------------------------------------------------------------------------
// API: paid and void
// ---------------------------------------------------------------------------------------------

describe('mark paid and void', () => {
  async function openInvoice(w: World) {
    const inv = await createViaApi(w);
    await call(w, sendRoute, { json: {}, params: { id: inv.id } });
    return inv;
  }

  test('marking paid records method and reference once and sends one receipt', async () => {
    const w = await world();
    const inv = await openInvoice(w);
    const res = await call(w, markPaidRoute, {
      json: { method: 'check', reference: '1042' },
      params: { id: inv.id },
    });
    const out = await body(res);
    assert.equal(res.status, 200);
    assert.equal(out.data.status, 'paid');
    assert.equal(out.data.paidMethod, 'check');
    assert.equal(out.data.paidReference, '1042');
    assert.match(out.data.paidAt, /^\d{4}-/);
    const paidAt = rows(w.d1, 'SELECT paid_at FROM invoices')[0]?.paid_at;

    const again = await call(w, markPaidRoute, {
      json: { method: 'zelle', reference: 'other' },
      params: { id: inv.id },
    });
    assert.equal(again.status, 200, 'repeating is idempotent');
    const unchanged = rows(w.d1, 'SELECT paid_at, paid_method, paid_reference FROM invoices')[0]!;
    assert.deepEqual({ ...unchanged }, { paid_at: paidAt, paid_method: 'check', paid_reference: '1042' });
    assert.equal(count(w.d1, "email_log WHERE kind = 'invoice_paid_receipt'"), 1);

    const form = await call(w, markPaidRoute, { form: { method: 'check' }, params: { id: inv.id } });
    assert.equal(form.headers.get('location'), `/invoices/${inv.id}?notice=already-paid`);
  });

  test('form mark paid answers 303 with the paid notice', async () => {
    const w = await world();
    const inv = await openInvoice(w);
    const res = await call(w, markPaidRoute, {
      form: { method: 'ach', reference: 'TRN-9' },
      params: { id: inv.id },
    });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), `/invoices/${inv.id}?notice=paid`);
  });

  test('a draft, a void invoice, an unknown method or an unknown invoice cannot be marked paid', async () => {
    const w = await world();
    const draft = await createViaApi(w);
    assert.equal(
      (await call(w, markPaidRoute, { json: { method: 'check' }, params: { id: draft.id } })).status,
      409,
    );
    const open = await openInvoice(w);
    assert.equal(
      (await call(w, markPaidRoute, { json: { method: 'bitcoin' }, params: { id: open.id } })).status,
      400,
    );
    assert.equal((await call(w, markPaidRoute, { json: {}, params: { id: open.id } })).status, 400);
    assert.equal(
      (await call(w, markPaidRoute, { json: { method: 'check' }, params: { id: 'inv_nope' } })).status,
      404,
    );
    await call(w, voidRoute, { json: {}, params: { id: open.id } });
    assert.equal(
      (await call(w, markPaidRoute, { json: { method: 'check' }, params: { id: open.id } })).status,
      409,
    );
    assert.equal(rows(w.d1, 'SELECT status FROM invoices WHERE id = ?', draft.id)[0]?.status, 'draft');
  });

  test('void is idempotent, works for draft and open, and refuses paid invoices', async () => {
    const w = await world();
    const draft = await createViaApi(w);
    const res = await call(w, voidRoute, { json: {}, params: { id: draft.id } });
    assert.equal((await body(res)).data.status, 'void');
    assert.equal((await call(w, voidRoute, { json: {}, params: { id: draft.id } })).status, 200);
    const form = await call(w, voidRoute, { form: {}, params: { id: draft.id } });
    assert.equal(form.headers.get('location'), `/invoices/${draft.id}?notice=already-void`);

    const open = await openInvoice(w);
    const voided = await call(w, voidRoute, { form: {}, params: { id: open.id } });
    assert.equal(voided.headers.get('location'), `/invoices/${open.id}?notice=voided`);

    const paid = await openInvoice(w);
    await call(w, markPaidRoute, { json: { method: 'cash' }, params: { id: paid.id } });
    const refused = await call(w, voidRoute, { json: {}, params: { id: paid.id } });
    assert.equal(refused.status, 409);
    const formRefused = await call(w, voidRoute, { form: {}, params: { id: paid.id } });
    assert.equal(formRefused.headers.get('location'), `/invoices/${paid.id}?notice=blocked`);
    assert.equal((await call(w, voidRoute, { json: {}, params: { id: 'inv_nope' } })).status, 404);
  });
});

// ---------------------------------------------------------------------------------------------
// API: payouts
// ---------------------------------------------------------------------------------------------

describe('musician payouts', () => {
  async function paidInvoice(w: World) {
    const inv = await createViaApi(w);
    await call(w, sendRoute, { json: {}, params: { id: inv.id } });
    return inv;
  }
  const lineOf = (inv: any, kind: string) => inv.lines.find((l: any) => l.kind === kind).id as string;

  test('refused until the invoice is paid', async () => {
    const w = await world();
    const inv = await paidInvoice(w);
    const res = await call(w, payoutRoute, {
      json: { method: 'check' },
      params: { id: lineOf(inv, 'musician_pay') },
    });
    assert.equal(res.status, 409);
    assert.equal(count(w.d1, 'musician_payouts'), 0);
  });

  test('one payout per musician pay line, always the full line amount', async () => {
    const w = await world();
    const inv = await paidInvoice(w);
    await call(w, markPaidRoute, { json: { method: 'check' }, params: { id: inv.id } });
    const line = lineOf(inv, 'musician_pay');

    const partial = await call(w, payoutRoute, {
      json: { method: 'check', amountCents: 100 },
      params: { id: line },
    });
    assert.equal(partial.status, 400, 'no partial payouts or deductions');
    assert.equal(count(w.d1, 'musician_payouts'), 0);

    const res = await call(w, payoutRoute, {
      json: { method: 'zelle', reference: 'Z-1' },
      params: { id: line },
    });
    const out = await body(res);
    assert.equal(res.status, 200);
    assert.equal(out.data.amountCents, 15000);
    assert.equal(out.data.invoiceLineId, line);
    assert.ok(out.data.payoutId);

    const second = await call(w, payoutRoute, { json: { method: 'check' }, params: { id: line } });
    assert.equal(second.status, 409);
    assert.equal((await body(second)).error.code, 'PAYOUT_EXISTS');
    assert.equal(count(w.d1, 'musician_payouts'), 1);

    const form = await call(w, payoutRoute, { form: { method: 'check' }, params: { id: line } });
    assert.equal(form.status, 303);
    assert.equal(form.headers.get('location'), `/invoices/${inv.id}?notice=payout-exists#payouts`);
  });

  test('only musician pay lines have payouts; unknown lines are 404; the form answer returns to the invoice', async () => {
    const w = await world();
    const inv = await paidInvoice(w);
    await call(w, markPaidRoute, { json: { method: 'check' }, params: { id: inv.id } });
    const other = await call(w, payoutRoute, {
      json: { method: 'check' },
      params: { id: lineOf(inv, 'production') },
    });
    assert.equal(other.status, 409);
    assert.equal(
      (await call(w, payoutRoute, { json: { method: 'check' }, params: { id: 'inl_nope' } })).status,
      404,
    );
    const ok = await call(w, payoutRoute, {
      form: { method: 'cash', reference: '' },
      params: { id: lineOf(inv, 'musician_pay') },
    });
    assert.equal(ok.headers.get('location'), `/invoices/${inv.id}?notice=payout-recorded#payouts`);
    const bad = await call(w, payoutRoute, {
      json: { method: 'barter' },
      params: { id: lineOf(inv, 'musician_pay') },
    });
    assert.equal(bad.status, 400);
    const payoutRow = rows(
      w.d1,
      'SELECT amount_cents, roster_member_id, recorded_by_user_id FROM musician_payouts',
    )[0]!;
    assert.deepEqual(
      { ...payoutRow },
      { amount_cents: 15000, roster_member_id: 'ros_1', recorded_by_user_id: w.staffId },
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Grouping (the separation rule) and DTO
// ---------------------------------------------------------------------------------------------

describe('detail view-model', () => {
  test('musician pay, Gamo administrative and other lines are separate groups with their own subtotals', async () => {
    const w = await world({ GAMO_ADMIN_FEE_APPROVED: 'true' });
    const inv = await createViaApi(w, {
      lines: [
        ...LINES,
        { kind: 'gamo_admin', description: 'Administrative contribution', unitAmountCents: 1000 },
        { kind: 'lesson', description: 'Lesson', quantity: 3, unitAmountCents: 700 },
      ],
    });
    const detail = await new InvoiceService(w.d1 as never, w.env as never).get(inv.id);
    const groups = lineGroups(detail);
    assert.deepEqual(
      groups.map((g) => [g.key, g.subtotalCents]),
      [
        ['musician_pay', 15000],
        ['gamo_admin', 1000],
        ['other', 5000 + 2100],
      ],
    );
    assert.ok(groups.find((g) => g.key === 'musician_pay')!.lines.every((l) => l.kind === 'musician_pay'));
    assert.ok(groups.find((g) => g.key === 'gamo_admin')!.lines.every((l) => l.kind === 'gamo_admin'));
    assert.equal(
      groups.reduce((s, g) => s + g.subtotalCents, 0),
      detail.totalCents,
    );
    const dto = invoiceDto(detail);
    assert.equal(dto.totalCents, detail.totalCents);
    assert.ok(!('billToEmailNormalized' in dto));
  });
});

// ---------------------------------------------------------------------------------------------
// Registrations list
// ---------------------------------------------------------------------------------------------

describe('registrations list', () => {
  test('lists registrations newest first, pages by keyset, and links an existing invoice', async () => {
    const w = await world();
    for (let i = 1; i <= 27; i++)
      seedRegistration(w.d1, `r${String(i).padStart(2, '0')}`, { email: `p${i}@diaspora.org` });
    run(w.d1, 'UPDATE academy_registrations SET created_at = created_at + rowid');
    const db = w.d1 as never;
    const first = await listRegistrations(db);
    assert.equal(first.items.length, 25);
    assert.ok(first.nextCursor);
    assert.equal(first.items[0]?.reference, 'AC-r27');
    const second = await listRegistrations(db, first.nextCursor);
    assert.equal(second.items.length, 2);
    assert.equal(second.nextCursor, null);
    assert.equal(registrationLabel(first.items[0]!), 'piano basics');
    assert.equal(first.items[0]?.invoiceId, null);

    const svc = new InvoiceService(w.d1 as never, w.env as never);
    const draft = await svc.createDraft({
      ...(await svc.draftFromAcademyRegistration('r27')),
      dueDate: '2030-04-30',
      staffId: w.staffId,
    });
    const linked = (await listRegistrations(db)).items[0]!;
    assert.equal(linked.invoiceId, draft.id);
    assert.equal(linked.invoiceNumber, draft.number);
    assert.equal(draft.totalCents, 8000);
    assert.deepEqual(
      draft.lines.map((l) => l.kind),
      ['lesson'],
    );
  });

  test('the screen masks guardian emails and never prints the full address', () => {
    const src = readFileSync('apps/admin/src/components/invoices/RegistrationsTable.astro', 'utf8');
    assert.match(src, /maskEmail\(row\.email\)/);
    assert.ok(!/\{row\.email\}/.test(src), 'the raw address is never rendered');
    assert.equal(maskEmail('ana@diaspora.org'), 'a***@d***.org');
    const page = readFileSync('apps/admin/src/pages/registrations/index.astro', 'utf8');
    assert.match(page, /RegistrationsTable/);
    assert.ok(!/<form|method="post"/i.test(page + src), 'the registrations list is read-only');
    assert.match(src, /\/invoices\/new\?registrationId=/);
  });
});

// ---------------------------------------------------------------------------------------------
// Static guarantees about the screens
// ---------------------------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

describe('screens', () => {
  const astroFiles = [
    ...walk('apps/admin/src/components/invoices'),
    'apps/admin/src/pages/invoices/index.astro',
    'apps/admin/src/pages/invoices/new.astro',
    'apps/admin/src/pages/invoices/[id].astro',
    'apps/admin/src/pages/registrations/index.astro',
  ].filter((f) => f.endsWith('.astro'));
  /** Source with whitespace collapsed, so assertions survive Prettier's line wrapping. */
  const source = (f: string) => readFileSync(f, 'utf8').replace(/\s+/g, ' ');

  test('every screen starts with adminPage and returns its Response', () => {
    for (const f of astroFiles.filter((p) => p.includes('/pages/'))) {
      const s = source(f);
      assert.match(s, /await adminPage\(Astro\)/, f);
      assert.match(s, /if \(error instanceof Response\) return error;/, f);
      assert.match(s, /export const prerender = false/, f);
    }
  });

  test('output is escaped: no set:html, innerHTML or inline scripts and handlers', () => {
    for (const f of astroFiles) {
      const s = source(f);
      assert.ok(!/set:html|innerHTML|dangerouslySetInnerHTML|<script|\son[a-z]+=/i.test(s), f);
    }
  });

  test('amounts are formatted from integer cents, never with floating point', () => {
    for (const f of [...astroFiles, ...walk('apps/admin/src/lib/invoices')]) {
      const s = source(f);
      assert.ok(!/toFixed|parseFloat|Number\.parseFloat|Math\.round\(.*\/ ?100/.test(s), f);
    }
    for (const f of astroFiles.filter((p) => /Lines|Table|Header|Payouts|Actions/.test(p))) {
      assert.ok(!/\/\s*100\b/.test(source(f)), `${f} does no cents arithmetic`);
    }
  });

  test('semantic tokens only: no hex, rgb, arbitrary values, inline styles or text-[Npx]', () => {
    for (const f of astroFiles) {
      const s = source(f);
      assert.ok(
        !/#[0-9a-fA-F]{3,8}\b(?![\w-])/.test(s.replace(/href="#[^"]*"/g, '').replace(/&#\d+;/g, '')),
        `${f}: hex`,
      );
      assert.ok(!/\b(?:rgba?|hsla?)\(/.test(s), `${f}: colour function`);
      assert.ok(
        !/(?:^|[\s"'`])(?:[a-z0-9-]+:)*[a-z][a-z0-9-]*-\[[^\]\s"'`]+\]/.test(s),
        `${f}: arbitrary value`,
      );
      assert.ok(!/(?<![\w:-])style=/.test(s), `${f}: inline style`);
      assert.ok(
        !/\b(?:bg|text|border)-(?:terracotta|charcoal|cream|sand|ink|ivory|gold|emerald|red|amber|sky)-/.test(
          s,
        ),
        `${f}: palette colour`,
      );
    }
  });

  test('the line editor: Gamo option disabled with an explanation unless approved; unique button names', () => {
    const editor = source('apps/admin/src/components/invoices/InvoiceLineEditor.astro');
    assert.match(editor, /disabled: !gamoAdminApproved/);
    assert.match(editor, /not approved yet/);
    assert.match(editor, /stays a proposal until the founder and board approve it/);
    assert.match(editor, /label=\{`Remove line \$\{i \+ 1\}`\}/);
    assert.match(editor, /label="Add another line"/);
    assert.match(editor, /fieldIdFor\(i, 'price'\)/);
    // Musician pay and the Gamo contribution are separate kinds with separate labels.
    assert.match(editor, /LINE_KIND_LABEL\.musician_pay/);
    assert.match(editor, /LINE_KIND_LABEL\.gamo_admin/);
    const form = source('apps/admin/src/components/invoices/InvoiceForm.astro');
    for (const id of ['bill-to-name', 'bill-to-email', 'due-date'])
      assert.match(form, new RegExp(`id="${id}"`));
    assert.match(form, /<FormErrorSummary/);
    assert.match(form, /novalidate/);
    assert.match(form, /action="\/invoices\/new"/);
    // Enter in a field must create, not remove: the first submit button in the form is "create".
    assert.ok(form.indexOf('value="create" tabindex="-1"') < form.indexOf('<InvoiceLineEditor'));
  });

  test('the detail screen: separate groups, confirmations, test-mode note, unique repeated button names', () => {
    const groups = source('apps/admin/src/components/invoices/InvoiceLineGroups.astro');
    assert.match(groups, /lineGroups\(invoice\)/);
    assert.match(groups, /Subtotal: \{group\.title\}/);
    assert.match(groups, /Invoice total/);
    const actions = source('apps/admin/src/components/invoices/InvoiceActions.astro');
    assert.match(actions, /<details/);
    assert.match(actions, /Confirm: mark \$\{invoice\.number\} paid/);
    assert.match(actions, /Confirm: void \$\{invoice\.number\}/);
    assert.match(actions, /sendModeNote\(stripeTest\)/);
    const payouts = source('apps/admin/src/components/invoices/InvoicePayouts.astro');
    assert.match(payouts, /Record payout for \$\{who\} \(\$\{line\.description\}\)/);
    assert.match(payouts, /invoice\.status === 'paid'/);
    assert.match(payouts, /Payout recorded on/);
    const header = source('apps/admin/src/components/invoices/InvoiceHeader.astro');
    assert.ok(!/stripeInvoiceId\}/.test(header), 'Stripe ids are not displayed');
    const list = source('apps/admin/src/components/invoices/InvoiceListTable.astro');
    assert.match(list, /<caption/);
    for (const col of ['Number', 'Bill to', 'Issued', 'Due', 'Total', 'Status', 'Mode']) {
      assert.match(list, new RegExp(`>\\s*${col}\\s*</th>`));
    }
    assert.match(
      source('apps/admin/src/components/invoices/InvoiceStatusChip.astro'),
      /STATUS_LABEL\[status\]/,
    );
  });

  test('each page names its notices table and the nav entry', () => {
    for (const f of astroFiles.filter((p) => p.includes('/pages/invoices/'))) {
      assert.match(source(f), /INVOICE_NOTICES/, f);
      assert.match(source(f), /current="invoices"/, f);
    }
  });

  test('copy never uses forbidden status wording or invents prices or fees', () => {
    for (const f of [...astroFiles, ...walk('apps/admin/src/lib/invoices')]) {
      const s = source(f);
      assert.ok(
        !/nonprofit|non-profit|tax-exempt|tax-deductible|donation|donor|charity|501\(c\)/i.test(s),
        f,
      );
    }
  });
});
