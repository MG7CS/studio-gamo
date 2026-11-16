import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1, type SqliteD1 } from '@gamo/db/testing';
import {
  InvoiceError,
  InvoiceService,
  displayIsoDate,
  type CreateDraftInput,
  type InvoiceEnv,
  type InvoiceErrorCode,
} from './service.ts';

const T = 1_900_000_000; // 2030-03-17 UTC
const PII = 'pii-hash-secret-for-invoice-tests-00000001';
const BASE_ENV = { ENVIRONMENT: 'production', PII_HASH_SECRET: PII, RESEND_API_KEY: 're_live_example_key' };
const STRIPE_ENV = { ...BASE_ENV, STRIPE_SECRET_KEY: 'sk_test_invoice_abc123' };
const MANUAL_ENV = {
  ...BASE_ENV,
  INVOICE_PAYMENT_INSTRUCTIONS: 'Make checks payable to Gamo Studios, or Zelle hello@gamostudio.org.',
};

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: URLSearchParams | Record<string, unknown> | null;
}

/** A fake fetch for Stripe invoicing and Resend. `stripeFail` makes the named Stripe path answer with a status. */
function fakeFetch(
  opts: { stripeFail?: { match: string; status: number }; resendStatus?: number; amountDelta?: number } = {},
) {
  const calls: Call[] = [];
  let total = 0;
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const raw = init?.body ? String(init.body) : null;
    const isResend = u.startsWith('https://api.resend.com');
    calls.push({
      method,
      url: u,
      headers,
      body:
        raw === null
          ? null
          : isResend
            ? (JSON.parse(raw) as Record<string, unknown>)
            : new URLSearchParams(raw),
    });
    if (isResend) {
      return opts.resendStatus
        ? new Response('{}', { status: opts.resendStatus })
        : Response.json({ id: `re_${calls.length}` });
    }
    if (opts.stripeFail && u.includes(opts.stripeFail.match)) {
      return Response.json({ error: { code: 'api_error' } }, { status: opts.stripeFail.status });
    }
    const path = u.replace('https://api.stripe.com/v1', '');
    if (path === '/customers') return Response.json({ id: 'cus_1' });
    if (path === '/invoices' && method === 'POST') {
      return Response.json({
        id: 'in_1',
        status: 'draft',
        hosted_invoice_url: null,
        amount_due: 0,
        amount_paid: 0,
        metadata: {},
      });
    }
    if (path === '/invoiceitems') {
      total +=
        Number(raw ? new URLSearchParams(raw).get('unit_amount_decimal') : 0) *
        Number(new URLSearchParams(raw ?? '').get('quantity'));
      return Response.json({ id: 'ii_1' });
    }
    if (path === '/invoices/in_1' && method === 'GET') {
      return Response.json({
        id: 'in_1',
        status: 'draft',
        hosted_invoice_url: null,
        amount_due: total + (opts.amountDelta ?? 0),
        amount_paid: 0,
        metadata: {},
      });
    }
    if (path === '/invoices/in_1/finalize') {
      return Response.json({
        id: 'in_1',
        status: 'open',
        hosted_invoice_url: 'https://invoice.stripe.com/i/acct_1/test_abc',
        amount_due: total,
        amount_paid: 0,
        metadata: {},
      });
    }
    if (path === '/invoices/in_1/void') {
      return Response.json({
        id: 'in_1',
        status: 'void',
        hosted_invoice_url: null,
        amount_due: 0,
        amount_paid: 0,
        metadata: {},
      });
    }
    throw new Error(`unexpected fetch ${method} ${u}`);
  }) as typeof fetch;
  return {
    impl,
    calls,
    stripe: () => calls.filter((c) => c.url.includes('stripe.com')),
    resend: () => calls.filter((c) => c.url.includes('resend.com')),
  };
}

const run = (d1: SqliteD1, sql: string, ...p: Array<string | number | null>) =>
  d1.sqlite.prepare(sql).run(...p);
const get = (d1: SqliteD1, sql: string, ...p: Array<string | number | null>) =>
  ({ ...(d1.sqlite.prepare(sql).get(...p) as object) }) as Record<string, string | number | null>;

