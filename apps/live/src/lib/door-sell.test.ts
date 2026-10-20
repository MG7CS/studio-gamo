import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PaidError, cashSessionSummary, findOpenCashSession, markOrderPaid } from '@gamo/domain';
import {
  doorCancelSale,
  doorCloseDrawer,
  doorOpenDrawer,
  doorQuote,
  doorRefund,
  doorSellCash,
  doorSellComp,
  doorSellPhone,
  doorSellReader,
  doorSimulateTap,
  emailDoorTickets,
  optionalEmail,
  parseSelection,
  serializeSelection,
  stepSelection,
} from './door-sell';
import { NOW, PAID_ENV, doorFixture } from './door-testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (error) {
    assert.ok(error instanceof PaidError, String(error));
    return error.detail ? `${error.code}.${error.detail}` : error.code;
  }
  return 'ok';
}

function insertReader(d1: { sqlite: { exec(sql: string): void } }, account: string | null) {
  d1.sqlite.exec(`
    INSERT INTO terminal_locations (id, organization_id, stripe_location_id, stripe_account_id) VALUES ('tml_1', 'org_1', 'tml_stripe_1', ${account ? `'${account}'` : 'NULL'});
    INSERT INTO readers (id, organization_id, location_id, label, stripe_reader_id, stripe_account_id, status)
      VALUES ('rdr_1', 'org_1', 'tml_1', 'Box office reader', 'tmr_1', ${account ? `'${account}'` : 'NULL'}, 'online');
  `);
}

test('selection in the address: parse, serialize and step, never below 0 or above 50', () => {
  const sel = parseSelection('tty_general_1:2,tty_vip_1:1,bad:3,tty_x:0,tty_y:abc');
  assert.deepEqual(
    [...sel.entries()],
    [
      ['tty_general_1', 2],
      ['tty_vip_1', 1],
    ],
  );
  assert.equal(serializeSelection(sel), 'tty_general_1:2,tty_vip_1:1');
  assert.equal(serializeSelection(stepSelection(sel, 'tty_vip_1', -1)), 'tty_general_1:2');
  assert.equal(serializeSelection(stepSelection(new Map(), 'tty_a', 1)), 'tty_a:1');
  assert.equal(stepSelection(new Map([['tty_a', 50]]), 'tty_a', 1).get('tty_a'), 50);
  assert.equal(parseSelection('tty_a:99').get('tty_a'), 50);
  assert.equal(parseSelection(null).size, 0);
});

test('optional email: empty is null, a bad address is refused', () => {
  assert.equal(optionalEmail(''), null);
  assert.equal(optionalEmail(' Guest@Example.org '), 'guest@example.org');
  assert.throws(
    () => optionalEmail('nope'),
    (e: unknown) => e instanceof PaidError && e.detail === 'email',
  );
});

test('door quote: server prices, cash total, card total only when it differs', async () => {
  const { db, seed, organizer } = await doorFixture();
  const quote = await doorQuote(db, PAID_ENV, organizer, new Map([[seed.generalTypeId, 2]]), NOW);
  assert.equal(quote.totalCents, 4000);
  assert.equal(quote.cardTotalCents, null);
  assert.deepEqual(quote.lines, [{ label: 'General × 2', amount: '$40.00' }]);
});

