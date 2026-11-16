import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createMigratedD1, type SqliteD1 } from '@gamo/db/testing';
import { InvoiceService, type CreateDraftInput } from './service.ts';
import { handleStripeInvoiceEvent, verifyAndHandleStripeWebhook } from './webhook.ts';

const SECRET = 'whsec_test_secret_for_invoice_webhooks';
const PII = 'pii-hash-secret-for-invoice-tests-00000001';
const ENV = {
  ENVIRONMENT: 'production',
  PII_HASH_SECRET: PII,
  RESEND_API_KEY: 're_live_example_key',
  INVOICE_PAYMENT_INSTRUCTIONS: 'Make checks payable to Gamo Studios.',
  STRIPE_WEBHOOK_SECRET: SECRET,
};
const NOW = Math.floor(Date.now() / 1000);

const run = (d1: SqliteD1, sql: string, ...p: Array<string | number | null>) =>
  d1.sqlite.prepare(sql).run(...p);
const get = (d1: SqliteD1, sql: string, ...p: Array<string | number | null>) =>
  ({ ...(d1.sqlite.prepare(sql).get(...p) as object) }) as Record<string, string | number | null>;
const all = (d1: SqliteD1, sql: string) =>
  d1.sqlite
    .prepare(sql)
    .all()
    .map((r) => ({ ...r })) as Array<Record<string, string | number | null>>;

function mailer() {
  const sent: Array<{ subject: string; key: string }> = [];
  const impl = (async (_url: string | URL | Request, init?: RequestInit) => {
    sent.push({
      subject: (JSON.parse(String(init?.body)) as { subject: string }).subject,
      key: (init?.headers as Record<string, string>)['Idempotency-Key'],
    });
    return Response.json({ id: `re_${sent.length}` });
  }) as typeof fetch;
  return { sent, impl };
}

/** An open invoice that carries a Stripe invoice id (set directly: the send path is tested in service.test.ts). */
async function openInvoice(stripeId = 'in_1') {
  const d1 = await createMigratedD1();
  const m = mailer();
  const svc = new InvoiceService(d1, ENV, { fetchImpl: m.impl });
  const input: CreateDraftInput = {
    source: { type: 'manual' },
    billTo: { name: 'Sample Church', email: 'pastor@example.org' },
    dueDate: '2030-04-30',
    lines: [{ kind: 'other', description: 'Sound setup', unitAmountCents: 5000 }],
    staffId: 's',
    now: NOW,
  };
  const inv = await svc.createDraft(input);
  run(
    d1,
    "UPDATE invoices SET status = 'open', stripe_invoice_id = ?2, hosted_url = 'https://invoice.stripe.com/i/x' WHERE id = ?1",
    inv.id,
    stripeId,
  );
  return { d1, m, svc, inv };
}

const event = (type: string, over: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  id: `evt_${type.replace('.', '_')}_1`,
  object: 'event' as const,
  type,
  created: NOW,
  livemode: false,
  data: {
    object: {
      id: 'in_1',
      status: type === 'invoice.paid' ? 'paid' : 'open',
      amount_paid: type === 'invoice.paid' ? 5000 : 0,
      metadata: {},
      status_transitions: type === 'invoice.paid' ? { paid_at: NOW - 30 } : {},
      ...over,
    },
  },
  ...extra,
});

const receiptCount = (m: ReturnType<typeof mailer>) =>
  m.sent.filter((s) => s.subject.startsWith('Receipt')).length;