/** Forms stack -> two roster members, one service request. */
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
  for (const n of [1, 2, 3, 4]) {
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
      `INSERT INTO offers (id, request_id, roster_member_id, role, pay_cents, token_hash, expires_at, status, sent_at, responded_at) VALUES (?, 'req_1', ?, ?, ?, ?, ?, ?, ?, ${status === 'accepted' || status === 'declined' ? T : 'NULL'})`,
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
  offer('off_3', 'ros_2', 'bass', 9000, 'declined');
}

async function setup(
  env: InvoiceEnv & Record<string, unknown>,
  fetchOpts: Parameters<typeof fakeFetch>[0] = {},
) {
  const d1 = await createMigratedD1();
  seed(d1);
  const f = fakeFetch(fetchOpts);
  const svc = new InvoiceService(d1, env, { fetchImpl: f.impl });
  return { d1, f, svc };
}

const draftInput = (over: Partial<CreateDraftInput> = {}): CreateDraftInput => ({
  source: { type: 'service_request', id: 'req_1' },
  billTo: { name: 'Sample Church', email: '  Pastor@Example.ORG ' },
  dueDate: '2030-04-30',
  lines: [
    {
      kind: 'musician_pay',
      description: 'Musician pay: Sample Pianist (keys)',
      unitAmountCents: 15000,
      payeeRosterMemberId: 'ros_1',
    },
    {
      kind: 'musician_pay',
      description: 'Musician pay: Sample Drummer (drums)',
      unitAmountCents: 12000,
      payeeRosterMemberId: 'ros_2',
    },
    { kind: 'production', description: 'Sound setup', quantity: 2, unitAmountCents: 2500 },
  ],
  staffId: 'staff_1',
  now: T,
  ...over,
});

async function code(p: Promise<unknown>): Promise<InvoiceErrorCode> {
  try {
    await p;
  } catch (err) {
    assert.ok(err instanceof InvoiceError, `expected InvoiceError, got ${String(err)}`);
    return err.code;
  }
  assert.fail('expected an InvoiceError');
}