test('cash: needs an open drawer, records change due, admits, emails when asked', async () => {
  const fx = await doorFixture();
  const seller = fx.staff({ checkIn: true, sell: true });
  const sel = new Map([[fx.seed.generalTypeId, 2]]);
  assert.equal(
    await code(doorSellCash(fx.deps, seller, { selection: sel, received: '50', email: '', now: NOW })),
    'session_closed.no_open_session',
  );
  assert.equal(await code(doorOpenDrawer(fx.deps, seller, { float: 'abc', now: NOW })), 'invalid.float');
  await doorOpenDrawer(fx.deps, seller, { float: '100', now: NOW });
  assert.equal(
    await code(doorSellCash(fx.deps, seller, { selection: sel, received: '30', email: '', now: NOW })),
    'invalid.received',
  );
  assert.equal(
    await code(doorSellCash(fx.deps, seller, { selection: new Map(), received: '30', email: '', now: NOW })),
    'invalid.lines',
  );
  const sale = await doorSellCash(fx.deps, seller, {
    selection: sel,
    received: '50.00',
    email: 'guest@example.org',
    now: NOW,
  });
  assert.equal(sale.emailed, true);
  assert.equal(fx.emails.length, 1);
  assert.equal(fx.emails[0].to, 'guest@example.org');
  assert.match(fx.emails[0].text, /admitted at the door with 2 tickets/);
  assert.match(fx.emails[0].text, /https:\/\/live\.example\/orders\//);
  const drawer = await findOpenCashSession(fx.db, {
    occurrenceId: fx.seed.occurrenceId,
    actor: seller.actor,
  });
  assert.equal(drawer?.expectedCents, 10_000 + 4000);
});

test('an email that cannot be sent never undoes the sale', async () => {
  const fx = await doorFixture({ failEmail: true });
  await doorOpenDrawer(fx.deps, fx.organizer, { float: '0', now: NOW });
  const sale = await doorSellCash(fx.deps, fx.organizer, {
    selection: new Map([[fx.seed.generalTypeId, 1]]),
    received: '20',
    email: 'guest@example.org',
    now: NOW,
  });
  assert.equal(sale.emailed, false);
  assert.equal(
    (fx.d1.sqlite.prepare('SELECT status FROM orders WHERE id = ?').get(sale.orderId) as { status: string })
      .status,
    'paid',
  );
});

test('comp: only with the comp permission and a reason', async () => {
  const fx = await doorFixture();
  const sel = new Map([[fx.seed.generalTypeId, 1]]);
  const seller = fx.staff({ sell: true }, 'stf_sell');
  assert.equal(
    await code(doorSellComp(fx.deps, seller, { selection: sel, reason: 'Guest', email: '', now: NOW })),
    'forbidden.comp',
  );
  const comper = fx.staff({ sell: true, comp: true }, 'stf_comp');
  assert.equal(
    await code(doorSellComp(fx.deps, comper, { selection: sel, reason: '  ', email: '', now: NOW })),
    'invalid.comp_reason',
  );
  const sale = await doorSellComp(fx.deps, comper, {
    selection: sel,
    reason: 'Band guest',
    email: '',
    now: NOW,
  });
  assert.equal(sale.emailed, null);
});

test('buyer’s phone: checkout through the routing, flushed; cancel frees the seats', async () => {
  const fx = await doorFixture();
  const sale = await doorSellPhone(fx.deps, fx.organizer, {
    selection: new Map([[fx.seed.generalTypeId, 1]]),
    email: '',
    eventSlug: 'gospel-night-1',
    now: NOW,
  });
  const created = fx.fake.calls.find((c) => c.method === 'createCheckout');
  assert.ok(created);
  assert.equal(
    (created.args[0] as { successUrl: string }).successUrl,
    'https://live.example/events/gospel-night-1',
  );
  assert.equal(fx.fake.flushes(), 1);
  const released = await doorCancelSale(fx.deps, fx.organizer, { orderId: sale.orderId, now: NOW + 10 });
  assert.equal(released, true);
  assert.ok(fx.fake.calls.some((c) => c.method === 'expireCheckout'));
  assert.equal(fx.fake.flushes(), 2);
});

test('card payments unavailable: phone and reader are refused with the reason', async () => {
  const fx = await doorFixture({ available: false });
  const sel = new Map([[fx.seed.generalTypeId, 1]]);
  assert.equal(
    await code(doorSellPhone(fx.deps, fx.organizer, { selection: sel, email: '', eventSlug: 'x', now: NOW })),
    'payments_unavailable.mode_not_chosen',
  );
  assert.equal(
    await code(
      doorSellReader(fx.deps, fx.organizer, { selection: sel, readerId: 'rdr_1', email: '', now: NOW }),
    ),
    'payments_unavailable.mode_not_chosen',
  );
});

test('card reader: sent to the reader, simulated tap in test mode, then a card refund through Stripe', async () => {
  const fx = await doorFixture();
  insertReader(fx.d1, fx.seed.connectedAccountId);
  const sale = await doorSellReader(fx.deps, fx.organizer, {
    selection: new Map([[fx.seed.generalTypeId, 1]]),
    readerId: 'rdr_1',
    email: '',
    now: NOW,
  });
  assert.ok(fx.fake.calls.some((c) => c.method === 'processPaymentIntentOnReader'));
  await doorSimulateTap(fx.deps, fx.organizer, { orderId: sale.orderId, now: NOW });
  assert.ok(fx.fake.calls.some((c) => c.method === 'presentPaymentMethod'));
  // The webhook's part: the payment succeeded.
  const pi = (
    fx.d1.sqlite.prepare('SELECT payment_intent_id FROM orders WHERE id = ?').get(sale.orderId) as {
      payment_intent_id: string;
    }
  ).payment_intent_id;
  const paid = await markOrderPaid(fx.db, PAID_ENV, {
    orderId: sale.orderId,
    amountCents: 2000,
    currency: 'usd',
    providerRef: pi,
    stripeAccountId: fx.seed.connectedAccountId,
    admit: true,
    now: NOW + 5,
  });
  assert.equal(paid.outcome, 'paid');
  assert.equal(
    await code(doorRefund(fx.deps, fx.organizer, { orderId: sale.orderId, reason: '', now: NOW + 10 })),
    'invalid.reason',
  );
  const key = await doorRefund(fx.deps, fx.organizer, {
    orderId: sale.orderId,
    reason: 'Wrong date',
    now: NOW + 10,
  });
  assert.match(key, /^door-ok-refund/);
  assert.ok(fx.fake.calls.some((c) => c.method === 'refund'));
});

test('cash refund lowers the drawer; close shows the difference', async () => {
  const fx = await doorFixture();
  await doorOpenDrawer(fx.deps, fx.organizer, { float: '50', now: NOW });
  const sale = await doorSellCash(fx.deps, fx.organizer, {
    selection: new Map([[fx.seed.generalTypeId, 1]]),
    received: '20',
    email: '',
    now: NOW,
  });
  assert.equal(
    await doorRefund(fx.deps, fx.organizer, { orderId: sale.orderId, reason: 'Left early', now: NOW + 60 }),
    'door-ok-refunded',
  );
  const closedId = await doorCloseDrawer(fx.deps, fx.organizer, { counted: '49', note: '', now: NOW + 120 });
  const closed = await cashSessionSummary(fx.db, closedId);
  assert.equal(closed.expectedCents, 5000);
  assert.equal(closed.differenceCents, -100);
  assert.equal(
    await code(doorCloseDrawer(fx.deps, fx.organizer, { counted: '1', note: '', now: NOW + 130 })),
    'session_closed.no_open_session',
  );
});

test('emailing tickets: only for this door’s paid sales', async () => {
  const fx = await doorFixture();
  await doorOpenDrawer(fx.deps, fx.organizer, { float: '0', now: NOW });
  const sale = await doorSellCash(fx.deps, fx.organizer, {
    selection: new Map([[fx.seed.generalTypeId, 1]]),
    received: '20',
    email: '',
    now: NOW,
  });
  assert.equal(
    await emailDoorTickets(fx.deps, fx.organizer, { orderId: sale.orderId, to: 'a@example.org', now: NOW }),
    true,
  );
  assert.equal(
    await code(
      emailDoorTickets(fx.deps, fx.organizer, { orderId: 'ord_missing', to: 'a@example.org', now: NOW }),
    ),
    'not_found',
  );
});
