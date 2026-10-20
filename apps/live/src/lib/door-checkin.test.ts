import assert from 'node:assert/strict';
import { test } from 'node:test';
import { issueCompOrder, loadOrderTickets, ticketCredential } from '@gamo/domain';
import {
  doorCheckIn,
  doorCheckInMessage,
  doorCounts,
  setDoorCheckIn,
  ticketCheckInMessage,
} from './door-checkin';
import { NOW, PAID_ENV, doorFixture } from './door-testing';

const when = (at: number) => `T${at}`;

async function ticketCode(fx: Awaited<ReturnType<typeof doorFixture>>, quantity = 1): Promise<string[]> {
  const comp = await issueCompOrder(fx.db, PAID_ENV, {
    organizationId: fx.seed.organizationId,
    eventId: fx.seed.eventId,
    occurrenceId: fx.seed.occurrenceId,
    lines: [{ ticketTypeId: fx.seed.generalTypeId, quantity }],
    compReason: 'Guest',
    buyerName: 'Ana Moreno',
    now: NOW - 60,
  });
  const tickets = await loadOrderTickets(fx.db, comp.orderId);
  return Promise.all(tickets.map((t) => ticketCredential(PAID_ENV, t)));
}

test('ticket messages say plainly whether to admit', () => {
  const base = { ticketId: 'tkt_1', holder: 'Ana M.', ticketType: 'General', people: 1 };
  assert.deepEqual(ticketCheckInMessage({ outcome: 'admitted', ...base }, when), {
    ok: true,
    message: 'Welcome, Ana M. Admit 1 person (General).',
  });
  assert.equal(
    ticketCheckInMessage({ outcome: 'already_admitted', checkedInAt: 5, ...base }, when).message,
    'This ticket was already used at T5 (Ana M.).',
  );
  assert.match(ticketCheckInMessage({ outcome: 'refunded' }, when).message, /refunded/);
  assert.match(ticketCheckInMessage({ outcome: 'replaced' }, when).message, /old copy/);
  assert.match(ticketCheckInMessage({ outcome: 'wrong_date', ticketStartsAt: 9 }, when).message, /T9/);
  assert.equal(ticketCheckInMessage({ outcome: 'not_found' }, when).ok, false);
});

test('staff are not told to press a button they do not have when check-in is closed', () => {
  const closed = { kind: 'ticket', result: { outcome: 'outside_window' } } as const;
  assert.match(doorCheckInMessage(closed, when, NOW, true).message, /Open check-in now/);
  assert.match(doorCheckInMessage(closed, when, NOW, false).message, /an organizer can open it early/);
});

test('a paid ticket checks in once (first scan wins), counted in tickets', async () => {
  const fx = await doorFixture();
  const [code] = await ticketCode(fx);
  const scanner = fx.staff({ checkIn: true });
  const first = await doorCheckIn(fx.db, PAID_ENV, scanner, { code, now: NOW });
  assert.equal(first.ok, true);
  assert.match(first.message, /Admit 1 person/);
  assert.deepEqual(first.counts, { checkedIn: 1, expected: 1, unit: 'tickets' });
  const again = await doorCheckIn(fx.db, PAID_ENV, fx.organizer, { code, now: NOW + 5 });
  assert.equal(again.ok, false);
  assert.match(again.message, /already used/);
  const by = fx.d1.sqlite.prepare('SELECT checked_in_by FROM tickets').get() as { checked_in_by: string };
  assert.equal(by.checked_in_by, 'staff:stf_test');
});

test('a link without check in may not check people in; empty and unknown codes are answered', async () => {
  const fx = await doorFixture();
  const [code] = await ticketCode(fx);
  const seller = fx.staff({ sell: true });
  const denied = await doorCheckIn(fx.db, PAID_ENV, seller, { code, now: NOW });
  assert.deepEqual(denied, { ok: false, message: 'This link may not check people in.', counts: null });
  assert.equal(
    (await doorCheckIn(fx.db, PAID_ENV, fx.organizer, { code: '  ', now: NOW })).message,
    'Type or scan a code first.',
  );
  const unknown = await doorCheckIn(fx.db, PAID_ENV, fx.organizer, { code: 'ABCDEFGHJK', now: NOW });
  assert.equal(unknown.ok, false);
});

test('outside the window nobody is admitted; organizers open check-in by hand, staff may not', async () => {
  const fx = await doorFixture({ startsAt: NOW + 10 * 86_400 });
  const [code] = await ticketCode(fx);
  const closed = await doorCheckIn(fx.db, PAID_ENV, fx.organizer, { code, now: NOW });
  assert.equal(closed.ok, false);
  assert.equal(
    await setDoorCheckIn(fx.db, fx.staff({ checkIn: true }), { open: true, now: NOW }),
    'door-e-forbidden',
  );
  assert.equal(await setDoorCheckIn(fx.db, fx.organizer, { open: true, now: NOW }), 'door-ok-checkin-opened');
  const access = { ...fx.organizer, occurrence: { ...fx.organizer.occurrence, openedAt: NOW } };
  const opened = await doorCheckIn(fx.db, PAID_ENV, access, { code, now: NOW + 1 });
  assert.equal(opened.ok, true);
  assert.equal(
    await setDoorCheckIn(fx.db, fx.organizer, { open: false, now: NOW }),
    'door-ok-checkin-closed',
  );
});

test('door counts: tickets for paid events', async () => {
  const fx = await doorFixture();
  await ticketCode(fx, 3);
  assert.deepEqual(await doorCounts(fx.db, fx.organizer), { checkedIn: 0, expected: 3, unit: 'tickets' });
});