describe('createDraft', () => {
  test('creates a draft with a number, integer totals, normalized email and lines', async () => {
    const { svc } = await setup(MANUAL_ENV);
    const inv = await svc.createDraft(draftInput());
    assert.equal(inv.number, 'GS-2030-0001');
    assert.equal(inv.status, 'draft');
    assert.equal(inv.billToEmail, 'pastor@example.org');
    assert.equal(inv.totalCents, 15000 + 12000 + 5000);
    assert.equal(inv.currency, 'usd');
    assert.equal(inv.sourceId, 'req_1');
    assert.deepEqual(
      inv.lines.map((l) => [l.kind, l.amountCents, l.payeeRosterMemberId]),
      [
        ['musician_pay', 15000, 'ros_1'],
        ['musician_pay', 12000, 'ros_2'],
        ['production', 5000, null],
      ],
    );
    assert.ok(inv.lines.every((l) => l.payoutRecordedAt === null));
  });

  test('numbers are sequential per year and restart each January', async () => {
    const { svc } = await setup(MANUAL_ENV);
    const a = await svc.createDraft(draftInput());
    const b = await svc.createDraft(draftInput());
    const jan = Math.floor(Date.UTC(2031, 0, 2) / 1000);
    const c = await svc.createDraft(draftInput({ now: jan }));
    const d = await svc.createDraft(draftInput({ now: jan }));
    const dec = await svc.createDraft(draftInput()); // back in 2030: its counter continues
    assert.deepEqual(
      [a, b, c, d, dec].map((i) => i.number),
      ['GS-2030-0001', 'GS-2030-0002', 'GS-2031-0001', 'GS-2031-0002', 'GS-2030-0003'],
    );
  });

  test('a failed create does not burn a number (counter and invoice commit together)', async () => {
    const { svc, d1 } = await setup(MANUAL_ENV);
    assert.equal(await code(svc.createDraft(draftInput({ lines: [] }))), 'INVOICE_INVALID');
    assert.equal(get(d1, 'SELECT count(*) AS n FROM invoice_number_counters').n, 0);
    assert.equal((await svc.createDraft(draftInput())).number, 'GS-2030-0001');
  });

  test('gamo_admin is refused unless approved, then stays a separate line', async () => {
    const lines: CreateDraftInput['lines'] = [
      {
        kind: 'musician_pay',
        description: 'Musician pay',
        unitAmountCents: 15000,
        payeeRosterMemberId: 'ros_1',
      },
      { kind: 'gamo_admin', description: 'Gamo administrative contribution', unitAmountCents: 1500 },
    ];
    const refused = await setup(MANUAL_ENV);
    assert.equal(await code(refused.svc.createDraft(draftInput({ lines }))), 'GAMO_ADMIN_NOT_APPROVED');
    for (const flag of ['TRUE', '1', 'yes', 'false', '']) {
      const s = await setup({ ...MANUAL_ENV, GAMO_ADMIN_FEE_APPROVED: flag });
      assert.equal(await code(s.svc.createDraft(draftInput({ lines }))), 'GAMO_ADMIN_NOT_APPROVED', flag);
    }
    const approved = await setup({ ...MANUAL_ENV, GAMO_ADMIN_FEE_APPROVED: 'true' });
    const inv = await approved.svc.createDraft(draftInput({ lines }));
    assert.equal(inv.totalCents, 16500);
    const detail = await approved.svc.get(inv.id);
    assert.equal(detail.groups.musicianPay.length, 1);
    assert.equal(detail.groups.gamoAdmin.length, 1);
    assert.equal(detail.groups.musicianPay[0].amountCents, 15000); // never reduced by the Gamo line
    assert.equal(detail.totalsByKind.gamo_admin, 1500);
    assert.equal(detail.totalsByKind.musician_pay, 15000);
  });

  test('validation: sources, email, date, lines, payees', async () => {
    const { svc } = await setup(MANUAL_ENV);
    const bad: Array<Partial<CreateDraftInput>> = [
      { source: { type: 'service_request' } },
      { source: { type: 'academy_registration', id: '  ' } },
      { source: { type: 'nope' as never, id: 'x' } },
      { billTo: { name: '', email: 'a@example.org' } },
      { billTo: { name: 'X', email: 'not-an-email' } },
      { dueDate: '2030-02-31' },
      { dueDate: '04/30/2030' },
      { staffId: '' },
      { lines: [{ kind: 'lesson', description: 'x', unitAmountCents: 0 }] },
      { lines: [{ kind: 'lesson', description: 'x', unitAmountCents: 1.5 }] },
      { lines: [{ kind: 'musician_pay', description: 'x', unitAmountCents: 100 }] },
      {
        lines: [
          { kind: 'musician_pay', description: 'x', unitAmountCents: 100, payeeRosterMemberId: 'ros_nope' },
        ],
      },
      { lines: [{ kind: 'lesson', description: 'x', unitAmountCents: 100, payeeRosterMemberId: 'ros_1' }] },
    ];
    for (const b of bad)
      assert.equal(await code(svc.createDraft(draftInput(b))), 'INVOICE_INVALID', JSON.stringify(b));
  });

  test('manual invoices take no source id; other sources require one', async () => {
    const { svc } = await setup(MANUAL_ENV);
    const inv = await svc.createDraft(
      draftInput({
        source: { type: 'manual', id: 'ignored' },
        lines: [{ kind: 'other', description: 'Donated-in-kind setup fee', unitAmountCents: 100 }],
      }),
    );
    assert.equal(inv.sourceId, null);
  });

  test('a service request without lines is prefilled from accepted offers only', async () => {
    const { svc } = await setup(MANUAL_ENV);
    const inv = await svc.createDraft(draftInput({ lines: undefined }));
    assert.deepEqual(
      inv.lines.map((l) => [l.kind, l.description, l.amountCents, l.payeeRosterMemberId]),
      [
        ['musician_pay', 'Musician pay: Sample Pianist (keys)', 15000, 'ros_1'],
        ['musician_pay', 'Musician pay: Sample Drummer (drums)', 12000, 'ros_2'],
      ],
    );
    assert.equal(inv.totalCents, 27000);
    assert.ok(!inv.lines.some((l) => l.kind === 'gamo_admin'));
  });

  test('draftFromServiceRequest prefills the church and accepted offers; unknown source 404', async () => {
    const { svc } = await setup(MANUAL_ENV);
    const pre = await svc.draftFromServiceRequest('req_1');
    assert.equal(pre.billTo.email, 'pastor@example.org');
    assert.equal(pre.lines.length, 2);
    assert.equal(await code(svc.draftFromServiceRequest('req_nope')), 'SOURCE_NOT_FOUND');
  });
});

