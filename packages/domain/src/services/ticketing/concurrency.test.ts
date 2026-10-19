/**
 * Concurrency, abuse-limit and idempotency regressions (CLEANUP_LOG D-172 to D-183). Each case began as a
 * reproducer from the independent concurrency review and failed before the fix. Interleavings are simulated
 * by running a second request right after a chosen statement or batch (`hookDb`, `afterBatch`). Sample data only.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ORIGIN,
  publishedEvent,
  sampleOrderRequest,
  ticketingFixture,
  type TicketingFixture,
} from './orders-testing.ts';
import {
  UNVERIFIED_HOLD_SECONDS,
  canonicalEmailForCap,
  extendUnverifiedHold,
  placeOrder,
  readConfirmToken,
  type OrderRequest,
} from './checkout.ts';
import {
  handleStripeWebhook,
  localMockPaymentWebhook,
  signStripePayload,
  stripeWebhookSecret,
} from './checkout-webhook.ts';
import { confirmFreeOrder, issueDoorTickets } from './issuance.ts';
import { refundTickets } from './refunds.ts';
import { cancelEvent } from './event-changes.ts';
import { shortSender, transferTicket } from './transfers.ts';
import { customerIdentity, getOrderView } from './orders.ts';
import { requestTicketRecovery, RECOVERY_RESPONSE_MESSAGE } from './recovery.ts';
import { confirmWaitlistEntry, joinWaitlist } from './checkout-waitlist.ts';
import { loadOrder, TicketingError } from './orders-shared.ts';
import { readLocalTestInbox } from './email.ts';
import { scanTicket } from './scanning.ts';
import { signTicketQr } from '../../security/ticket-qr.ts';
import { localDevelopmentSecret } from '../../security/env-secret.ts';

const now = () => Math.floor(Date.now() / 1000);
const KEYS = { GL1: localDevelopmentSecret('TICKET_QR_SECRET_GL1') };

/** Runs `hook` right after a statement matching `re` has finished (another request interleaving at an await). */
function hookDb(db: TicketingFixture['d1'], re: RegExp, hook: () => Promise<void>) {
  let fired = false;
  return new Proxy(db, {
    get(target, prop, recv) {
      if (prop !== 'prepare') {
        const v = Reflect.get(target, prop, recv);
        return typeof v === 'function' ? v.bind(target) : v;
      }
      return (sql: string) => {
        const stmt = target.prepare(sql) as unknown as Record<string, (...a: unknown[]) => unknown>;
        if (!re.test(sql)) return stmt;
        const wrap =
          (m: string) =>
          async (...a: unknown[]) => {
            const r = await stmt[m](...a);
            if (!fired) {
              fired = true;
              await hook();
            }
            return r;
          };
        const proxy: unknown = new Proxy(stmt, {
          get(t, p) {
            if (p === 'first' || p === 'all' || p === 'run') return wrap(p);
            if (p === 'bind')
              return (...a: unknown[]) => {
                t.bind(...a);
                return proxy;
              };
            const v = t[p as string];
            return typeof v === 'function' ? (v as (...x: unknown[]) => unknown).bind(t) : v;
          },
        });
        return proxy;
      };
    },
  }) as TicketingFixture['d1'];
}

/** Wraps `batch` so `after(results)` runs once the batch has committed, or `before(n)` can fail it. */
function batchDb(
  db: TicketingFixture['d1'],
  opts: { before?: (n: number) => void; after?: (n: number) => Promise<void> },
) {
  let n = 0;
  return new Proxy(db, {
    get(target, prop, recv) {
      if (prop === 'batch')
        return async (stmts: unknown[]) => {
          n++;
          opts.before?.(n);
          const res = await (target as never as { batch: (s: unknown[]) => Promise<unknown> }).batch(stmts);
          await opts.after?.(n);
          return res;
        };
      const v = Reflect.get(target, prop, recv);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  }) as TicketingFixture['d1'];
}

const place = (f: TicketingFixture, request: OrderRequest, extra: Record<string, unknown> = {}) =>
  placeOrder(f.d1, (extra.env as never) ?? f.env, {
    request,
    allow: 'any',
    ipHash: (extra.ipHash as string | null) ?? null,
    origin: ORIGIN,
    https: false,
    now: (extra.now as number) ?? now(),
    fetchImpl: extra.fetchImpl as never,
    retryDelayMs: 5,
  });

async function deliver(f: TicketingFixture, rawBody: string, env: Record<string, unknown> = f.env) {
  const sig = await signStripePayload(stripeWebhookSecret(env)!, rawBody, now());
  return handleStripeWebhook(f.d1, env, { rawBody, signature: sig, ctx: { now: now(), origin: ORIGIN } });
}

async function paidEvent(f: TicketingFixture, capacity = '10') {
  return publishedEvent(f, {
    admissionType: 'paid',
    categories: [{ name: 'Seat', kind: 'general', price: '20', capacity }],
  });
}

async function paidOrderPaid(f: TicketingFixture, ev: Awaited<ReturnType<typeof paidEvent>>, qty: number) {
  const r = await place(
    f,
    sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: qty }]),
  );
  const order = (await loadOrder(f.d1, (r as { orderId: string }).orderId))!;
  return order;
}

