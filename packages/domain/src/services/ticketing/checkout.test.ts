/**
 * Events with policies/categories, free RSVP with email verification, idempotency, caps and the
 * "last ticket can't sell twice" race (design §4.2, §5.2, §5.4). Fictional sample data only.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ORIGIN,
  formBody,
  publishedEvent,
  sampleEventInput,
  sampleOrderRequest,
  ticketingFixture,
} from './orders-testing.ts';
import {
  createOrganizerEvent,
  normalizeEventInput,
  publishDecision,
  updateOrganizerEvent,
  recordFirstEventApproval,
} from './events.ts';
import {
  confirmTokenFor,
  orderVerificationCode,
  paidCheckoutMode,
  parseOrderRequest,
  placeOrder,
  readConfirmToken,
  type PlaceOrderResult,
} from './checkout.ts';
import { confirmFreeOrder, confirmOrderByCode } from './issuance.ts';
import { TicketingError } from './orders-shared.ts';
import { readLocalTestInbox } from './email.ts';
import { parseTicketQr, verifyTicketQrMac } from '../../security/ticket-qr.ts';
import { localDevelopmentSecret } from '../../security/env-secret.ts';
import { loadTicketRenderModels } from './render-model.ts';

const now = () => Math.floor(Date.now() / 1000);
const place = (
  f: Awaited<ReturnType<typeof ticketingFixture>>,
  request: ReturnType<typeof sampleOrderRequest>,
  allow: 'free' | 'any' = 'any',
) => placeOrder(f.d1, f.env, { request, allow, ipHash: null, origin: ORIGIN, https: false, now: now() });

async function codeFromInbox(
  f: Awaited<ReturnType<typeof ticketingFixture>>,
  email: string,
): Promise<string> {
  const inbox = await readLocalTestInbox(f.env, email);
  const m = /Your code: (\d{6})/.exec(inbox?.[0]?.text ?? '');
  assert.ok(m, 'verification email in the local inbox');
  return m[1];
}

describe('event create/edit with policies and categories', () => {
  test('validation explains every problem with a field name', () => {
    const r = normalizeEventInput(
      {
        ...sampleEventInput({ orgId: 'org_x' }),
        timezone: 'Mars/Base',
        categories: [
          { name: 'Kids', kind: 'child', price: '0', capacity: '10', maxAge: '30' },
          { name: 'Companion', kind: 'companion', price: '0', capacity: '5', companionOf: '0' },
          { name: 'Table', kind: 'table', price: '0', capacity: '3', seatsPerTicket: '1' },
        ],
        policy: { maxTicketsPerOrder: 50, refundPolicy: 'whenever' },
      },
      now(),
    );
    assert.equal(r.ok, false);
    const fields = r.ok ? [] : r.errors.map((e) => e.field);
    for (const f of [
      'timezone',
      'cat.0.maxAge',
      'cat.1.companionOf',
      'cat.2.seatsPerTicket',
      'policy.maxTicketsPerOrder',
      'policy.refundPolicy',
    ])
      assert.ok(fields.includes(f), `error for ${f} (${fields.join(', ')})`);
  });

  test('first event goes to review; after approval later events publish unless always_review', async () => {
    const f = await ticketingFixture();
    const first = await createOrganizerEvent(f.d1, {
      event: sampleEventInput(f),
      actorUserId: f.userId,
      now: now(),
    });
    assert.equal(first.status, 'pending_review');
    const second = await createOrganizerEvent(f.d1, {
      event: sampleEventInput(f, { title: 'Sample Second Night' }),
      actorUserId: f.userId,
      now: now(),
    });
    assert.equal(second.status, 'pending_review');
    await recordFirstEventApproval(f.d1, first.eventId, now());
    const third = await createOrganizerEvent(f.d1, {
      event: sampleEventInput(f, { title: 'Sample Third Night' }),
      actorUserId: f.userId,
      now: now(),
    });
    assert.equal(third.status, 'approved');
    f.d1.sqlite.exec('UPDATE organizer_profiles SET always_review = 1');
    const organizer = f.q<{ organizer_id: string }>(
      'SELECT organizer_id FROM events WHERE id = ?',
      third.eventId,
    ).organizer_id;
    assert.equal(await publishDecision(f.d1, organizer), 'pending_review');
    const ev = f.q<Record<string, unknown>>(
      'SELECT start_date_local, start_time_local, timezone FROM events WHERE id = ?',
      first.eventId,
    );
    assert.equal(ev.start_time_local, '19:00');
    assert.equal(ev.timezone, 'America/Phoenix');
    const policy = f.q<Record<string, unknown>>(
      'SELECT * FROM event_policies WHERE event_id = ?',
      first.eventId,
    );
    assert.equal(policy.max_tickets_per_order, 10);
    assert.equal(policy.refund_policy, 'until_48h');
  });

  test('categories: companion bound to accessible, group seats, multi-day dates; capacity never below reserved', async () => {
    const f = await ticketingFixture();
    const ev = await publishedEvent(f, {
      categories: [
        { name: 'Accessible seating', kind: 'accessible', price: '0', capacity: '4' },
        { name: 'Companion', kind: 'companion', price: '0', capacity: '4', companionOf: '0' },
        { name: 'Family table', kind: 'table', price: '0', capacity: '2', seatsPerTicket: '8' },
        {
          name: 'Weekend pass',
          kind: 'multi_day',
          price: '0',
          capacity: '10',
          validDays: '2031-03-20, 2031-03-21',
        },
      ],
    });
    const rows = f.all<{
      kind: string;
      capacity: number;
      seats_per_ticket: number;
      requires_companion_of: string | null;
      valid_days_json: string | null;
    }>(
      'SELECT kind, capacity, seats_per_ticket, requires_companion_of, valid_days_json FROM ticket_tiers WHERE event_id = ? ORDER BY sort_order',
      ev.eventId,
    );
    assert.equal(rows[1].requires_companion_of, ev.categories[0].id);
    assert.equal(rows[2].capacity, 16);
    assert.equal(rows[2].seats_per_ticket, 8);
    assert.deepEqual(JSON.parse(rows[3].valid_days_json!), ['2031-03-20', '2031-03-21']);

    // Companion without accessible in the same order is refused.
    await assert.rejects(
      place(f, sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[1].id, quantity: 1 }])),
      (e: TicketingError) => e.code === 'VALIDATION' && /companion/i.test(e.message),
    );
    const ok = await place(
      f,
      sampleOrderRequest(ev.eventId, [
        { categoryId: ev.categories[0].id, quantity: 1 },
        { categoryId: ev.categories[1].id, quantity: 1 },
      ]),
    );
    assert.equal(ok.type, 'verify');
    // Capacity of the accessible category can't go below the 1 reserved.
    const input = sampleEventInput(f, {
      categories: [
        {
          id: ev.categories[0].id,
          name: 'Accessible seating',
          kind: 'accessible',
          price: '0',
          capacity: '0',
        },
        {
          id: ev.categories[1].id,
          name: 'Companion',
          kind: 'companion',
          price: '0',
          capacity: '4',
          companionOf: '0',
        },
      ],
    });
    await assert.rejects(
      updateOrganizerEvent(f.d1, { eventId: ev.eventId, event: input, actorUserId: f.userId, now: now() }),
      TicketingError,
    );
  });
});

describe('free RSVP', () => {
  test('creates a pending order with holds, emails a code, confirming issues one signed ticket per seat', async () => {
    const f = await ticketingFixture();
    const ev = await publishedEvent(f, {
      categories: [{ name: 'General', kind: 'general', price: '0', capacity: '5' }],
    });
    const req = sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 3 }], {
      marketingOptIn: true,
    });
    const r = await place(f, req, 'free');
    assert.equal(r.type, 'verify');
    const orderId = await readConfirmToken(
      f.env,
      (r as Extract<PlaceOrderResult, { type: 'verify' }>).confirmToken,
      now(),
    );
    const order = f.q<Record<string, unknown>>(
      'SELECT status, quantity, verification_required FROM ticket_orders WHERE id = ?',
      orderId,
    );
    assert.deepEqual(order, { status: 'pending_verification', quantity: 3, verification_required: 1 });
    assert.equal(
      f.q<{ reserved_count: number }>(
        'SELECT reserved_count FROM ticket_tiers WHERE id = ?',
        ev.categories[0].id,
      ).reserved_count,
      3,
    );
    assert.equal(
      f.q<{ n: number }>('SELECT count(*) AS n FROM terms_acceptances WHERE context = ?', `order:${orderId}`)
        .n,
      2,
    );
    assert.equal(f.q<{ n: number }>('SELECT count(*) AS n FROM marketing_consents').n, 1);
    assert.equal(f.q<{ n: number }>('SELECT count(*) AS n FROM tickets').n, 0);

    const code = await codeFromInbox(f, req.email);
    assert.equal(code, await orderVerificationCode(f.env, orderId!));
    await assert.rejects(
      confirmOrderByCode(f.d1, f.env, {
        confirmToken: (r as { confirmToken: string }).confirmToken,
        code: code === '000000' ? '111111' : '000000',
        now: now(),
        origin: ORIGIN,
      }),
      (e: TicketingError) => e.code === 'INVALID_CODE',
    );
    const confirmed = await confirmOrderByCode(f.d1, f.env, {
      confirmToken: (r as { confirmToken: string }).confirmToken,
      code,
      now: now(),
      origin: ORIGIN,
    });
    assert.equal(confirmed.issued, 3);
    // Confirming again (double submit, or code then link) never issues more.
    const again = await confirmFreeOrder(f.d1, f.env, { orderId: orderId!, now: now(), origin: ORIGIN });
    assert.equal(again.issued, 0);
    assert.equal(f.q<{ n: number }>('SELECT count(*) AS n FROM tickets WHERE order_id = ?', orderId).n, 3);
    assert.equal(
      f.q<{ s: string }>('SELECT status AS s FROM ticket_orders WHERE id = ?', orderId).s,
      'confirmed',
    );
    const tier = f.q<{ reserved_count: number; sold_count: number }>(
      'SELECT reserved_count, sold_count FROM ticket_tiers WHERE id = ?',
      ev.categories[0].id,
    );
    assert.deepEqual(tier, { reserved_count: 3, sold_count: 3 });
    assert.ok(
      f.q<{ v: number | null }>(
        'SELECT email_verified_at AS v FROM customer_profiles WHERE email_normalized = ?',
        req.email,
      ).v,
    );

    // Every QR verifies against its ticket with the local development key.
    const models = await loadTicketRenderModels(f.d1, f.env, { orderId: orderId! });
    for (const m of models) {
      const parsed = parseTicketQr(m.qrPayload);
      assert.ok(parsed.ok);
      if (!parsed.ok) continue;
      const t = f.q<{ event_id: string; qr_salt: string; version: number }>(
        'SELECT event_id, qr_salt, version FROM tickets WHERE id = ?',
        parsed.ticketId,
      );
      assert.deepEqual(
        await verifyTicketQrMac(
          parsed,
          { eventId: t.event_id, salt: t.qr_salt },
          { GL1: localDevelopmentSecret('TICKET_QR_SECRET_GL1') },
        ),
        { ok: true },
      );
      assert.equal(parsed.version, t.version);
    }
    const inbox = await readLocalTestInbox(f.env, req.email);
    assert.equal(inbox?.[0].kind, 'ticket_confirmation');
    assert.match(inbox![0].text, /\/link\?t=/);
  });

  test('same idempotency key twice returns the same order (double click)', async () => {
    const f = await ticketingFixture();
    const ev = await publishedEvent(f);
    const req = sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 2 }]);
    const [a, b] = await Promise.all([place(f, req), place(f, req)]);
    const ida = await readConfirmToken(f.env, (a as { confirmToken: string }).confirmToken, now());
    const idb = await readConfirmToken(f.env, (b as { confirmToken: string }).confirmToken, now());
    assert.equal(ida, idb);
    assert.equal(f.q<{ n: number }>('SELECT count(*) AS n FROM ticket_orders').n, 1);
    assert.equal(
      f.q<{ r: number }>('SELECT reserved_count AS r FROM ticket_tiers WHERE id = ?', ev.categories[0].id).r,
      2,
    );
  });

  test('identical response when the address already holds the per-event maximum', async () => {
    const f = await ticketingFixture();
    const ev = await publishedEvent(f, {
      policy: { maxTicketsPerOrder: 2 },
      categories: [{ name: 'General', kind: 'general', price: '0', capacity: '50' }],
    });
    const email = 'family@example.org';
    for (let i = 0; i < 3; i++)
      await place(
        f,
        sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 2 }], {
          email,
          emailConfirm: email,
        }),
      );
    const before = f.q<{ n: number }>('SELECT count(*) AS n FROM ticket_orders').n;
    const capped = await place(
      f,
      sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 1 }], {
        email,
        emailConfirm: email,
      }),
    );
    assert.equal(capped.type, 'verify');
    assert.ok((capped as { confirmToken: string }).confirmToken);
    assert.equal(
      f.q<{ n: number }>('SELECT count(*) AS n FROM ticket_orders').n,
      before,
      'no order for the capped request',
    );
    // The code page then behaves exactly like a wrong code.
    await assert.rejects(
      confirmOrderByCode(f.d1, f.env, {
        confirmToken: (capped as { confirmToken: string }).confirmToken,
        code: '123456',
        now: now(),
        origin: ORIGIN,
      }),
      (e: TicketingError) => e.code === 'INVALID_CODE',
    );
  });

  test('wrong codes are limited per order', async () => {
    const f = await ticketingFixture();
    const ev = await publishedEvent(f);
    const r = (await place(
      f,
      sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 1 }]),
    )) as { confirmToken: string };
    let limited = false;
    for (let i = 0; i < 7; i++) {
      try {
        await confirmOrderByCode(f.d1, f.env, {
          confirmToken: r.confirmToken,
          code: '999999',
          now: now(),
          origin: ORIGIN,
        });
      } catch (e) {
        if ((e as TicketingError).code === 'RATE_LIMITED') limited = true;
      }
    }
    assert.ok(limited);
  });

  test('closed at the start time, cancelled events refused, paid tickets refused on the free route', async () => {
    const f = await ticketingFixture();
    const ev = await publishedEvent(f);
    f.d1.sqlite.prepare('UPDATE events SET starts_at = ? WHERE id = ?').run(now() - 10, ev.eventId);
    await assert.rejects(
      place(f, sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 1 }])),
      (e: TicketingError) => e.code === 'CLOSED',
    );
    const paid = await publishedEvent(f, {
      title: 'Sample Paid',
      admissionType: 'paid',
      categories: [{ name: 'Seat', kind: 'general', price: '10', capacity: '5' }],
    });
    await assert.rejects(
      place(
        f,
        sampleOrderRequest(paid.eventId, [{ categoryId: paid.categories[0].id, quantity: 1 }]),
        'free',
      ),
      (e: TicketingError) => e.code === 'VALIDATION',
    );
  });

  test('attendee names are required per ticket when the policy says so', async () => {
    const f = await ticketingFixture();
    const ev = await publishedEvent(f, { policy: { attendeeNamesRequired: true } });
    await assert.rejects(
      place(
        f,
        sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 2 }], {
          attendeeNames: ['Ana Sample'],
        }),
      ),
      (e: TicketingError) => e.details?.fields?.some((x) => x.field === 'attendee_name') === true,
    );
    await assert.rejects(
      place(
        f,
        sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 2 }], {
          attendeeNames: ['Ana Sample', 'ana sample'],
        }),
      ),
      TicketingError,
    );
    const r = (await place(
      f,
      sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 2 }], {
        attendeeNames: ['Ana Sample', 'Ben Sample'],
      }),
    )) as { confirmToken: string };
    const orderId = (await readConfirmToken(f.env, r.confirmToken, now()))!;
    await confirmFreeOrder(f.d1, f.env, { orderId, now: now(), origin: ORIGIN });
    assert.deepEqual(
      f
        .all<{ holder_name: string }>(
          'SELECT holder_name FROM tickets WHERE order_id = ? ORDER BY seq',
          orderId,
        )
        .map((t) => t.holder_name),
      ['Ana Sample', 'Ben Sample'],
    );
  });

  test('form parsing reads qty.<category> fields and the hidden terms documents', () => {
    const body = formBody([
      ['qty.cat_a', '2'],
      ['qty.cat_b.sec_1', '1'],
      ['qty.cat_c', '0'],
      ['purchaserName', '  Sample   Buyer '],
      ['email', 'Buyer@Example.org'],
      ['email_confirm', 'buyer@example.org'],
      ['terms_accept', 'yes'],
      ['terms_slug', 'ticket-terms'],
      ['terms_version', 'v1'],
      ['idempotency_key', 'idem_abcdefghijklmnop'],
    ]);
    const req = parseOrderRequest('evt_1', body);
    assert.deepEqual(req.items, [
      { categoryId: 'cat_a', sectionId: null, quantity: 2 },
      { categoryId: 'cat_b', sectionId: 'sec_1', quantity: 1 },
    ]);
    assert.equal(req.purchaserName, 'Sample Buyer');
    assert.equal(req.termsAccepted, true);
    assert.deepEqual(req.termsDocuments, [{ slug: 'ticket-terms', version: 'v1' }]);
  });
});

describe('inventory races', () => {
  test('the last ticket cannot be sold twice: parallel RSVPs for 1 seat', async () => {
    const f = await ticketingFixture();
    const ev = await publishedEvent(f, {
      categories: [{ name: 'Last seat', kind: 'general', price: '0', capacity: '3' }],
    });
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        place(f, sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 1 }])),
      ),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const soldOut = results.filter(
      (r) => r.status === 'rejected' && (r.reason as TicketingError).code === 'SOLD_OUT',
    );
    assert.equal(ok, 3);
    assert.equal(soldOut.length, 9);
    const remaining = (soldOut[0] as PromiseRejectedResult).reason.details.remaining;
    assert.deepEqual(
      remaining.map((x: { remaining: number }) => x.remaining),
      [0],
    );
    assert.equal(
      f.q<{ r: number }>('SELECT reserved_count AS r FROM ticket_tiers WHERE id = ?', ev.categories[0].id).r,
      3,
    );
  });

  test('parallel paid checkouts for the last seats (local mock Stripe)', async () => {
    const f = await ticketingFixture();
    const ev = await publishedEvent(f, {
      admissionType: 'paid',
      categories: [{ name: 'Seat', kind: 'general', price: '25', capacity: '2' }],
    });
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        place(f, sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 1 }])),
      ),
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled' && r.value.type === 'checkout').length, 2);
    assert.equal(
      f.q<{ r: number }>('SELECT reserved_count AS r FROM ticket_tiers WHERE id = ?', ev.categories[0].id).r,
      2,
    );
  });

  test('an expired hold gives its seat back to the next buyer', async () => {
    const f = await ticketingFixture();
    const ev = await publishedEvent(f, {
      categories: [{ name: 'One', kind: 'general', price: '0', capacity: '1' }],
    });
    await place(f, sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 1 }]));
    await assert.rejects(
      place(f, sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 1 }])),
      (e: TicketingError) => e.code === 'SOLD_OUT',
    );
    f.d1.sqlite.exec(
      'UPDATE ticket_holds SET expires_at = expires_at - 3600; UPDATE ticket_orders SET hold_expires_at = hold_expires_at - 3600',
    );
    const r = await place(
      f,
      sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 1 }]),
    );
    assert.equal(r.type, 'verify');
    assert.equal(f.q<{ n: number }>("SELECT count(*) AS n FROM ticket_orders WHERE status = 'expired'").n, 1);
  });
});

describe('paid checkout gate (T-05)', () => {
  test('production is always closed; preview needs the flag and a test key; local without key is the mock', () => {
    assert.deepEqual(
      paidCheckoutMode({
        ENVIRONMENT: 'production',
        STRIPE_TEST_CHECKOUT: 'true',
        STRIPE_SECRET_KEY: 'sk_test_abc',
      }),
      { open: false, reason: 'production' },
    );
    assert.deepEqual(paidCheckoutMode({ ENVIRONMENT: 'preview', STRIPE_SECRET_KEY: 'sk_test_abc' }), {
      open: false,
      reason: 'disabled',
    });
    assert.deepEqual(paidCheckoutMode({ ENVIRONMENT: 'preview', STRIPE_TEST_CHECKOUT: 'true' }), {
      open: false,
      reason: 'no_test_key',
    });
    assert.equal(
      paidCheckoutMode({
        ENVIRONMENT: 'preview',
        STRIPE_TEST_CHECKOUT: 'true',
        STRIPE_SECRET_KEY: 'sk_test_abc',
      }).open,
      true,
    );
    assert.deepEqual(paidCheckoutMode({ ENVIRONMENT: 'local', STRIPE_TEST_CHECKOUT: 'true' }), {
      open: true,
      mock: true,
    });
    assert.deepEqual(
      paidCheckoutMode({
        ENVIRONMENT: 'staging',
        STRIPE_TEST_CHECKOUT: 'true',
        STRIPE_SECRET_KEY: 'sk_test_abc',
      }),
      { open: false, reason: 'environment' },
    );
  });

  test('closed checkout holds nothing', async () => {
    const f = await ticketingFixture({ STRIPE_TEST_CHECKOUT: 'false' });
    const ev = await publishedEvent(f, {
      admissionType: 'paid',
      categories: [{ name: 'Seat', kind: 'general', price: '25', capacity: '2' }],
    });
    await assert.rejects(
      place(f, sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 1 }])),
      (e: TicketingError) => e.code === 'UNAVAILABLE',
    );
    assert.equal(f.q<{ n: number }>('SELECT count(*) AS n FROM ticket_holds').n, 0);
  });

  test('outside local, a missing link secret fails closed before holding', async () => {
    const f = await ticketingFixture({ ENVIRONMENT: 'preview', STRIPE_TEST_CHECKOUT: 'false' });
    const ev = await publishedEvent(f);
    await assert.rejects(
      place(f, sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 1 }])),
      (e: TicketingError) => e.code === 'UNAVAILABLE',
    );
    assert.equal(f.q<{ n: number }>('SELECT count(*) AS n FROM ticket_holds').n, 0);
    assert.ok(await confirmTokenFor({ ENVIRONMENT: 'local' }, 'ord_x', now() + 60));
  });
});

describe('editing published events (D-168)', () => {
  test('unverified organizer: public content change sends the event back to review; verified: audited in event_changes', async () => {
    const f = await ticketingFixture();
    const ev = await publishedEvent(f);
    const edit = (title: string) => ({
      ...sampleEventInput(f, { title }),
      categories: [
        { id: ev.categories[0].id, name: 'General admission', kind: 'general', price: '0', capacity: '50' },
      ],
    });
    // Same content: stays approved, nothing recorded.
    const same = await updateOrganizerEvent(f.d1, {
      eventId: ev.eventId,
      event: edit('Sample Worship Night'),
      actorUserId: f.userId,
      now: now(),
    });
    assert.equal(same.status, 'approved');
    assert.equal(f.q<{ n: number }>("SELECT count(*) AS n FROM event_changes WHERE kind = 'details'").n, 0);
    // Unverified organizer rewrites the title: back to pending_review, sales paused, audited.
    const r = await updateOrganizerEvent(f.d1, {
      eventId: ev.eventId,
      event: edit('Totally different title'),
      actorUserId: f.userId,
      now: now(),
    });
    assert.equal(r.movedToReview, true);
    assert.equal(
      f.q<{ s: string }>('SELECT status AS s FROM events WHERE id = ?', ev.eventId).s,
      'pending_review',
    );
    await assert.rejects(
      place(f, sampleOrderRequest(ev.eventId, [{ categoryId: ev.categories[0].id, quantity: 1 }])),
      TicketingError,
    );
    assert.equal(f.q<{ n: number }>("SELECT count(*) AS n FROM event_changes WHERE kind = 'details'").n, 1);
    // Staff approve and mark the organizer verified: edits stay published but are recorded.
    f.d1.sqlite.prepare("UPDATE events SET status = 'approved' WHERE id = ?").run(ev.eventId);
    await recordFirstEventApproval(f.d1, ev.eventId, now());
    const v = await updateOrganizerEvent(f.d1, {
      eventId: ev.eventId,
      event: edit('Verified organizer new title'),
      actorUserId: f.userId,
      now: now(),
    });
    assert.equal(v.movedToReview, false);
    assert.equal(v.status, 'approved');
    const rows = f.all<{ before_json: string; after_json: string }>(
      "SELECT before_json, after_json FROM event_changes WHERE kind = 'details' ORDER BY created_at, rowid",
    );
    assert.equal(rows.length, 2);
    assert.equal(JSON.parse(rows[1].before_json).title, 'Totally different title');
    assert.equal(JSON.parse(rows[1].after_json).title, 'Verified organizer new title');
    // always_review forces review again.
    f.d1.sqlite.exec('UPDATE organizer_profiles SET always_review = 1');
    const a = await updateOrganizerEvent(f.d1, {
      eventId: ev.eventId,
      event: edit('Another title again'),
      actorUserId: f.userId,
      now: now(),
    });
    assert.equal(a.movedToReview, true);
  });
});