describe('academy registration prefill', () => {
  test('one lesson line from the registration amount', async () => {
    const { svc, d1 } = await setup(MANUAL_ENV);
    // Insert the minimal graph with foreign keys relaxed for this read-only prefill check.
    d1.sqlite.exec('PRAGMA foreign_keys = OFF');
    run(
      d1,
      "INSERT INTO customer_profiles (id, email_normalized, display_name, created_at, updated_at) VALUES ('cus_1', 'family@example.org', 'Sample Parent', ?, ?)",
      T,
      T,
    );
    d1.sqlite.exec('PRAGMA ignore_check_constraints = ON');
    run(
      d1,
      `INSERT INTO academy_registrations (id, program_slug, lesson_slug, location, student_first_name, student_age_band, guardian_name, guardian_email, customer_profile_id, terms_acceptance_id, amount_cents, idempotency_key, created_at, updated_at)
       VALUES ('acr_1', 'piano', 'piano-beginner', 'Sample hall', 'Sample', '10_12', 'Sample Guardian', 'guardian@example.org', 'cus_1', 'ta_1', 8000, 'k1', ?, ?)`,
      T,
      T,
    );
    const pre = await svc.draftFromAcademyRegistration('acr_1');
    assert.deepEqual(pre.source, { type: 'academy_registration', id: 'acr_1' });
    assert.deepEqual(pre.billTo, { name: 'Sample Guardian', email: 'guardian@example.org' });
    assert.deepEqual(
      pre.lines.map((l) => [l.kind, l.unitAmountCents]),
      [['lesson', 8000]],
    );
    const inv = await svc.createDraft({ ...pre, dueDate: '2030-05-01', staffId: 's', now: T });
    assert.equal(inv.totalCents, 8000);
    assert.equal(await code(svc.draftFromAcademyRegistration('acr_nope')), 'SOURCE_NOT_FOUND');
  });
});

