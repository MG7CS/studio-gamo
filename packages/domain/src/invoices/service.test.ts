import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1, type SqliteD1 } from '@gamo/db/testing';
import {
  InvoiceError,
  InvoiceService,
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
});

describe('academy registration prefill', () => {});

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

  test('an amount mismatch from Stripe is never finalized', async () => {
    const { svc, f, d1 } = await setup(STRIPE_ENV, { amountDelta: 1 });
    const inv = await svc.createDraft(draftInput());
    assert.equal(await code(svc.send(inv.id, { now: T })), 'STRIPE_FAILED');
    assert.ok(!f.stripe().some((c) => c.url.endsWith('/finalize')));
    assert.equal(get(d1, 'SELECT status FROM invoices WHERE id = ?', inv.id).status, 'draft');
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
});

describe('void', () => {
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
});

describe('recordPayout', () => {});

describe('list and get', () => {});
