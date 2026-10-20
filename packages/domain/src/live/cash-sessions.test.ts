import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runBatch } from '../security/sql-database.ts';
import {
  cashMovementStatement,
  cashSessionSummary,
  closeCashSession,
  findOpenCashSession,
  listCashMovements,
  listCashSessions,
  openCashSession,
} from './cash-sessions.ts';
import { paidTestDatabase, PAID_NOW, seedPaidEvent } from './paid-testing.ts';
import { PaidError } from './paid-types.ts';
import type { StaffActor } from './staff-links.ts';

async function setup() {
  const { d1, db } = await paidTestDatabase();
  const seed = seedPaidEvent(d1);
  d1.sqlite.exec(`
    INSERT INTO staff_links (id, organization_id, event_id, label, token_hash, pin_hash, pin_salt, can_check_in, can_sell, can_comp, expires_at)
      VALUES ('stf_sell', 'org_1', 'evt_1', 'Box office', 'h1', 'p', 's', 1, 1, 0, ${PAID_NOW + 90 * 86_400}),
             ('stf_check', 'org_1', 'evt_1', 'Scanner', 'h2', 'p', 's', 1, 0, 0, ${PAID_NOW + 90 * 86_400});
  `);
  const staff = (id: string, sell: boolean): StaffActor => ({
    kind: 'staff',
    staffLinkId: id,
    organizationId: seed.organizationId,
    scopeId: seed.eventId,
    label: id,
    permissions: { checkIn: true, sell, comp: false },
  });
  return {
    d1,
    db,
    seed,
    seller: staff('stf_sell', true),
    checker: staff('stf_check', false),
    organizer: {
      kind: 'organizer',
      organizerId: seed.organizerId,
      organizationId: seed.organizationId,
    } as StaffActor,
  };
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (error) {
    assert.ok(error instanceof PaidError, String(error));
    return error.code;
  }
  return 'ok';
}

test('open, record, close: expected = float + sales − refunds, difference = counted − expected', async () => {
  const { db, seed, seller } = await setup();
  const session = await openCashSession(db, {
    occurrenceId: seed.occurrenceId,
    actor: seller,
    floatCents: 10_000,
    now: PAID_NOW,
  });
  assert.equal(session.status, 'open');
  assert.equal(session.openedBy, 'Box office');
  assert.equal(
    (await findOpenCashSession(db, { occurrenceId: seed.occurrenceId, actor: seller }))?.id,
    session.id,
  );

  await runBatch(db, [
    cashMovementStatement({
      sessionId: session.id,
      kind: 'sale',
      orderId: null,
      amountCents: 4000,
      receivedCents: 5000,
      changeCents: 1000,
      now: PAID_NOW,
    }),
    cashMovementStatement({
      sessionId: session.id,
      kind: 'sale',
      orderId: null,
      amountCents: 2000,
      receivedCents: 2000,
      changeCents: 0,
      now: PAID_NOW,
    }),
    cashMovementStatement({
      sessionId: session.id,
      kind: 'refund',
      orderId: null,
      amountCents: 2000,
      reason: 'Wrong type',
      now: PAID_NOW,
    }),
  ]);
  const open = await cashSessionSummary(db, session.id);
  assert.equal(open.salesCents, 6000);
  assert.equal(open.refundsCents, 2000);
  assert.equal(open.expectedCents, 14_000);
  assert.equal(open.differenceCents, null);

  const closed = await closeCashSession(db, {
    sessionId: session.id,
    actor: seller,
    countedCents: 13_500,
    note: 'Short $5',
    now: PAID_NOW + 3600,
  });
  assert.equal(closed.status, 'closed');
  assert.equal(closed.expectedCents, 14_000);
  assert.equal(closed.countedCents, 13_500);
  assert.equal(closed.differenceCents, -500);
  assert.equal((await listCashMovements(db, session.id)).length, 3);

  const all = await listCashSessions(db, seed.organizationId, seed.eventId);
  assert.equal(all.length, 1);
  assert.equal(all[0].differenceCents, -500);
  assert.deepEqual(await listCashSessions(db, 'org_other', seed.eventId), []);
});