describe('send', () => {
  test('Stripe path: customer, invoice, items, finalize with idempotency keys; stores id and hosted URL; emails the link', async () => {
    const { svc, f, d1 } = await setup(STRIPE_ENV);
    const inv = await svc.createDraft(draftInput());
    const res = await svc.send(inv.id, { now: T });
    assert.equal(res.mode, 'stripe');
    assert.equal(res.hostedUrl, 'https://invoice.stripe.com/i/acct_1/test_abc');
    assert.equal(res.status, 'open');

    const s = f.stripe().filter((c) => c.method === 'POST');
    assert.deepEqual(
      s.map((c) => c.url.replace('https://api.stripe.com/v1', '')),
      [
        '/customers',
        '/invoices',
        '/invoiceitems',
        '/invoiceitems',
        '/invoiceitems',
        '/invoices/in_1/finalize',
      ],
    );
    assert.equal(s[0].headers['Idempotency-Key'], `gamo-customer-${inv.id}`);
    assert.equal(s[1].headers['Idempotency-Key'], `gamo-invoice-${inv.id}:invoice`);
    assert.equal(s[2].headers['Idempotency-Key'], `gamo-invoice-${inv.id}:item:0`);
    const invoiceBody = s[1].body as URLSearchParams;
    assert.equal(invoiceBody.get('collection_method'), 'send_invoice');
    assert.equal(invoiceBody.get('metadata[invoiceId]'), inv.id);
    assert.equal(invoiceBody.get('metadata[number]'), 'GS-2030-0001');
    assert.equal(invoiceBody.get('days_until_due'), '44'); // 2030-03-17 -> 2030-04-30
    // Musician pay lines first, the production line after, amounts are per-unit cents.
    const items = s
      .slice(2, 5)
      .map((c) => [
        (c.body as URLSearchParams).get('unit_amount_decimal'),
        (c.body as URLSearchParams).get('quantity'),
      ]);
    assert.deepEqual(items, [
      ['15000', '1'],
      ['12000', '1'],
      ['2500', '2'],
    ]);

    const row = get(
      d1,
      'SELECT status, stripe_invoice_id AS s, hosted_url AS u FROM invoices WHERE id = ?',
      inv.id,
    );
    assert.deepEqual(row, { status: 'open', s: 'in_1', u: 'https://invoice.stripe.com/i/acct_1/test_abc' });

    const mail = f.resend();
    assert.equal(mail.length, 1);
    const body = mail[0].body as Record<string, unknown>;
    assert.deepEqual(body.to, ['pastor@example.org']);
    assert.match(String(body.html), /invoice\.stripe\.com\/i\/acct_1\/test_abc/);
    assert.equal(mail[0].headers['Idempotency-Key'], `invoice_sent:${inv.id}`);
  });

  test('re-sending an open invoice creates no Stripe objects, does not email again, and returns the same result', async () => {
    const { svc, f } = await setup(STRIPE_ENV);
    const inv = await svc.createDraft(draftInput());
    const first = await svc.send(inv.id, { now: T });
    const stripeCalls = f.stripe().length;
    const second = await svc.send(inv.id, { now: T + 5 });
    assert.deepEqual(second, first);
    assert.equal(f.stripe().length, stripeCalls);
    assert.equal(f.resend().length, 1);
  });

  test('manual path: email carries the payment instructions, no Stripe calls', async () => {
    const { svc, f, d1 } = await setup(MANUAL_ENV);
    const inv = await svc.createDraft(draftInput());
    const res = await svc.send(inv.id, { now: T });
    assert.deepEqual(res, { invoiceId: inv.id, mode: 'manual', hostedUrl: null, status: 'open' });
    assert.equal(f.stripe().length, 0);
    const body = f.resend()[0].body as Record<string, string>;
    assert.match(body.text, /Make checks payable to Gamo Studios/);
    assert.match(body.text, /Musician pay/);
    assert.equal(get(d1, 'SELECT status FROM invoices WHERE id = ?', inv.id).status, 'open');
  });

  test('a live or placeholder Stripe key never reaches Stripe (manual path)', async () => {
    for (const key of ['sk_live_abc123', 'sk_test_placeholder_key', '']) {
      const { svc, f } = await setup({ ...MANUAL_ENV, STRIPE_SECRET_KEY: key });
      const inv = await svc.createDraft(draftInput());
      assert.equal((await svc.send(inv.id, { now: T })).mode, 'manual');
      assert.equal(f.stripe().length, 0);
    }
  });

  test('neither Stripe nor instructions: PAYMENT_NOT_CONFIGURED and the invoice stays a draft', async () => {
    const { svc, d1, f } = await setup(BASE_ENV);
    const inv = await svc.createDraft(draftInput());
    assert.equal(await code(svc.send(inv.id, { now: T })), 'PAYMENT_NOT_CONFIGURED');
    assert.equal(get(d1, 'SELECT status FROM invoices WHERE id = ?', inv.id).status, 'draft');
    assert.equal(f.calls.length, 0);
  });

  test('Stripe failure leaves a plain draft (no ids stored, no email) and a retry succeeds', async () => {
    const d1 = await createMigratedD1();
    seed(d1);
    let failing = true;
    const good = fakeFetch();
    const impl = (async (url: string | URL | Request, init?: RequestInit) => {
      if (
        failing &&
        String(url).includes('/invoices') &&
        init?.method === 'POST' &&
        !String(url).includes('finalize')
      ) {
        return Response.json({ error: { code: 'api_error' } }, { status: 400 });
      }
      return good.impl(url, init);
    }) as typeof fetch;
    const svc = new InvoiceService(d1, STRIPE_ENV, { fetchImpl: impl });
    const inv = await svc.createDraft(draftInput());
    const err = await svc.send(inv.id, { now: T }).catch((e: unknown) => e);
    assert.ok(err instanceof InvoiceError);
    assert.equal(err.code, 'STRIPE_FAILED');
    assert.equal(err.status, 503);
    assert.doesNotMatch(err.message, /sk_test|api_error/);
    assert.deepEqual(
      get(d1, 'SELECT status, stripe_invoice_id AS s, hosted_url AS u FROM invoices WHERE id = ?', inv.id),
      { status: 'draft', s: null, u: null },
    );
    assert.equal(good.resend().length, 0);
    failing = false;
    assert.equal((await svc.send(inv.id, { now: T + 1 })).mode, 'stripe');
  });

  test('an amount mismatch from Stripe is never finalized', async () => {
    const { svc, f, d1 } = await setup(STRIPE_ENV, { amountDelta: 1 });
    const inv = await svc.createDraft(draftInput());
    assert.equal(await code(svc.send(inv.id, { now: T })), 'STRIPE_FAILED');
    assert.ok(!f.stripe().some((c) => c.url.endsWith('/finalize')));
    assert.equal(get(d1, 'SELECT status FROM invoices WHERE id = ?', inv.id).status, 'draft');
  });

  test('email failure after issuing keeps the invoice open with EMAIL_FAILED; a re-send retries only the email', async () => {
    const d1 = await createMigratedD1();
    seed(d1);
    let mailUp = false;
    const f = fakeFetch();
    const impl = (async (url: string | URL | Request, init?: RequestInit) =>
      String(url).includes('resend.com') && !mailUp
        ? new Response('{}', { status: 500 })
        : f.impl(url, init)) as typeof fetch;
    const svc = new InvoiceService(d1, STRIPE_ENV, { fetchImpl: impl });
    const inv = await svc.createDraft(draftInput());
    assert.equal(await code(svc.send(inv.id, { now: T })), 'EMAIL_FAILED');
    assert.equal(get(d1, 'SELECT status FROM invoices WHERE id = ?', inv.id).status, 'open');
    const stripeCalls = f.stripe().length;
    mailUp = true;
    const res = await svc.send(inv.id, { now: T + 3600 });
    assert.equal(res.mode, 'stripe');
    assert.equal(f.stripe().length, stripeCalls);
  });

  test('paid, void and unknown invoices cannot be sent', async () => {
    const { svc } = await setup(MANUAL_ENV);
    const a = await svc.createDraft(draftInput());
    await svc.send(a.id, { now: T });
    await svc.markPaid(a.id, { method: 'check', staffId: 's', now: T });
    assert.equal(await code(svc.send(a.id, { now: T })), 'INVOICE_STATE');
    const b = await svc.createDraft(draftInput());
    await svc.void(b.id, 's');
    assert.equal(await code(svc.send(b.id, { now: T })), 'INVOICE_STATE');
    assert.equal(await code(svc.send('inv_nope', { now: T })), 'INVOICE_NOT_FOUND');
  });
});