describe('handleStripeInvoiceEvent', () => {
  test('invoice.paid marks the invoice paid once (stripe, paid_at from the event) and sends one receipt', async () => {
    const { d1, m, inv } = await openInvoice();
    const first = await handleStripeInvoiceEvent(d1, ENV, event('invoice.paid'), {
      now: NOW,
      fetchImpl: m.impl,
    });
    assert.deepEqual(first, { received: true, applied: true });
    assert.deepEqual(
      get(
        d1,
        'SELECT status, paid_method AS m, paid_at AS p, paid_reference AS r FROM invoices WHERE id = ?',
        inv.id,
      ),
      {
        status: 'paid',
        m: 'stripe',
        p: NOW - 30,
        r: 'in_1',
      },
    );
    assert.equal(receiptCount(m), 1);
    const replay = await handleStripeInvoiceEvent(d1, ENV, event('invoice.paid'), {
      now: NOW + 5,
      fetchImpl: m.impl,
    });
    assert.deepEqual(replay, { received: true, applied: false });
    assert.equal(receiptCount(m), 1);
    assert.equal(get(d1, 'SELECT paid_at AS p FROM invoices WHERE id = ?', inv.id).p, NOW - 30);
  });

  test('unknown invoice, other event types and unparseable objects: applied false, nothing changes', async () => {
    const { d1, m, inv } = await openInvoice();
    for (const e of [
      event('invoice.paid', { id: 'in_other' }),
      event('customer.created'),
      event('invoice.paid', { id: 'not-an-invoice' }),
    ]) {
      assert.deepEqual(await handleStripeInvoiceEvent(d1, ENV, e, { now: NOW, fetchImpl: m.impl }), {
        received: true,
        applied: false,
      });
    }
    assert.equal(get(d1, 'SELECT status FROM invoices WHERE id = ?', inv.id).status, 'open');
    assert.equal(m.sent.length, 0);
  });

  test('a paid event for a void invoice stays void, sends no receipt, and leaves an audit row', async () => {
    const { d1, m, svc, inv } = await openInvoice();
    run(d1, "UPDATE invoices SET status = 'void' WHERE id = ?", inv.id);
    void svc;
    const r = await handleStripeInvoiceEvent(d1, ENV, event('invoice.paid'), { now: NOW, fetchImpl: m.impl });
    assert.deepEqual(r, { received: true, applied: false });
    assert.equal(get(d1, 'SELECT status, paid_at AS p FROM invoices WHERE id = ?', inv.id).status, 'void');
    assert.equal(m.sent.length, 0);
    assert.equal(
      all(d1, "SELECT action FROM audit_logs WHERE entity_id = '" + inv.id + "'")[0].action,
      'invoice.paid_event_on_void',
    );
  });

  test('payment_failed changes nothing but records one audit row per event id', async () => {
    const { d1, m, inv } = await openInvoice();
    const e = event('invoice.payment_failed');
    for (let i = 0; i < 2; i++) {
      assert.deepEqual(await handleStripeInvoiceEvent(d1, ENV, e, { now: NOW, fetchImpl: m.impl }), {
        received: true,
        applied: false,
      });
    }
    assert.equal(get(d1, 'SELECT status FROM invoices WHERE id = ?', inv.id).status, 'open');
    const rows = all(d1, `SELECT action, actor_user_id AS a FROM audit_logs WHERE entity_id = '${inv.id}'`);
    assert.deepEqual(rows, [{ action: 'invoice.payment_failed', a: null }]);
    assert.equal(m.sent.length, 0);
  });

  test('an amount that differs from the invoice total still marks it paid but is audited', async () => {
    const { d1, m, inv } = await openInvoice();
    await handleStripeInvoiceEvent(d1, ENV, event('invoice.paid', { amount_paid: 4000 }), {
      now: NOW,
      fetchImpl: m.impl,
    });
    assert.equal(get(d1, 'SELECT status FROM invoices WHERE id = ?', inv.id).status, 'paid');
    assert.ok(
      all(d1, `SELECT action FROM audit_logs WHERE entity_id = '${inv.id}'`).some(
        (r) => r.action === 'invoice.paid_amount_mismatch',
      ),
    );
  });

  test('livemode events are refused with LIVEMODE_REFUSED (400)', async () => {
    const { d1, m } = await openInvoice();
    await assert.rejects(
      handleStripeInvoiceEvent(d1, ENV, event('invoice.paid', {}, { livemode: true }), {
        now: NOW,
        fetchImpl: m.impl,
      }),
      (err: { code?: string; status?: number }) => err.code === 'LIVEMODE_REFUSED' && err.status === 400,
    );
  });
});