async function freeTickets(f: TicketingFixture, quantity: number, opts: Record<string, unknown> = {}) {
  const ev = await publishedEvent(f, opts);
  const r = await place(f, sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity }]));
  const orderId = (await readConfirmToken(f.env, (r as { confirmToken: string }).confirmToken, now()))!;
  await confirmFreeOrder(f.d1, f.env, { orderId, now: now(), origin: ORIGIN });
  const tickets = f.all<{ id: string; customer_profile_id: string }>(
    'SELECT id, customer_profile_id FROM tickets WHERE order_id = ? ORDER BY seq',
    orderId,
  );
  const identity = await customerIdentity(f.d1, {
    sessionId: 'csn_test',
    customerProfileId: tickets[0].customer_profile_id,
    scope: 'customer:all',
    expiresAt: now() + 3600,
  });
  return { ev, orderId, tickets, identity };
}

describe('C1 Stripe idempotency_key_in_use (D-172)', () => {
  test('a concurrent duplicate submit never cancels the order whose checkout URL the first request hands out', async () => {
    const f = await ticketingFixture();
    const ev = await paidEvent(f);
    const env = {
      ...f.env,
      ENVIRONMENT: 'preview',
      STRIPE_TEST_CHECKOUT: 'true',
      STRIPE_SECRET_KEY: 'sk_test_unit_fake_key_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_testsecret',
      CUSTOMER_LINK_SECRET: `${'x'.repeat(40)}link`,
      PII_HASH_SECRET: `${'y'.repeat(40)}pii`,
      TICKET_QR_SECRET_GL1: `${'z'.repeat(40)}qr1`,
    };
    const inflight = new Set<string>();
    const done = new Map<string, unknown>();
    const fetchImpl = (async (_url: string, init: { headers: Record<string, string> }) => {
      const key = init.headers['Idempotency-Key'];
      if (done.has(key)) return new Response(JSON.stringify(done.get(key)), { status: 200 });
      if (inflight.has(key))
        return new Response(
          JSON.stringify({ error: { code: 'idempotency_key_in_use', type: 'idempotency_error' } }),
          { status: 409 },
        );
      inflight.add(key);
      await new Promise((r) => setTimeout(r, 30));
      const body = {
        id: 'cs_test_real_1',
        url: 'https://checkout.stripe.com/c/pay/cs_test_real_1',
        expires_at: now() + 3600,
      };
      done.set(key, body);
      inflight.delete(key);
      return new Response(JSON.stringify(body), { status: 200 });
    }) as never;
    const req = sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 2 }]);
    const results = await Promise.allSettled([
      place(f, req, { env, fetchImpl }),
      place(f, req, { env, fetchImpl }),
    ]);
    const urls = results.map((r) =>
      r.status === 'fulfilled' ? (r.value as { checkoutUrl?: string }).checkoutUrl : null,
    );
    assert.ok(
      urls.every((u) => u === 'https://checkout.stripe.com/c/pay/cs_test_real_1'),
      JSON.stringify(results),
    );
    const orders = f.all<{ id: string; status: string }>('SELECT id, status FROM ticket_orders');
    assert.equal(orders.length, 1);
    assert.notEqual(orders[0].status, 'cancelled');
    assert.equal(f.q<{ r: number }>('SELECT reserved_count r FROM ticket_tiers').r, 2);
    // The customer pays on the URL they were given: tickets are issued.
    const full = (await loadOrder(f.d1, orders[0].id))!;
    const { rawBody } = await localMockPaymentWebhook(
      f.env,
      { ...full, stripe_checkout_session_id: 'cs_test_real_1' },
      now(),
    );
    const w = await deliver(f, rawBody, env);
    assert.equal(w.status, 200);
    assert.equal(f.q<{ n: number }>("SELECT count(*) n FROM tickets WHERE status = 'valid'").n, 2);
  });
});