describe('markPaid', () => {
  test('open -> paid with method/reference; receipt sent once; repeat is a no-op', async () => {
    const { svc, f, d1 } = await setup(MANUAL_ENV);
    const inv = await svc.createDraft(draftInput());
    await svc.send(inv.id, { now: T });
    const res = await svc.markPaid(inv.id, {
      method: 'check',
      reference: ' #1042 ',
      staffId: 'staff_1',
      now: T + 100,
    });
    assert.equal(res.applied, true);
    assert.equal(res.receipt, 'sent');
    assert.equal(res.invoice.status, 'paid');
    assert.equal(res.invoice.paidMethod, 'check');
    assert.equal(res.invoice.paidReference, '#1042');
    assert.equal(res.invoice.paidAt, T + 100);
    const receipts = () =>
      f.resend().filter((c) => (c.body as { subject: string }).subject.startsWith('Receipt'));
    assert.equal(receipts().length, 1);

    const again = await svc.markPaid(inv.id, { method: 'cash', staffId: 'staff_2', now: T + 200 });
    assert.equal(again.applied, false);
    assert.equal(again.receipt, 'skipped');
    assert.equal(again.invoice.paidMethod, 'check');
    assert.equal(again.invoice.paidAt, T + 100);
    assert.equal(receipts().length, 1);
    assert.equal(get(d1, "SELECT count(*) AS n FROM email_log WHERE kind = 'invoice_paid_receipt'").n, 1);
  });

  test('drafts and void invoices cannot be marked paid; bad method or reference rejected', async () => {
    const { svc } = await setup(MANUAL_ENV);
    const draft = await svc.createDraft(draftInput());
    assert.equal(
      await code(svc.markPaid(draft.id, { method: 'check', staffId: 's', now: T })),
      'INVOICE_STATE',
    );
    await svc.void(draft.id, 's');
    assert.equal(
      await code(svc.markPaid(draft.id, { method: 'check', staffId: 's', now: T })),
      'INVOICE_STATE',
    );
    const other = await svc.createDraft(draftInput());
    await svc.send(other.id, { now: T });
    assert.equal(
      await code(svc.markPaid(other.id, { method: 'bitcoin' as never, staffId: 's', now: T })),
      'INVOICE_INVALID',
    );
    assert.equal(
      await code(
        svc.markPaid(other.id, { method: 'check', reference: 'x'.repeat(201), staffId: 's', now: T }),
      ),
      'INVOICE_INVALID',
    );
    assert.equal(
      await code(svc.markPaid('inv_nope', { method: 'check', staffId: 's', now: T })),
      'INVOICE_NOT_FOUND',
    );
  });

  test('paying an invoice that has a Stripe invoice by another method voids the Stripe invoice', async () => {
    const { svc, f } = await setup(STRIPE_ENV);
    const inv = await svc.createDraft(draftInput());
    await svc.send(inv.id, { now: T });
    await svc.markPaid(inv.id, { method: 'check', staffId: 's', now: T + 1 });
    assert.ok(f.stripe().some((c) => c.url.endsWith('/invoices/in_1/void')));
    const { svc: s2, f: f2 } = await setup(STRIPE_ENV);
    const inv2 = await s2.createDraft(draftInput());
    await s2.send(inv2.id, { now: T });
    await s2.markPaid(inv2.id, { method: 'stripe', staffId: 's', now: T + 1 });
    assert.ok(!f2.stripe().some((c) => c.url.endsWith('/void')));
  });
});

