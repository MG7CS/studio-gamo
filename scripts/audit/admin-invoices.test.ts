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
import { createMigratedD1, type SqliteD1 } from '../../packages/db/testing.ts';
import { createDb } from '../../packages/db/index.ts';
import { createSession } from '../../packages/auth/index.ts';
import { StaffIdentityService } from '../../packages/domain/src/services/staff-identity.ts';
import * as invoicesRoute from '../../apps/admin/src/pages/api/invoices/index.ts';
import * as sendRoute from '../../apps/admin/src/pages/api/invoices/[id]/send.ts';
import * as markPaidRoute from '../../apps/admin/src/pages/api/invoices/[id]/mark-paid.ts';
import * as voidRoute from '../../apps/admin/src/pages/api/invoices/[id]/void.ts';
import * as payoutRoute from '../../apps/admin/src/pages/api/invoice-lines/[id]/payout.ts';
import { dollarsToCents } from '../../apps/admin/src/lib/invoices/money.ts';

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
});

// ---------------------------------------------------------------------------------------------
// API: create
// ---------------------------------------------------------------------------------------------

describe('create draft', () => {
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
});

// ---------------------------------------------------------------------------------------------
// API: list
// ---------------------------------------------------------------------------------------------

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
});