describe('C2 per-event email cap is enforced inside the hold batch (D-174)', () => {
  test('parallel orders for one address cannot exceed three orders worth of tickets', async () => {
    const f = await ticketingFixture();
    const ev = await publishedEvent(f, {
      categories: [{ name: 'GA', kind: 'general', price: '0', capacity: '500' }],
    });
    const email = 'one.person@example.org';
    const mk = () =>
      sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 10 }], {
        email,
        emailConfirm: email,
      });
    await Promise.allSettled(Array.from({ length: 8 }, () => place(f, mk())));
    const held = f.q<{ n: number }>(
      "SELECT coalesce(sum(quantity), 0) n FROM ticket_holds WHERE status = 'held'",
    ).n;
    assert.ok(held <= 30, `held ${held}`);
    assert.ok(held > 0);
  });

  test('Gmail dots, plus tags and googlemail.com count as one address; other providers are compared as typed', async () => {
    assert.equal(canonicalEmailForCap('A.B+tag@Gmail.com'), 'ab@gmail.com');
    assert.equal(canonicalEmailForCap('ab@googlemail.com'), 'ab@gmail.com');
    assert.equal(canonicalEmailForCap('a.b@example.org'), 'a.b@example.org');
    const f = await ticketingFixture();
    const ev = await publishedEvent(f, {
      categories: [{ name: 'GA', kind: 'general', price: '0', capacity: '500' }],
    });
    const variants = ['sam.ple@gmail.com', 'samp.le+a@gmail.com', 's.a.m.ple+b@googlemail.com'];
    for (const email of variants)
      await place(
        f,
        sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 10 }], {
          email,
          emailConfirm: email,
        }),
      );
    // Over the cap the answer looks like any new order (no enumeration) but nothing is held.
    const heldBefore = f.q<{ n: number }>(
      "SELECT coalesce(sum(quantity), 0) n FROM ticket_holds WHERE status = 'held'",
    ).n;
    const over = await place(
      f,
      sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 1 }], {
        email: 'sample@gmail.com',
        emailConfirm: 'sample@gmail.com',
      }),
    );
    assert.equal(over.type, 'verify');
    assert.equal(
      f.q<{ n: number }>("SELECT coalesce(sum(quantity), 0) n FROM ticket_holds WHERE status = 'held'").n,
      heldBefore,
    );
    // A different (non-Gmail) address is unaffected.
    const other = await place(
      f,
      sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 1 }]),
    );
    assert.equal(other.type, 'verify');
  });
});

describe('C3 same idempotency key, different request (D-172)', () => {
  test('a different payload under a used key is a conflict, an identical one replays the order', async () => {
    const f = await ticketingFixture();
    const ev = await publishedEvent(f, {
      categories: [{ name: 'GA', kind: 'general', price: '0', capacity: '50' }],
    });
    const a = sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 1 }]);
    const first = await place(f, a);
    const again = await place(f, a);
    assert.equal((again as { orderId: string }).orderId, (first as { orderId: string }).orderId);
    const b = { ...a, items: [{ categoryId: ev.categories[0].id, sectionId: null, quantity: 5 }] };
    await assert.rejects(place(f, b), (e: unknown) => e instanceof TicketingError && e.code === 'CONFLICT');
    assert.equal(f.q<{ q: number }>('SELECT quantity q FROM ticket_orders').q, 1);
    assert.equal(f.q<{ n: number }>('SELECT count(*) n FROM ticket_orders').n, 1);
  });
});