describe('void', () => {
  test('a draft is voided locally with no Stripe call; voiding twice is a no-op', async () => {
    const { svc, f } = await setup(STRIPE_ENV);
    const inv = await svc.createDraft(draftInput());
    assert.equal((await svc.void(inv.id, 's')).status, 'void');
    assert.equal((await svc.void(inv.id, 's')).status, 'void');
    assert.equal(f.calls.length, 0);
  });

  test('an open Stripe invoice is voided at Stripe first; a Stripe failure leaves it open', async () => {
    const { svc, f } = await setup(STRIPE_ENV);
    const inv = await svc.createDraft(draftInput());
    await svc.send(inv.id, { now: T });
    assert.equal((await svc.void(inv.id, 's')).status, 'void');
    assert.ok(f.stripe().some((c) => c.url.endsWith('/invoices/in_1/void')));

    const failing = await setup(STRIPE_ENV);
    const open = await failing.svc.createDraft(draftInput());
    await failing.svc.send(open.id, { now: T });
    const svc2 = new InvoiceService(failing.d1, STRIPE_ENV, {
      fetchImpl: (async () =>
        Response.json({ error: { code: 'api_error' } }, { status: 400 })) as typeof fetch,
    });
    assert.equal(await code(svc2.void(open.id, 's')), 'STRIPE_FAILED');
    assert.equal(get(failing.d1, 'SELECT status FROM invoices WHERE id = ?', open.id).status, 'open');
  });

  test('an open manual invoice is voided locally; a paid invoice cannot be voided', async () => {
    const { svc, f } = await setup(MANUAL_ENV);
    const a = await svc.createDraft(draftInput());
    await svc.send(a.id, { now: T });
    assert.equal((await svc.void(a.id, 's')).status, 'void');
    assert.equal(f.stripe().length, 0);
    const b = await svc.createDraft(draftInput());
    await svc.send(b.id, { now: T });
    await svc.markPaid(b.id, { method: 'zelle', staffId: 's', now: T });
    assert.equal(await code(svc.void(b.id, 's')), 'INVOICE_STATE');
    assert.equal(await code(svc.void('inv_nope', 's')), 'INVOICE_NOT_FOUND');
  });
});