test('a closed session refuses every change', async () => {
  const { db, seed, seller } = await setup();
  const session = await openCashSession(db, {
    occurrenceId: seed.occurrenceId,
    actor: seller,
    floatCents: 0,
    now: PAID_NOW,
  });
  await closeCashSession(db, { sessionId: session.id, actor: seller, countedCents: 0, now: PAID_NOW + 1 });
  await assert.rejects(
    runBatch(db, [
      cashMovementStatement({
        sessionId: session.id,
        kind: 'sale',
        orderId: null,
        amountCents: 100,
        receivedCents: 100,
        changeCents: 0,
        now: PAID_NOW + 2,
      }),
    ]),
  );
  assert.equal(
    await code(
      closeCashSession(db, { sessionId: session.id, actor: seller, countedCents: 5, now: PAID_NOW + 3 }),
    ),
    'session_closed',
  );
  const after = await cashSessionSummary(db, session.id);
  assert.equal(after.salesCents, 0);
  assert.equal(after.countedCents, 0);
  // A new drawer may be opened after the close.
  assert.equal(
    (
      await openCashSession(db, {
        occurrenceId: seed.occurrenceId,
        actor: seller,
        floatCents: 0,
        now: PAID_NOW + 4,
      })
    ).status,
    'open',
  );
});

test('one open drawer per actor per date; check-in-only links cannot open one', async () => {
  const { db, seed, seller, checker, organizer } = await setup();
  await openCashSession(db, { occurrenceId: seed.occurrenceId, actor: seller, floatCents: 0, now: PAID_NOW });
  assert.equal(
    await code(
      openCashSession(db, { occurrenceId: seed.occurrenceId, actor: seller, floatCents: 0, now: PAID_NOW }),
    ),
    'already_done',
  );
  assert.equal(
    await code(
      openCashSession(db, { occurrenceId: seed.occurrenceId, actor: checker, floatCents: 0, now: PAID_NOW }),
    ),
    'forbidden',
  );
  // The organizer has their own drawer.
  assert.equal(
    (
      await openCashSession(db, {
        occurrenceId: seed.occurrenceId,
        actor: organizer,
        floatCents: 500,
        now: PAID_NOW,
      })
    ).status,
    'open',
  );
  assert.equal(
    await code(
      openCashSession(db, { occurrenceId: seed.occurrenceId, actor: seller, floatCents: -1, now: PAID_NOW }),
    ),
    'invalid',
  );
});

test('refund movements need a reason; staff close only their own drawer', async () => {
  const { db, seed, seller, organizer } = await setup();
  assert.throws(
    () =>
      cashMovementStatement({
        sessionId: 'csh_x',
        kind: 'refund',
        orderId: null,
        amountCents: 100,
        reason: ' ',
        now: PAID_NOW,
      }),
    PaidError,
  );
  const mine = await openCashSession(db, {
    occurrenceId: seed.occurrenceId,
    actor: organizer,
    floatCents: 0,
    now: PAID_NOW,
  });
  assert.equal(
    await code(closeCashSession(db, { sessionId: mine.id, actor: seller, countedCents: 0, now: PAID_NOW })),
    'not_found',
  );
  const theirs = await openCashSession(db, {
    occurrenceId: seed.occurrenceId,
    actor: seller,
    floatCents: 0,
    now: PAID_NOW,
  });
  // An organizer may close a staff drawer (for example one left open).
  assert.equal(
    (await closeCashSession(db, { sessionId: theirs.id, actor: organizer, countedCents: 0, now: PAID_NOW }))
      .status,
    'closed',
  );
});

test('a drawer cannot be opened on another organization’s date', async () => {
  const { d1, db, seller } = await setup();
  const other = seedPaidEvent(d1, {}, '2');
  assert.equal(
    await code(
      openCashSession(db, { occurrenceId: other.occurrenceId, actor: seller, floatCents: 0, now: PAID_NOW }),
    ),
    'forbidden',
  );
});