describe('C4 refund accounting (D-175)', () => {
  test('charge.refunded handled in the middle of refundTickets is not counted twice', async () => {
    const f = await ticketingFixture();
    const ev = await paidEvent(f);
    const order = await paidOrderPaid(f, ev, 4);
    await deliver(f, (await localMockPaymentWebhook(f.env, order, now())).rawBody);
    const pi = (await loadOrder(f.d1, order.id))!.stripe_payment_intent_id;
    const tickets = f.all<{ id: string }>('SELECT id FROM tickets WHERE order_id = ? ORDER BY seq', order.id);
    let injected = false;
    const db2 = batchDb(f.d1, {
      after: async () => {
        if (
          injected ||
          f.q<{ n: number }>("SELECT count(*) n FROM refund_records WHERE status = 'approved'").n !== 1
        )
          return;
        injected = true;
        await deliver(
          f,
          JSON.stringify({
            id: 'evt_test_refund_fast',
            type: 'charge.refunded',
            livemode: false,
            data: { object: { payment_intent: pi, amount_refunded: 4000 } },
          }),
        );
      },
    });
    await refundTickets(db2, f.env, {
      orderId: order.id,
      ticketIds: [tickets[0].id, tickets[1].id],
      reason: 'test refund',
      actorUserId: f.userId,
      now: now(),
      origin: ORIGIN,
    });
    assert.ok(injected);
    assert.equal(Number((await loadOrder(f.d1, order.id))!.amount_refunded_cents), 4000);
    assert.equal(f.q<{ s: string }>('SELECT status s FROM refund_records').s, 'processed');
    const rest = await refundTickets(f.d1, f.env, {
      orderId: order.id,
      reason: 'refund the rest',
      actorUserId: f.userId,
      now: now(),
      origin: ORIGIN,
    });
    assert.equal(rest.amountCents, 4000);
    const o = (await loadOrder(f.d1, order.id))!;
    assert.equal(Number(o.amount_refunded_cents), Number(o.total_cents));
    assert.equal(o.status, 'refunded');
  });

  test('a late reconcile never moves a disputed order to refunded', async () => {
    const f = await ticketingFixture();
    const ev = await paidEvent(f);
    const order = await paidOrderPaid(f, ev, 2);
    await deliver(f, (await localMockPaymentWebhook(f.env, order, now())).rawBody);
    const pi = (await loadOrder(f.d1, order.id))!.stripe_payment_intent_id;
    await deliver(
      f,
      JSON.stringify({
        id: 'evt_test_dispute_1',
        type: 'charge.dispute.created',
        livemode: false,
        data: { object: { payment_intent: pi } },
      }),
    );
    assert.equal((await loadOrder(f.d1, order.id))!.status, 'disputed');
    await deliver(
      f,
      JSON.stringify({
        id: 'evt_test_refund_after_dispute',
        type: 'charge.refunded',
        livemode: false,
        data: { object: { payment_intent: pi, amount_refunded: 4000 } },
      }),
    );
    assert.equal((await loadOrder(f.d1, order.id))!.status, 'disputed');
  });
});

describe('R2 refund is one batch (D-175)', () => {
  test('a failed refund batch leaves tickets valid and no record; the retry succeeds', async () => {
    const f = await ticketingFixture();
    const ev = await paidEvent(f);
    const order = await paidOrderPaid(f, ev, 2);
    await deliver(f, (await localMockPaymentWebhook(f.env, order, now())).rawBody);
    const db2 = batchDb(f.d1, {
      before: (n) => {
        if (n === 1) throw new Error('D1_ERROR: network connection lost');
      },
    });
    await assert.rejects(
      refundTickets(db2, f.env, {
        orderId: order.id,
        reason: 'customer asked',
        actorUserId: f.userId,
        now: now(),
        origin: ORIGIN,
      }),
    );
    assert.deepEqual(
      f.all<{ status: string }>('SELECT status FROM tickets').map((t) => t.status),
      ['valid', 'valid'],
    );
    assert.equal(f.q<{ n: number }>('SELECT count(*) n FROM refund_records').n, 0);
    const again = await refundTickets(f.d1, f.env, {
      orderId: order.id,
      reason: 'retry',
      actorUserId: f.userId,
      now: now(),
      origin: ORIGIN,
    });
    assert.equal(again.amountCents, 4000);
    assert.equal(f.q<{ n: number }>('SELECT count(*) n FROM refund_records').n, 1);
  });
});

describe('W1 refund or dispute before checkout.session.completed (D-175)', () => {
  test('is answered 409 so Stripe redelivers, and applies once the order is matched', async () => {
    const f = await ticketingFixture();
    const ev = await paidEvent(f);
    const order = await paidOrderPaid(f, ev, 2);
    const pi = `pi_test_local_${order.id.slice(4)}`;
    const refund = JSON.stringify({
      id: 'evt_test_ref_first',
      type: 'charge.refunded',
      livemode: false,
      data: { object: { payment_intent: pi, amount_refunded: 4000 } },
    });
    const r1 = await deliver(f, refund);
    assert.equal(r1.status, 409);
    await deliver(f, (await localMockPaymentWebhook(f.env, order, now())).rawBody);
    const r2 = await deliver(f, refund); // Stripe's retry of the same event
    assert.equal(r2.status, 200);
    const o = (await loadOrder(f.d1, order.id))!;
    assert.equal(o.status, 'refunded');
    assert.equal(Number(o.amount_refunded_cents), 4000);
  });

  test('a dispute that arrives first is applied on redelivery', async () => {
    const f = await ticketingFixture();
    const ev = await paidEvent(f);
    const order = await paidOrderPaid(f, ev, 2);
    const pi = `pi_test_local_${order.id.slice(4)}`;
    const dispute = JSON.stringify({
      id: 'evt_test_disp_first',
      type: 'charge.dispute.created',
      livemode: false,
      data: { object: { payment_intent: pi } },
    });
    assert.equal((await deliver(f, dispute)).status, 409);
    await deliver(f, (await localMockPaymentWebhook(f.env, order, now())).rawBody);
    assert.equal((await deliver(f, dispute)).status, 200);
    assert.equal((await loadOrder(f.d1, order.id))!.status, 'disputed');
  });
});