describe('verifyAndHandleStripeWebhook', () => {
  const sign = (body: string, secret = SECRET, t = NOW) =>
    `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
  const req = (body: string, signature: string | null) =>
    new Request('https://gamostudio.org/api/webhook/stripe', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(signature ? { 'stripe-signature': signature } : {}),
      },
      body,
    });

  test('503 when the webhook secret is unset (nothing is processed)', async () => {
    const { d1, m, inv } = await openInvoice();
    const body = JSON.stringify(event('invoice.paid'));
    const res = await verifyAndHandleStripeWebhook(
      req(body, sign(body)),
      d1,
      { ...ENV, STRIPE_WEBHOOK_SECRET: undefined },
      NOW,
      { fetchImpl: m.impl },
    );
    assert.equal(res.status, 503);
    assert.equal(get(d1, 'SELECT status FROM invoices WHERE id = ?', inv.id).status, 'open');
  });

  test('400 for a missing, wrong, stale or malformed signature, and for a body that is not JSON', async () => {
    const { d1, m, inv } = await openInvoice();
    const body = JSON.stringify(event('invoice.paid'));
    const cases: Array<string | null> = [
      null,
      sign(body, 'whsec_other_secret_value'),
      sign(body, SECRET, NOW - 3600),
      'garbage',
      sign(`${body} `),
    ];
    for (const sig of cases) {
      const res = await verifyAndHandleStripeWebhook(req(body, sig), d1, ENV, NOW, { fetchImpl: m.impl });
      assert.equal(res.status, 400, String(sig));
      const json = (await res.json()) as { success: boolean; error: { code: string } };
      assert.equal(json.success, false);
    }
    const junk = 'not json';
    assert.equal(
      (await verifyAndHandleStripeWebhook(req(junk, sign(junk)), d1, ENV, NOW, { fetchImpl: m.impl })).status,
      400,
    );
    assert.equal(get(d1, 'SELECT status FROM invoices WHERE id = ?', inv.id).status, 'open');
  });

  test('a signed invoice.paid answers 200 {received, applied:true}; the replay answers applied:false; one receipt', async () => {
    const { d1, m, inv } = await openInvoice();
    const body = JSON.stringify(event('invoice.paid'));
    const first = await verifyAndHandleStripeWebhook(req(body, sign(body)), d1, ENV, NOW, {
      fetchImpl: m.impl,
    });
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { received: true, applied: true });
    const second = await verifyAndHandleStripeWebhook(req(body, sign(body)), d1, ENV, NOW + 1, {
      fetchImpl: m.impl,
    });
    assert.deepEqual(await second.json(), { received: true, applied: false });
    assert.equal(get(d1, 'SELECT status FROM invoices WHERE id = ?', inv.id).status, 'paid');
    assert.equal(receiptCount(m), 1);
  });

  test('unknown invoice answers 200 applied:false; a signed live-mode event answers 400', async () => {
    const { d1, m } = await openInvoice();
    const unknown = JSON.stringify(event('invoice.paid', { id: 'in_unknown' }));
    const res = await verifyAndHandleStripeWebhook(req(unknown, sign(unknown)), d1, ENV, NOW, {
      fetchImpl: m.impl,
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { received: true, applied: false });
    const live = JSON.stringify(event('invoice.paid', {}, { livemode: true }));
    const refused = await verifyAndHandleStripeWebhook(req(live, sign(live)), d1, ENV, NOW, {
      fetchImpl: m.impl,
    });
    assert.equal(refused.status, 400);
    assert.equal(((await refused.json()) as { error: { code: string } }).error.code, 'LIVEMODE_REFUSED');
  });
});