describe('recordPayout', () => {
  async function paidInvoice() {
    const ctx = await setup({ ...MANUAL_ENV, GAMO_ADMIN_FEE_APPROVED: 'true' });
    const inv = await ctx.svc.createDraft(
      draftInput({
        lines: [
          {
            kind: 'musician_pay',
            description: 'Musician pay: Sample Pianist',
            unitAmountCents: 15000,
            payeeRosterMemberId: 'ros_1',
          },
          { kind: 'gamo_admin', description: 'Gamo administrative contribution', unitAmountCents: 1500 },
          { kind: 'lesson', description: 'Lesson', unitAmountCents: 500 },
        ],
      }),
    );
    return { ...ctx, inv };
  }

  test('one payout per musician_pay line, equal to the line amount, after the invoice is paid', async () => {
    const { svc, inv, d1 } = await paidInvoice();
    const pay = inv.lines[0];
    assert.equal(
      await code(svc.recordPayout(pay.id, { method: 'zelle', staffId: 's', now: T })),
      'INVOICE_STATE',
    ); // unpaid
    await svc.send(inv.id, { now: T });
    await svc.markPaid(inv.id, { method: 'check', staffId: 's', now: T });

    const rec = await svc.recordPayout(pay.id, {
      method: 'zelle',
      reference: ' ZL-1 ',
      staffId: 'staff_1',
      now: T + 10,
    });
    assert.equal(rec.amountCents, 15000);
    assert.equal(rec.rosterMemberId, 'ros_1');
    assert.deepEqual(
      get(
        d1,
        'SELECT amount_cents AS a, method AS m, reference AS r, paid_at AS p, recorded_by_user_id AS u FROM musician_payouts',
      ),
      {
        a: 15000,
        m: 'zelle',
        r: 'ZL-1',
        p: T + 10,
        u: 'staff_1',
      },
    );
    assert.equal((await svc.get(inv.id)).lines[0].payoutRecordedAt, T + 10);
    assert.equal(
      await code(svc.recordPayout(pay.id, { method: 'zelle', staffId: 's', now: T + 11 })),
      'PAYOUT_EXISTS',
    );
    assert.equal(get(d1, 'SELECT count(*) AS n FROM musician_payouts').n, 1);
  });

  test('refuses non-musician lines, partial amounts and unknown lines', async () => {
    const { svc, inv } = await paidInvoice();
    await svc.send(inv.id, { now: T });
    await svc.markPaid(inv.id, { method: 'check', staffId: 's', now: T });
    assert.equal(
      await code(svc.recordPayout(inv.lines[1].id, { method: 'check', staffId: 's', now: T })),
      'INVOICE_STATE',
    );
    assert.equal(
      await code(svc.recordPayout(inv.lines[2].id, { method: 'check', staffId: 's', now: T })),
      'INVOICE_STATE',
    );
    assert.equal(
      await code(
        svc.recordPayout(inv.lines[0].id, { amountCents: 13500, method: 'check', staffId: 's', now: T }),
      ),
      'INVOICE_INVALID',
    );
    assert.equal(
      await code(svc.recordPayout('inl_nope', { method: 'check', staffId: 's', now: T })),
      'LINE_NOT_FOUND',
    );
    assert.equal(
      (await svc.recordPayout(inv.lines[0].id, { amountCents: 15000, method: 'check', staffId: 's', now: T }))
        .amountCents,
      15000,
    );
  });
});

describe('list and get', () => {
  test('newest first, status filter, keyset paging with lines', async () => {
    const { svc } = await setup(MANUAL_ENV);
    const made = [] as string[];
    for (let i = 0; i < 5; i++) made.push((await svc.createDraft(draftInput({ now: T + i }))).id);
    await svc.send(made[1], { now: T });
    const page1 = await svc.list({ limit: 2 });
    assert.equal(page1.items.length, 2);
    assert.deepEqual(
      page1.items.map((i) => i.id),
      [made[4], made[3]],
    );
    assert.ok(page1.nextCursor);
    assert.ok(page1.items.every((i) => i.lines.length === 3));
    const page2 = await svc.list({ limit: 2 }, page1.nextCursor);
    assert.deepEqual(
      page2.items.map((i) => i.id),
      [made[2], made[1]],
    );
    const page3 = await svc.list({ limit: 2 }, page2.nextCursor);
    assert.deepEqual(
      page3.items.map((i) => i.id),
      [made[0]],
    );
    assert.equal(page3.nextCursor, null);
    assert.deepEqual(
      (await svc.list({ status: 'open' })).items.map((i) => i.id),
      [made[1]],
    );
    assert.equal(await code(svc.list({}, '!!!')), 'INVOICE_INVALID');
    assert.equal(await code(svc.get('inv_nope')), 'INVOICE_NOT_FOUND');
  });
});

test('displayIsoDate formats a calendar date without a timezone shift', () => {
  assert.equal(displayIsoDate('2030-04-30'), 'April 30, 2030');
  assert.equal(displayIsoDate('garbage'), 'garbage');
});