describe('W2 cancelEvent with a payment landing mid-cancel (D-176)', () => {
  test('a paid order that completes after the cancel batch is not left paid with no refund', async () => {
    const f = await ticketingFixture();
    const ev = await paidEvent(f);
    const a = await paidOrderPaid(f, ev, 1);
    const b = await paidOrderPaid(f, ev, 1);
    await deliver(f, (await localMockPaymentWebhook(f.env, a, now())).rawBody);
    let injected = false;
    const hooked = batchDb(f.d1, {
      after: async () => {
        if (injected) return;
        injected = true;
        await deliver(f, (await localMockPaymentWebhook(f.env, b, now())).rawBody);
      },
    });
    await cancelEvent(hooked, f.env, {
      eventId: ev.eventId,
      reason: 'venue flooded',
      actorUserId: f.userId,
      origin: ORIGIN,
      now: now(),
    });
    for (const o of [a, b]) {
      const row = (await loadOrder(f.d1, o.id))!;
      assert.equal(
        f.q<{ n: number }>("SELECT count(*) n FROM tickets WHERE order_id = ? AND status = 'valid'", o.id).n,
        0,
      );
      // Either refunded by the cancel, or (paid after the cancel) paid_unfulfillable with the full amount refunded.
      const returned = f.q<{ n: number }>(
        "SELECT coalesce(sum(amount_cents), 0) n FROM refund_records WHERE order_id = ? AND status = 'processed'",
        o.id,
      ).n;
      assert.equal(returned, Number(row.total_cents), `order ${o.id} must be refunded in full`);
    }
  });

  test('a second cancel does not notify attendees again', async () => {
    const f = await ticketingFixture();
    const { ev } = await freeTickets(f, 1);
    const input = {
      eventId: ev.eventId,
      reason: 'venue flooded',
      actorUserId: f.userId,
      origin: ORIGIN,
      now: now(),
    };
    await cancelEvent(f.d1, f.env, input);
    const before = f.q<{ n: number }>("SELECT count(*) n FROM email_log WHERE kind = 'event_change'").n;
    assert.ok(before >= 1);
    await cancelEvent(f.d1, f.env, input).catch(() => undefined);
    assert.equal(
      f.q<{ n: number }>("SELECT count(*) n FROM email_log WHERE kind = 'event_change'").n,
      before,
    );
  });
});

describe('T1 transfer versus admission (D-177)', () => {
  test('a ticket admitted between the "scanned" check and the version bump is not transferred', async () => {
    const f = await ticketingFixture();
    const { tickets, identity, ev } = await freeTickets(f, 1);
    const t = f.q<{ id: string; event_id: string; version: number; qr_salt: string }>(
      'SELECT id, event_id, version, qr_salt FROM tickets WHERE id = ?',
      tickets[0].id,
    );
    const signed = await signTicketQr(
      { ticketId: t.id, version: t.version, eventId: t.event_id, salt: t.qr_salt },
      KEYS,
      'GL1',
    );
    assert.ok(signed.ok);
    const payload = signed.ok ? signed.payload : '';
    const start = Number(f.q<{ s: number }>('SELECT starts_at s FROM events WHERE id = ?', ev.eventId).s);
    const hooked = hookDb(
      f.d1,
      /FROM ticket_presence WHERE ticket_id = \?1 AND day_key = \?2 AND entry_count > 0/,
      async () => {
        const r = await scanTicket(f.d1, {
          eventId: ev.eventId,
          code: payload,
          direction: 'in',
          actor: { kind: 'organizer', userId: f.userId },
          keyring: KEYS,
          now: start - 60,
        });
        assert.equal(r.result, 'admitted');
      },
    );
    await assert.rejects(
      transferTicket(hooked, f.env, {
        ticketId: tickets[0].id,
        identity,
        toName: 'New Holder',
        toEmail: 'new.holder@example.org',
        toEmailConfirm: 'new.holder@example.org',
        ipHash: null,
        origin: ORIGIN,
        now: start - 120,
      }),
      TicketingError,
    );
    const row = f.q<{ version: number; holder_email: string | null }>(
      'SELECT version, holder_email FROM tickets WHERE id = ?',
      tickets[0].id,
    );
    assert.equal(row.version, 1);
    assert.notEqual(row.holder_email, 'new.holder@example.org');
  });
});

