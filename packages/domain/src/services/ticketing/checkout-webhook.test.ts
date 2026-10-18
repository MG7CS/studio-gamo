/**
 * Stripe webhook (design §5.2): replay and concurrent duplicates issue exactly one set of tickets; late
 * webhook after hold expiry re-reserves or ends `paid_unfulfillable` with a refund; amount mismatch;
 * session expiry; disputes; unknown types; failures answer 500. Plus refunds, transfers, reissue,
 * recovery, event changes and door issuance on the same fixtures. Sample data only.
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
import { placeOrder, readConfirmToken } from './checkout.ts';
import {
  handleStripeWebhook,
  localMockPaymentWebhook,
  signStripePayload,
  stripeWebhookSecret,
} from './checkout-webhook.ts';
import { confirmFreeOrder, issueDoorTickets } from './issuance.ts';
import { refundTickets } from './refunds.ts';
import { reissueTicket, transferTicket } from './transfers.ts';
import { customerIdentity, getOrderView, listCustomerOrders } from './orders.ts';
import { requestTicketRecovery, RECOVERY_RESPONSE_MESSAGE } from './recovery.ts';
import { cancelEvent, changeEventVenue, refundAfterChange, rescheduleEvent } from './event-changes.ts';
import { joinWaitlist } from './checkout-waitlist.ts';
import { loadOrder, TicketingError } from './orders-shared.ts';
import { loadTicketRenderModels } from './render-model.ts';
import { readLocalTestInbox } from './email.ts';
import { openCustomerLink } from '../customers.ts';
import { parseTicketQr, verifyTicketQrMac } from '../../security/ticket-qr.ts';
import { localDevelopmentSecret } from '../../security/env-secret.ts';

const now = () => Math.floor(Date.now() / 1000);
const KEYS = { GL1: localDevelopmentSecret('TICKET_QR_SECRET_GL1') };

async function paidOrder(f: TicketingFixture, quantity = 2, capacity = '10', price = '20') {
  const ev = await publishedEvent(f, {
    admissionType: 'paid',
    categories: [{ name: 'Seat', kind: 'general', price, capacity }],
  });
  const req = sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity }]);
  const r = await placeOrder(f.d1, f.env, {
    request: req,
    allow: 'any',
    ipHash: null,
    origin: ORIGIN,
    https: false,
    now: now(),
  });
  assert.equal(r.type, 'checkout');
  const order = (await loadOrder(f.d1, (r as { orderId: string }).orderId))!;
  return { ev, req, order, result: r as Extract<typeof r, { type: 'checkout' }> };
}

async function deliver(f: TicketingFixture, rawBody: string, signature?: string) {
  const sig = signature ?? (await signStripePayload(stripeWebhookSecret(f.env)!, rawBody, now()));
  return handleStripeWebhook(f.d1, f.env, { rawBody, signature: sig, ctx: { now: now(), origin: ORIGIN } });
}

async function freeTickets(
  f: TicketingFixture,
  quantity: number,
  opts: Parameters<typeof publishedEvent>[1] = {},
) {
  const ev = await publishedEvent(f, opts);
  const req = sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity }]);
  const r = (await placeOrder(f.d1, f.env, {
    request: req,
    allow: 'any',
    ipHash: null,
    origin: ORIGIN,
    https: false,
    now: now(),
  })) as { confirmToken: string };
  const orderId = (await readConfirmToken(f.env, r.confirmToken, now()))!;
  await confirmFreeOrder(f.d1, f.env, { orderId, now: now(), origin: ORIGIN });
  const tickets = f.all<{ id: string; version: number; customer_profile_id: string }>(
    'SELECT id, version, customer_profile_id FROM tickets WHERE order_id = ? ORDER BY seq',
    orderId,
  );
  const identity = await customerIdentity(f.d1, {
    sessionId: 'csn_test',
    customerProfileId: tickets[0].customer_profile_id,
    scope: 'customer:all',
    expiresAt: now() + 3600,
  });
  return { ev, req, orderId, tickets, identity };
}

describe('Stripe webhook', () => {
  test('signature, test mode and payload checks; unknown types are ignored with 200', async () => {
    const f = await ticketingFixture();
    const body = JSON.stringify({
      id: 'evt_test_unknown',
      object: 'event',
      type: 'customer.created',
      livemode: false,
      data: { object: {} },
    });
    assert.equal((await deliver(f, body, 't=1,v1=00')).status, 400);
    const live = JSON.stringify({
      id: 'evt_test_live',
      type: 'customer.created',
      livemode: true,
      data: { object: {} },
    });
    assert.equal((await deliver(f, live)).status, 400);
    const ignored = await deliver(f, body);
    assert.equal(ignored.status, 200);
    assert.equal(
      f.q<{ status: string }>('SELECT status FROM stripe_webhook_events WHERE id = ?', 'evt_test_unknown')
        .status,
      'ignored',
    );
    const dup = await deliver(f, body);
    assert.equal(dup.body.deduplicated, true);
    const noSecret = await handleStripeWebhook(
      f.d1,
      { DB: f.d1, ENVIRONMENT: 'production' },
      { rawBody: body, signature: 'x', ctx: { now: now(), origin: ORIGIN } },
    );
    assert.equal(noSecret.status, 503);
  });

  test('completed session issues tickets once; replay and concurrent duplicates add nothing', async () => {
    const f = await ticketingFixture();
    const { order } = await paidOrder(f, 3);
    const { rawBody } = await localMockPaymentWebhook(f.env, order, now());
    const [a, b] = await Promise.all([deliver(f, rawBody), deliver(f, rawBody)]);
    const statuses = [a.status, b.status].sort();
    assert.ok(statuses[0] === 200, JSON.stringify([a, b]));
    assert.equal(f.q<{ n: number }>('SELECT count(*) AS n FROM tickets WHERE order_id = ?', order.id).n, 3);
    const replay = await deliver(f, rawBody);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.deduplicated, true);
    // A second delivery with another event id for the same session is also harmless.
    const other = JSON.parse(rawBody);
    other.id = 'evt_local_second_delivery';
    other.type = 'checkout.session.async_payment_succeeded';
    const second = await deliver(f, JSON.stringify(other));
    assert.equal(second.status, 200);
    assert.equal(second.body.outcome, 'already_issued');
    assert.equal(f.q<{ n: number }>('SELECT count(*) AS n FROM tickets WHERE order_id = ?', order.id).n, 3);
    const o = (await loadOrder(f.d1, order.id))!;
    assert.equal(o.status, 'paid');
    assert.equal(o.payment_status, 'paid');
    assert.equal(
      f.q<{ n: number }>('SELECT count(*) AS n FROM payment_records WHERE source_id = ?', order.id).n,
      1,
    );
    const tier = f.q<{ reserved_count: number; sold_count: number }>(
      'SELECT reserved_count, sold_count FROM ticket_tiers WHERE event_id = ?',
      order.event_id,
    );
    assert.deepEqual(tier, { reserved_count: 3, sold_count: 3 });
  });

  test('a processing claim younger than 5 minutes answers 409 so Stripe retries', async () => {
    const f = await ticketingFixture();
    f.d1.sqlite
      .prepare(
        "INSERT INTO stripe_webhook_events (id, event_type, processed_at, status) VALUES ('evt_test_busy', 'x', ?, 'processing')",
      )
      .run(now());
    const body = JSON.stringify({
      id: 'evt_test_busy',
      type: 'customer.created',
      livemode: false,
      data: { object: {} },
    });
    assert.equal((await deliver(f, body)).status, 409);
    f.d1.sqlite
      .prepare("UPDATE stripe_webhook_events SET processed_at = ? WHERE id = 'evt_test_busy'")
      .run(now() - 600);
    assert.equal((await deliver(f, body)).status, 200);
  });

  test('late webhook after hold expiry re-reserves when seats are free', async () => {
    const f = await ticketingFixture();
    const { order } = await paidOrder(f, 2, '5');
    f.d1.sqlite
      .prepare("UPDATE ticket_holds SET status = 'expired', released_at = ? WHERE order_id = ?")
      .run(now(), order.id);
    f.d1.sqlite.prepare("UPDATE ticket_orders SET status = 'expired' WHERE id = ?").run(order.id);
    const { rawBody } = await localMockPaymentWebhook(f.env, order, now());
    const r = await deliver(f, rawBody);
    assert.equal(r.status, 200);
    assert.equal(r.body.outcome, 'issued');
    assert.equal(f.q<{ n: number }>('SELECT count(*) AS n FROM tickets WHERE order_id = ?', order.id).n, 2);
  });

  test('late webhook when the stock is gone → paid_unfulfillable with an automatic (test) refund', async () => {
    const f = await ticketingFixture();
    const { order, ev } = await paidOrder(f, 1, '1');
    f.d1.sqlite
      .prepare("UPDATE ticket_holds SET status = 'expired', released_at = ? WHERE order_id = ?")
      .run(now(), order.id);
    f.d1.sqlite.prepare("UPDATE ticket_orders SET status = 'expired' WHERE id = ?").run(order.id);
    // Someone else takes the last seat.
    await placeOrder(f.d1, f.env, {
      request: sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 1 }]),
      allow: 'any',
      ipHash: null,
      origin: ORIGIN,
      https: false,
      now: now(),
    });
    const { rawBody } = await localMockPaymentWebhook(f.env, order, now());
    const r = await deliver(f, rawBody);
    assert.equal(r.status, 200);
    assert.equal(r.body.outcome, 'paid_unfulfillable');
    assert.equal(r.body.refunded, true);
    assert.equal((await loadOrder(f.d1, order.id))!.status, 'paid_unfulfillable');
    assert.equal(
      f.q<{ s: string }>('SELECT status AS s FROM refund_records WHERE order_id = ?', order.id).s,
      'processed',
    );
    assert.equal(f.q<{ n: number }>('SELECT count(*) AS n FROM tickets WHERE order_id = ?', order.id).n, 0);
    assert.equal(f.q<{ n: number }>("SELECT count(*) AS n FROM email_log WHERE kind = 'staff_alert'").n, 1);
  });

  test('amount or currency mismatch is never fulfilled', async () => {
    const f = await ticketingFixture();
    const { order } = await paidOrder(f, 1);
    const { rawBody } = await localMockPaymentWebhook(f.env, order, now());
    const evt = JSON.parse(rawBody);
    evt.data.object.amount_total = 1;
    const r = await deliver(f, JSON.stringify(evt));
    assert.equal(r.body.outcome, 'paid_unfulfillable');
    assert.equal(f.q<{ n: number }>('SELECT count(*) AS n FROM tickets').n, 0);
    const unpaid = JSON.parse(rawBody);
    unpaid.id = 'evt_local_unpaid';
    unpaid.data.object.payment_status = 'unpaid';
    assert.equal((await deliver(f, JSON.stringify(unpaid))).body.outcome, 'awaiting_payment');
  });

  test('checkout.session.expired releases the holds and expires the order', async () => {
    const f = await ticketingFixture();
    const { order, ev } = await paidOrder(f, 2, '2');
    const { rawBody } = await localMockPaymentWebhook(f.env, order, now(), 'checkout.session.expired');
    const r = await deliver(f, rawBody);
    assert.equal(r.body.outcome, 'released');
    assert.equal((await loadOrder(f.d1, order.id))!.status, 'expired');
    assert.equal(
      f.q<{ r: number }>('SELECT reserved_count AS r FROM ticket_tiers WHERE id = ?', ev.categories[0].id).r,
      0,
    );
  });

  test('dispute voids unscanned tickets; charge.refunded reconciles the total', async () => {
    const f = await ticketingFixture();
    const { order } = await paidOrder(f, 2);
    const { rawBody } = await localMockPaymentWebhook(f.env, order, now());
    await deliver(f, rawBody);
    const pi = (await loadOrder(f.d1, order.id))!.stripe_payment_intent_id;
    const tickets = f.all<{ id: string }>('SELECT id FROM tickets WHERE order_id = ? ORDER BY seq', order.id);
    f.d1.sqlite
      .prepare(
        "INSERT INTO ticket_presence (ticket_id, day_key, event_id, state, entry_count, exit_count, last_scan_at) VALUES (?, '2030-01-01', ?, 'inside', 1, 0, ?)",
      )
      .run(tickets[0].id, order.event_id, now());
    const refunded = await deliver(
      f,
      JSON.stringify({
        id: 'evt_test_refund',
        type: 'charge.refunded',
        livemode: false,
        data: { object: { payment_intent: pi, amount_refunded: 2000 } },
      }),
    );
    assert.equal(refunded.body.outcome, 'reconciled');
    assert.equal((await loadOrder(f.d1, order.id))!.amount_refunded_cents, 2000);
    const dispute = await deliver(
      f,
      JSON.stringify({
        id: 'evt_test_dispute',
        type: 'charge.dispute.created',
        livemode: false,
        data: { object: { payment_intent: pi } },
      }),
    );
    assert.equal(dispute.body.ticketsVoided, 1);
    assert.deepEqual(
      f
        .all<{ status: string }>('SELECT status FROM tickets WHERE order_id = ? ORDER BY seq', order.id)
        .map((t) => t.status),
      ['valid', 'voided'],
    );
    assert.equal((await loadOrder(f.d1, order.id))!.status, 'disputed');
  });

  test('a failure marks the event failed and answers 500', async () => {
    const f = await ticketingFixture();
    const { order } = await paidOrder(f, 1);
    const { rawBody } = await localMockPaymentWebhook(f.env, order, now());
    const broken = { ...f.env, TICKET_QR_SECRET_GL1: undefined, ENVIRONMENT: 'local' };
    // Simulate a crash: the QR keyring throws outside local.
    const r = await handleStripeWebhook(
      f.d1,
      { ...broken, ENVIRONMENT: 'preview', STRIPE_WEBHOOK_SECRET: stripeWebhookSecret(f.env) },
      {
        rawBody,
        signature: await signStripePayload(stripeWebhookSecret(f.env)!, rawBody, now()),
        ctx: { now: now(), origin: ORIGIN },
      },
    );
    assert.equal(r.status, 500);
    const id = JSON.parse(rawBody).id;
    assert.equal(
      f.q<{ status: string }>('SELECT status FROM stripe_webhook_events WHERE id = ?', id).status,
      'failed',
    );
    // Stripe retries: the failed claim is taken again and succeeds.
    const retry = await deliver(f, rawBody);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.outcome, 'issued');
  });
});

describe('refunds', () => {
  test('partial refund changes only the chosen tickets; refunds accumulate; repeating is harmless', async () => {
    const f = await ticketingFixture();
    const { order, ev } = await paidOrder(f, 3, '10', '15');
    await deliver(f, (await localMockPaymentWebhook(f.env, order, now())).rawBody);
    const tickets = f.all<{ id: string }>('SELECT id FROM tickets WHERE order_id = ? ORDER BY seq', order.id);
    const first = await refundTickets(f.d1, f.env, {
      orderId: order.id,
      ticketIds: [tickets[1].id],
      reason: 'Sample request',
      actorUserId: f.userId,
      now: now(),
      origin: ORIGIN,
    });
    assert.equal(first.status, 'processed');
    assert.equal(first.amountCents, 1500);
    assert.deepEqual(
      f
        .all<{ status: string }>('SELECT status FROM tickets WHERE order_id = ? ORDER BY seq', order.id)
        .map((t) => t.status),
      ['valid', 'refunded', 'valid'],
    );
    let o = (await loadOrder(f.d1, order.id))!;
    assert.equal(o.amount_refunded_cents, 1500);
    assert.equal(o.status, 'partially_refunded');
    assert.equal(
      f.q<{ r: number }>('SELECT reserved_count AS r FROM ticket_tiers WHERE id = ?', ev.categories[0].id).r,
      2,
    );
    const again = await refundTickets(f.d1, f.env, {
      orderId: order.id,
      ticketIds: [tickets[1].id],
      reason: 'Sample request',
      actorUserId: f.userId,
      now: now(),
      origin: ORIGIN,
    });
    assert.equal(again.status, 'nothing_to_do');
    // Two concurrent refunds of the same ticket: one moves money.
    const [x, y] = await Promise.all([
      refundTickets(f.d1, f.env, {
        orderId: order.id,
        ticketIds: [tickets[0].id],
        reason: 'Sample one',
        actorUserId: f.userId,
        now: now(),
        origin: ORIGIN,
      }),
      refundTickets(f.d1, f.env, {
        orderId: order.id,
        ticketIds: [tickets[0].id],
        reason: 'Sample two',
        actorUserId: f.userId,
        now: now(),
        origin: ORIGIN,
      }),
    ]);
    assert.deepEqual([x.amountCents, y.amountCents].sort(), [0, 1500]);
    const rest = await refundTickets(f.d1, f.env, {
      orderId: order.id,
      reason: 'Sample rest',
      actorUserId: f.userId,
      now: now(),
      origin: ORIGIN,
    });
    assert.equal(rest.amountCents, 1500);
    o = (await loadOrder(f.d1, order.id))!;
    assert.equal(o.amount_refunded_cents, 4500);
    assert.equal(o.status, 'refunded');
    assert.equal(
      f.q<{ n: number }>('SELECT sum(refunded_quantity) AS n FROM order_items WHERE order_id = ?', order.id)
        .n,
      3,
    );
  });

  test('free orders: cancel chosen tickets, the order is cancelled when none is left', async () => {
    const f = await ticketingFixture();
    const { orderId, tickets } = await freeTickets(f, 2);
    const r = await refundTickets(f.d1, f.env, {
      orderId,
      ticketIds: [tickets[0].id],
      reason: 'Sample cancel',
      actorUserId: f.userId,
      now: now(),
      origin: ORIGIN,
    });
    assert.equal(r.status, 'cancelled_free');
    await refundTickets(f.d1, f.env, {
      orderId,
      reason: 'Sample cancel rest',
      actorUserId: f.userId,
      now: now(),
      origin: ORIGIN,
    });
    assert.equal((await loadOrder(f.d1, orderId))!.status, 'cancelled');
    await assert.rejects(
      refundTickets(f.d1, f.env, { orderId, reason: 'x', actorUserId: f.userId, now: now(), origin: ORIGIN }),
      TicketingError,
    );
  });
});

describe('transfers and reissue', () => {
  test('transfer moves the ticket, kills the old QR and shows "transferred" to the old holder', async () => {
    const f = await ticketingFixture();
    const { orderId, tickets, identity } = await freeTickets(f, 2);
    const before = (await loadTicketRenderModels(f.d1, f.env, { ticketIds: [tickets[0].id] }))[0].qrPayload!;
    await transferTicket(f.d1, f.env, {
      ticketId: tickets[0].id,
      identity,
      toName: 'Jo Sample',
      toEmail: 'jo@example.org',
      toEmailConfirm: 'jo@example.org',
      ipHash: null,
      origin: ORIGIN,
      now: now(),
    });
    const t = f.q<{
      version: number;
      holder_email: string;
      qr_salt: string;
      event_id: string;
      transfer_count: number;
    }>(
      'SELECT version, holder_email, qr_salt, event_id, transfer_count FROM tickets WHERE id = ?',
      tickets[0].id,
    );
    assert.equal(t.version, 2);
    assert.equal(t.holder_email, 'jo@example.org');
    assert.equal(t.transfer_count, 1);
    const old = parseTicketQr(before);
    assert.ok(old.ok);
    if (old.ok) {
      // The old code is dead twice over: wrong version, and its MAC no longer matches the new salt.
      assert.notEqual(old.version, t.version);
      assert.deepEqual(await verifyTicketQrMac(old, { eventId: t.event_id, salt: t.qr_salt }, KEYS), {
        ok: false,
        reason: 'bad_signature',
      });
    }
    const view = await getOrderView(f.d1, { orderId, session: identity, now: now() });
    assert.equal(view!.tickets[0].state, 'transferred_away');
    assert.equal(view!.tickets[0].transferredTo, 'j•••@example.org');
    const inbox = await readLocalTestInbox(f.env, 'jo@example.org');
    assert.equal(inbox?.[0].kind, 'ticket_transfer');
    // The recipient opens the link from the email and sees only that ticket.
    const token = /\/link\?t=([A-Za-z0-9_-]{43})/.exec(inbox![0].text)![1];
    const opened = await openCustomerLink(f.d1, f.env, { token, now: now(), https: false });
    assert.ok(opened.ok);
    const recipient = await customerIdentity(f.d1, opened.ok ? opened.session : null);
    const recView = await getOrderView(f.d1, { orderId, session: recipient, now: now() });
    assert.deepEqual(
      recView!.tickets.map((x) => x.id),
      [tickets[0].id],
    );
    // Reduced view (D-166): no purchase details, totals, lines, email status or other holders.
    assert.equal(recView!.isPurchaser, false);
    assert.equal(recView!.purchase, null);
    assert.deepEqual(recView!.lines, []);
    assert.equal(recView!.emailStatus, null);
    assert.ok(!JSON.stringify(recView).includes(view!.purchase!.purchaserEmail));
    assert.equal(view!.isPurchaser, true);
    assert.equal(view!.lines.length, 1);
    assert.equal(
      f.q<{ n: number }>("SELECT count(*) AS n FROM ticket_access_log WHERE action = 'transfer'").n,
      1,
    );
  });

  test('two transfers of one ticket at once: exactly one wins', async () => {
    const f = await ticketingFixture();
    const { tickets, identity } = await freeTickets(f, 1);
    const results = await Promise.allSettled([
      transferTicket(f.d1, f.env, {
        ticketId: tickets[0].id,
        identity,
        toName: 'A Sample',
        toEmail: 'a@example.org',
        toEmailConfirm: 'a@example.org',
        ipHash: null,
        origin: ORIGIN,
        now: now(),
      }),
      transferTicket(f.d1, f.env, {
        ticketId: tickets[0].id,
        identity,
        toName: 'B Sample',
        toEmail: 'b@example.org',
        toEmailConfirm: 'b@example.org',
        ipHash: null,
        origin: ORIGIN,
        now: now(),
      }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(f.q<{ v: number }>('SELECT version AS v FROM tickets WHERE id = ?', tickets[0].id).v, 2);
  });

  test('policy: transfers off, cutoff and already scanned today are refused', async () => {
    const f = await ticketingFixture();
    const off = await freeTickets(f, 1, { policy: { transferAllowed: false } });
    await assert.rejects(
      transferTicket(f.d1, f.env, {
        ticketId: off.tickets[0].id,
        identity: off.identity,
        toName: 'A Sample',
        toEmail: 'a@example.org',
        toEmailConfirm: 'a@example.org',
        ipHash: null,
        origin: ORIGIN,
        now: now(),
      }),
      (e: TicketingError) => e.code === 'FORBIDDEN',
    );
    const g = await ticketingFixture();
    const soon = await freeTickets(g, 1, { policy: { transferCutoffHours: 24 * 7 }, startsInDays: 3 });
    await assert.rejects(
      transferTicket(g.d1, g.env, {
        ticketId: soon.tickets[0].id,
        identity: soon.identity,
        toName: 'A Sample',
        toEmail: 'a@example.org',
        toEmailConfirm: 'a@example.org',
        ipHash: null,
        origin: ORIGIN,
        now: now(),
      }),
      (e: TicketingError) => e.code === 'CLOSED',
    );
    const h = await ticketingFixture();
    const scanned = await freeTickets(h, 1);
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Phoenix',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    h.d1.sqlite
      .prepare(
        "INSERT INTO ticket_presence (ticket_id, day_key, event_id, state, entry_count, exit_count, last_scan_at) VALUES (?, ?, ?, 'inside', 1, 0, ?)",
      )
      .run(scanned.tickets[0].id, today, scanned.ev.eventId, now());
    await assert.rejects(
      transferTicket(h.d1, h.env, {
        ticketId: scanned.tickets[0].id,
        identity: scanned.identity,
        toName: 'A Sample',
        toEmail: 'a@example.org',
        toEmailConfirm: 'a@example.org',
        ipHash: null,
        origin: ORIGIN,
        now: now(),
      }),
      (e: TicketingError) => /scanned/.test(e.message),
    );
  });

  test('reissue bumps the version (old QR dead) and needs a reason', async () => {
    const f = await ticketingFixture();
    const { tickets } = await freeTickets(f, 1);
    await assert.rejects(
      reissueTicket(f.d1, f.env, {
        ticketId: tickets[0].id,
        reason: '',
        actorUserId: f.userId,
        actorType: 'organizer',
        origin: ORIGIN,
        now: now(),
      }),
      TicketingError,
    );
    const r = await reissueTicket(f.d1, f.env, {
      ticketId: tickets[0].id,
      reason: 'Sample: phone stolen',
      actorUserId: f.userId,
      actorType: 'organizer',
      origin: ORIGIN,
      now: now(),
    });
    assert.equal(r.version, 2);
    assert.equal(
      f.q<{ n: number }>("SELECT count(*) AS n FROM audit_logs WHERE action = 'ticket.reissue'").n,
      1,
    );
  });
});

describe('recovery and manage views', () => {
  test('same answer for unknown and known addresses; link only when tickets exist; lookups logged', async () => {
    const f = await ticketingFixture();
    const { req } = await freeTickets(f, 1);
    const unknown = await requestTicketRecovery(f.d1, f.env, {
      email: 'nobody@example.org',
      ipHash: null,
      origin: ORIGIN,
      now: now(),
    });
    const known = await requestTicketRecovery(f.d1, f.env, {
      email: req.email,
      ipHash: null,
      origin: ORIGIN,
      now: now(),
    });
    assert.equal(unknown.message, RECOVERY_RESPONSE_MESSAGE);
    assert.equal(known.message, unknown.message);
    assert.equal(unknown.sent, false);
    assert.equal(known.sent, true);
    assert.equal(
      f.q<{ n: number }>("SELECT count(*) AS n FROM customer_access_tokens WHERE scope = 'customer:all'").n,
      1,
    );
    assert.equal(
      f.q<{ n: number }>("SELECT count(*) AS n FROM ticket_access_log WHERE action = 'lookup'").n,
      1,
    );
    const inbox = await readLocalTestInbox(f.env, req.email);
    assert.equal(inbox?.[0].kind, 'ticket_recovery');
  });

  test('a customer:all session lists the orders; an order link covers only its order', async () => {
    const f = await ticketingFixture();
    const a = await freeTickets(f, 1);
    const list = await listCustomerOrders(f.d1, a.identity!);
    assert.equal(list.length, 1);
    const scoped = await customerIdentity(f.d1, { ...a.identity!, scope: 'order:ord_other' });
    assert.equal(await getOrderView(f.d1, { orderId: a.orderId, session: scoped, now: now() }), null);
  });

  test('legacy pre-0013 RSVPs stay readable by the same email through recovery', async () => {
    const f = await ticketingFixture();
    const ev = await publishedEvent(f);
    const t = now();
    f.d1.sqlite
      .exec(`INSERT INTO ticket_orders (id, order_number, event_id, purchaser_name, purchaser_email, quantity, order_kind, idempotency_key, status, created_at) VALUES ('ord_legacy', 'GL-LEGACY-1', '${ev.eventId}', 'Old Sample', 'old@example.org', 1, 'free', 'legacy_key', 'confirmed', ${t});
      INSERT INTO tickets (id, order_id, event_id, holder_name, holder_email, qr_token, qr_signature_hash, status, created_at) VALUES ('tkt_legacy', 'ord_legacy', '${ev.eventId}', 'Old Sample', 'old@example.org', 'gamt_abcdefgh_0123456789abcdef0123456789abcdef', 'x', 'valid', ${t});`);
    const r = await requestTicketRecovery(f.d1, f.env, {
      email: 'old@example.org',
      ipHash: null,
      origin: ORIGIN,
      now: t,
    });
    assert.equal(r.sent, true);
    const token = /\/link\?t=([A-Za-z0-9_-]{43})/.exec(
      (await readLocalTestInbox(f.env, 'old@example.org'))![0].text,
    )![1];
    const opened = await openCustomerLink(f.d1, f.env, { token, now: t, https: false });
    const identity = await customerIdentity(f.d1, opened.ok ? opened.session : null);
    const view = await getOrderView(f.d1, { orderId: 'ord_legacy', session: identity, now: t });
    assert.equal(view?.tickets.length, 1);
  });
});

describe('event changes, waitlist and door sales', () => {
  test('cancel voids every ticket, refunds paid orders and emails everyone', async () => {
    const f = await ticketingFixture();
    const { order, ev } = await paidOrder(f, 2);
    await deliver(f, (await localMockPaymentWebhook(f.env, order, now())).rawBody);
    const r = await cancelEvent(f.d1, f.env, {
      eventId: ev.eventId,
      reason: 'Sample: venue flooded',
      actorUserId: f.userId,
      origin: ORIGIN,
      now: now(),
    });
    assert.equal(r.ordersRefunded, 1);
    assert.deepEqual(
      f
        .all<{ status: string }>('SELECT status FROM tickets WHERE order_id = ?', order.id)
        .map((t) => t.status),
      ['refunded', 'refunded'],
    );
    assert.ok(f.q<{ c: number | null }>('SELECT cancelled_at AS c FROM events WHERE id = ?', ev.eventId).c);
    assert.equal(f.q<{ n: number }>("SELECT count(*) AS n FROM email_log WHERE kind = 'event_change'").n, 1);
    assert.ok(
      f.q<{ n: number | null }>("SELECT notified_at AS n FROM event_changes WHERE kind = 'cancelled'").n,
    );
    await assert.rejects(
      placeOrder(f.d1, f.env, {
        request: sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 1 }]),
        allow: 'any',
        ipHash: null,
        origin: ORIGIN,
        https: false,
        now: now(),
      }),
      (e: TicketingError) => e.code === 'CLOSED',
    );
  });

  test('reschedule keeps tickets valid, raises the .ics SEQUENCE and opens buyer refunds', async () => {
    const f = await ticketingFixture();
    const { orderId, ev, identity, tickets } = await freeTickets(f, 2);
    const later = new Date(Date.now() + 40 * 86400_000).toISOString().slice(0, 10);
    await rescheduleEvent(f.d1, f.env, {
      eventId: ev.eventId,
      startDate: later,
      startTime: '18:30',
      timezone: 'America/Phoenix',
      actorUserId: f.userId,
      origin: ORIGIN,
      now: now(),
    });
    assert.equal(f.q<{ v: number }>('SELECT version AS v FROM tickets WHERE id = ?', tickets[0].id).v, 1);
    const e = f.q<{ start_date_local: string; start_time_local: string; rescheduled_from_starts_at: number }>(
      'SELECT start_date_local, start_time_local, rescheduled_from_starts_at FROM events WHERE id = ?',
      ev.eventId,
    );
    assert.equal(e.start_date_local, later);
    assert.equal(e.start_time_local, '18:30');
    assert.ok(e.rescheduled_from_starts_at);
    await changeEventVenue(f.d1, f.env, {
      eventId: ev.eventId,
      venueName: 'Sample New Hall',
      address: '1 Sample Way',
      city: 'Mesa',
      state: 'AZ',
      actorUserId: f.userId,
      origin: ORIGIN,
      now: now(),
    });
    const view = await getOrderView(f.d1, { orderId, session: identity, now: now() });
    assert.equal(view!.changeRefundOpen, true);
    const r = await refundAfterChange(f.d1, f.env, {
      orderId,
      ticketIds: [tickets[1].id],
      identity,
      origin: ORIGIN,
      now: now(),
    });
    assert.equal(r.status, 'cancelled_free');
    assert.equal(f.q<{ n: number }>("SELECT count(*) AS n FROM email_log WHERE kind = 'event_change'").n, 2);
  });

  test('waitlist: released seats email the earliest entries (no reservation)', async () => {
    const f = await ticketingFixture();
    const ev = await publishedEvent(f, {
      categories: [{ name: 'One', kind: 'general', price: '0', capacity: '1' }],
    });
    await placeOrder(f.d1, f.env, {
      request: sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 1 }]),
      allow: 'any',
      ipHash: null,
      origin: ORIGIN,
      https: false,
      now: now(),
    });
    await joinWaitlist(f.d1, {
      eventId: ev.eventId,
      categoryId: ev.categories[0].id,
      email: 'wait@example.org',
      quantity: 1,
      now: now(),
    });
    await joinWaitlist(f.d1, {
      eventId: ev.eventId,
      categoryId: ev.categories[0].id,
      email: 'wait@example.org',
      quantity: 1,
      now: now(),
    });
    assert.equal(f.q<{ n: number }>('SELECT count(*) AS n FROM waitlist_entries').n, 1);
    f.d1.sqlite.exec(
      'UPDATE ticket_holds SET expires_at = expires_at - 3600; UPDATE ticket_orders SET hold_expires_at = hold_expires_at - 3600',
    );
    await placeOrder(f.d1, f.env, {
      request: sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 1 }]),
      allow: 'any',
      ipHash: null,
      origin: ORIGIN,
      https: false,
      now: now(),
    });
    assert.equal(f.q<{ s: string }>('SELECT status AS s FROM waitlist_entries').s, 'notified');
    assert.equal((await readLocalTestInbox(f.env, 'wait@example.org'))?.[0].kind, 'waitlist_available');
  });

  test('door tickets: policy gate, one batch, signed QR', async () => {
    const f = await ticketingFixture();
    const closed = await publishedEvent(f);
    await assert.rejects(
      issueDoorTickets(f.d1, f.env, {
        eventId: closed.eventId,
        categoryId: closed.categories[0].id,
        quantity: 1,
        method: 'free_issue',
        amountCents: 0,
        actorUserId: f.userId,
        now: now(),
      }),
      (e: TicketingError) => e.code === 'FORBIDDEN',
    );
    const ev = await publishedEvent(f, {
      title: 'Sample Door Night',
      policy: { doorSalesEnabled: true, doorSalesMethods: ['cash_recorded', 'free_issue'] },
    });
    await assert.rejects(
      issueDoorTickets(f.d1, f.env, {
        eventId: ev.eventId,
        categoryId: ev.categories[0].id,
        quantity: 3,
        method: 'cash_recorded',
        amountCents: 1000,
        scannerSessionId: 'scs_sample',
        now: now(),
      }),
      (e: TicketingError) => e.code === 'VALIDATION',
    );
    const r = await issueDoorTickets(f.d1, f.env, {
      eventId: ev.eventId,
      categoryId: ev.categories[0].id,
      quantity: 2,
      method: 'cash_recorded',
      amountCents: 2000,
      holderName: 'Walk In',
      scannerSessionId: 'scs_sample',
      now: now(),
    });
    assert.equal(r.tickets.length, 2);
    const o = (await loadOrder(f.d1, r.orderId))!;
    assert.deepEqual(
      [o.source, o.status, o.payment_method, o.total_cents],
      ['door', 'paid', 'cash_recorded', 2000],
    );
    const parsed = parseTicketQr(r.tickets[0].qrPayload);
    assert.ok(parsed.ok);
    const sold = f.q<{ sold_count: number }>(
      'SELECT sold_count FROM ticket_tiers WHERE id = ?',
      ev.categories[0].id,
    ).sold_count;
    assert.equal(sold, 2);
  });
});