describe('transfer limits and display (D-178, D-181)', () => {
  test('at most three transfers a day to one recipient address', async () => {
    const f = await ticketingFixture();
    const { tickets, identity } = await freeTickets(f, 4);
    const go = (i: number) =>
      transferTicket(f.d1, f.env, {
        ticketId: tickets[i].id,
        identity,
        toName: 'Jo Sample',
        toEmail: 'jo@example.org',
        toEmailConfirm: 'jo@example.org',
        ipHash: null,
        origin: ORIGIN,
        now: now(),
      });
    for (let i = 0; i < 3; i++) await go(i);
    await assert.rejects(go(3), (e: unknown) => e instanceof TicketingError && e.code === 'RATE_LIMITED');
    assert.equal(f.q<{ v: number }>('SELECT version v FROM tickets WHERE id = ?', tickets[3].id).v, 1);
  });

  test('shortSender keeps letters only, at most 20, and hides address- or URL-like names', () => {
    assert.equal(shortSender('Maria Sample'), 'Maria');
    assert.equal(shortSender('https://evil.example Click'), 'Someone');
    assert.equal(shortSender('me@evil.example'), 'Someone');
    assert.equal(shortSender('1234 5678'), 'Someone');
    assert.equal(shortSender('A'.repeat(40)).length, 20);
    assert.equal(shortSender('Zoë-Anne'), 'Zoë-Anne');
  });

  test('the purchaser sees the recipient only for the first hop', async () => {
    const f = await ticketingFixture();
    const { orderId, tickets, identity } = await freeTickets(f, 1, {
      policy: { transferAllowed: true, maxTransfersPerTicket: 3 },
    });
    const send = async (id: string, from: typeof identity, to: string) =>
      transferTicket(f.d1, f.env, {
        ticketId: id,
        identity: from,
        toName: 'Next Holder',
        toEmail: to,
        toEmailConfirm: to,
        ipHash: null,
        origin: ORIGIN,
        now: now(),
      });
    await send(tickets[0].id, identity, 'first@example.org');
    let view = await getOrderView(f.d1, { orderId, session: identity, now: now() });
    assert.equal(view!.tickets[0].state, 'transferred_away');
    assert.ok(view!.tickets[0].transferredTo);
    const second = await customerIdentity(f.d1, {
      sessionId: 'csn_second',
      customerProfileId: f.q<{ c: string }>(
        'SELECT customer_profile_id c FROM tickets WHERE id = ?',
        tickets[0].id,
      ).c,
      scope: 'customer:all',
      expiresAt: now() + 3600,
    });
    await send(tickets[0].id, second, 'second@example.org');
    view = await getOrderView(f.d1, { orderId, session: identity, now: now() });
    assert.equal(view!.tickets[0].state, 'transferred_away');
    assert.equal(view!.tickets[0].transferredTo, null);
  });
});

describe('unverified free holds are short and capped (D-173)', () => {
  test('a free hold lasts ten minutes and is extended while the code is entered', async () => {
    const f = await ticketingFixture();
    const ev = await publishedEvent(f, {
      categories: [{ name: 'GA', kind: 'general', price: '0', capacity: '50' }],
    });
    const t0 = now();
    const r = await place(
      f,
      sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 2 }]),
      {
        now: t0,
      },
    );
    const orderId = (await readConfirmToken(f.env, (r as { confirmToken: string }).confirmToken, t0))!;
    assert.equal(
      f.q<{ e: number }>('SELECT expires_at e FROM ticket_holds WHERE order_id = ?', orderId).e,
      t0 + UNVERIFIED_HOLD_SECONDS,
    );
    await extendUnverifiedHold(f.d1, orderId, t0 + 300);
    assert.equal(
      f.q<{ e: number }>('SELECT expires_at e FROM ticket_holds WHERE order_id = ?', orderId).e,
      t0 + 300 + 1800,
    );
    // Only unverified orders are extended.
    await confirmFreeOrder(f.d1, f.env, { orderId, now: t0 + 400, origin: ORIGIN });
    await extendUnverifiedHold(f.d1, orderId, t0 + 5000);
    assert.notEqual(
      f.q<{ e: number }>('SELECT hold_expires_at e FROM ticket_orders WHERE id = ?', orderId).e,
      t0 + 5000 + 1800,
    );
  });

  test('one network address cannot hold more than twice the per-order limit while unverified', async () => {
    const f = await ticketingFixture();
    const ev = await publishedEvent(f, {
      categories: [{ name: 'GA', kind: 'general', price: '0', capacity: '500' }],
    });
    const order = (ip: string) =>
      place(f, sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 10 }]), {
        ipHash: ip,
      });
    await order('ip_a');
    await order('ip_a');
    await assert.rejects(
      order('ip_a'),
      (e: unknown) => e instanceof TicketingError && e.code === 'RATE_LIMITED',
    );
    await order('ip_b');
    assert.equal(f.q<{ n: number }>('SELECT count(*) n FROM ticket_orders').n, 3);
  });

  test('unverified holds are capped at a quarter of an event (at least ten), whatever the address', async () => {
    const f = await ticketingFixture();
    const ev = await publishedEvent(f, {
      categories: [{ name: 'GA', kind: 'general', price: '0', capacity: '40' }],
    });
    const order = (q: number) =>
      place(f, sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: q }]));
    await order(5);
    await order(5);
    await assert.rejects(order(1), (e: unknown) => e instanceof TicketingError && e.code === 'RATE_LIMITED');
    // Confirmed orders no longer count against the unverified cap.
    const first = f.q<{ id: string }>('SELECT id FROM ticket_orders ORDER BY created_at LIMIT 1').id;
    await confirmFreeOrder(f.d1, f.env, { orderId: first, now: now(), origin: ORIGIN });
    await order(1);
  });
});

describe('door sales are idempotent (D-179)', () => {
  const door = async (f: TicketingFixture, ev: Awaited<ReturnType<typeof publishedEvent>>, extra = {}) =>
    issueDoorTickets(f.d1, f.env, {
      eventId: ev.eventId,
      categoryId: ev.categories[0].id,
      quantity: 2,
      method: 'free_issue',
      amountCents: 0,
      actorUserId: f.userId,
      now: now(),
      ...extra,
    });

  test('the same key replays the same order and tickets, a different sale under it is refused', async () => {
    const f = await ticketingFixture();
    const ev = await publishedEvent(f, {
      categories: [{ name: 'GA', kind: 'general', price: '0', capacity: '10' }],
      policy: { doorSalesEnabled: true, doorSalesMethods: ['cash_recorded', 'free_issue'] },
    });
    const a = await door(f, ev, { idempotencyKey: 'door-1' });
    const b = await door(f, ev, { idempotencyKey: 'door-1' });
    assert.equal(b.orderId, a.orderId);
    assert.deepEqual(
      b.tickets.map((t) => t.ticketId),
      a.tickets.map((t) => t.ticketId),
    );
    assert.equal(b.replayed, true);
    assert.equal(f.q<{ n: number }>('SELECT count(*) n FROM tickets').n, 2);
    await assert.rejects(
      door(f, ev, { idempotencyKey: 'door-1', quantity: 3 }),
      (e: unknown) => e instanceof TicketingError && e.code === 'CONFLICT',
    );
    const c = await door(f, ev, { idempotencyKey: 'door-2' });
    assert.notEqual(c.orderId, a.orderId);
    assert.equal(f.q<{ n: number }>('SELECT count(*) n FROM tickets').n, 4);
  });

  test('a door sale after the event has ended is refused and a sale is audited', async () => {
    const f = await ticketingFixture();
    const ev = await publishedEvent(f, {
      categories: [{ name: 'GA', kind: 'general', price: '0', capacity: '10' }],
      policy: { doorSalesEnabled: true, doorSalesMethods: ['cash_recorded', 'free_issue'] },
    });
    await door(f, ev, { idempotencyKey: 'door-a' });
    assert.ok(f.q<{ n: number }>("SELECT count(*) n FROM audit_logs WHERE action LIKE '%door%'").n >= 1);
    const end = Number(f.q<{ e: number }>('SELECT coalesce(ends_at, starts_at + 21600) e FROM events').e);
    await assert.rejects(door(f, ev, { idempotencyKey: 'door-late', now: end + 60 }), TicketingError);
  });
});

describe('recovery answers identically for every address (D-183)', () => {
  test('lookup, token and email run in the deferred work, not in the answer', async () => {
    const f = await ticketingFixture();
    const { tickets } = await freeTickets(f, 1);
    const email = f.q<{ e: string }>(
      'SELECT p.email_normalized e FROM customer_profiles p WHERE p.id = ?',
      f.q<{ c: string }>('SELECT customer_profile_id c FROM tickets WHERE id = ?', tickets[0].id).c,
    ).e;
    const pending: Array<Promise<unknown>> = [];
    const defer = (work: Promise<unknown>) => {
      pending.push(work);
    };
    const known = await requestTicketRecovery(f.d1, f.env, {
      email,
      ipHash: null,
      origin: ORIGIN,
      now: now(),
      defer,
    });
    const unknown = await requestTicketRecovery(f.d1, f.env, {
      email: 'nobody@example.org',
      ipHash: null,
      origin: ORIGIN,
      now: now(),
      defer,
    });
    assert.deepEqual(known, unknown);
    assert.equal(known.message, RECOVERY_RESPONSE_MESSAGE);
    assert.equal(known.sent, false);
    assert.equal(pending.length, 2);
    // Nothing has been sent yet for the known address ... until the deferred work runs.
    await Promise.all(pending);
    assert.equal(
      (await readLocalTestInbox(f.env, email))?.some((m) => m.kind === 'ticket_recovery'),
      true,
    );
    assert.equal((await readLocalTestInbox(f.env, 'nobody@example.org'))?.length ?? 0, 0);
  });

  test('a failing send is swallowed by the deferred work, never shown', async () => {
    const f = await ticketingFixture();
    const pending: Array<Promise<unknown>> = [];
    const r = await requestTicketRecovery(f.d1, { ...f.env, CUSTOMER_LINK_SECRET: undefined } as never, {
      email: 'x@example.org',
      ipHash: null,
      origin: ORIGIN,
      now: now(),
      defer: (w) => {
        pending.push(w);
      },
    }).catch((e) => e);
    // Missing configuration is reported to the operator, not to the visitor's answer shape.
    assert.ok(r instanceof Error || r.message === RECOVERY_RESPONSE_MESSAGE);
    await Promise.all(pending);
  });
});

describe('waitlist double opt-in (D-180)', () => {
  test('joining sends one confirmation; the entry is inactive until the link is confirmed, once', async () => {
    const f = await ticketingFixture();
    const ev = await publishedEvent(f, {
      categories: [{ name: 'One', kind: 'general', price: '0', capacity: '1' }],
    });
    const join = () =>
      joinWaitlist(f.d1, f.env, {
        eventId: ev.eventId,
        categoryId: ev.categories[0].id,
        email: 'wait@example.org',
        quantity: 1,
        origin: ORIGIN,
        now: now(),
      });
    assert.deepEqual(await join(), { joined: true });
    assert.deepEqual(await join(), { joined: true });
    assert.equal(f.q<{ s: string }>('SELECT status s FROM waitlist_entries').s, 'removed');
    const inbox = (await readLocalTestInbox(f.env, 'wait@example.org'))!;
    assert.equal(inbox.length, 1, 'repeat sign-ups must not send a second mail the same day');
    const token = /[?&]t=([A-Za-z0-9_-]{43})/.exec(inbox[0].text)![1];
    assert.equal((await confirmWaitlistEntry(f.d1, f.env, { token: 'bogus', now: now() })).ok, false);
    assert.equal((await confirmWaitlistEntry(f.d1, f.env, { token, now: now() })).ok, true);
    assert.equal(f.q<{ s: string }>('SELECT status s FROM waitlist_entries').s, 'waiting');
    // Pressing the button twice is harmless.
    assert.equal((await confirmWaitlistEntry(f.d1, f.env, { token, now: now() })).ok, true);
    assert.equal(f.q<{ n: number }>('SELECT count(*) n FROM waitlist_entries').n, 1);
  });
});

describe('purchaser email on a placed order is never the cap key by accident', () => {
  test('the unverified-hold guard does not apply to paid orders', async () => {
    const f = await ticketingFixture();
    const ev = await paidEvent(f, '200');
    for (let i = 0; i < 4; i++) await paidOrderPaid(f, ev, 10);
    assert.equal(f.q<{ n: number }>('SELECT count(*) n FROM ticket_orders').n, 4);
  });
});
