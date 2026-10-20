import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allRows } from '../security/sql-database.ts';
import { findMyTickets } from './find-tickets.ts';
import { orderLinkView, orderPageView } from './order-links.ts';
import { markOrderPaid, reserveOrder } from './orders.ts';
import {
  PAID_ENV,
  PAID_NOW,
  paidTestDatabase,
  seedPaidEvent,
  type SeedPaidEventOptions,
} from './paid-testing.ts';
import { PaidError, type ReserveOrderInput } from './paid-types.ts';
import {
  checkInAny,
  checkInTicket,
  holderDisplayName,
  loadOrderTickets,
  orderLinkExpiresAt,
  parseTicketCredential,
  signOrderToken,
  signTicketToken,
  ticketCredential,
  verifyOrderLink,
  verifyOrderToken,
  type OrderTicket,
} from './tickets.ts';
import { transferTicket } from './transfers.ts';

async function setup(options: SeedPaidEventOptions = { flow: 'organizer_account' }) {
  const { d1, db } = await paidTestDatabase();
  const seed = seedPaidEvent(d1, options);
  const exec = (sql: string) => d1.sqlite.exec(sql);
  const one = async <T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]) =>
    (await allRows<T>(db, { sql, params }))[0];
  /** A paid online order through the real reserve → pay path. */
  const paidOrder = async (extra: Partial<ReserveOrderInput> = {}) => {
    const r = await reserveOrder(db, PAID_ENV, {
      eventId: seed.eventId,
      occurrenceId: seed.occurrenceId,
      channel: 'online',
      paymentMethod: 'card_online',
      lines: [{ ticketTypeId: seed.generalTypeId, quantity: 2 }],
      buyerName: 'Ruth Bekele',
      buyerEmail: 'ruth@example.org',
      now: PAID_NOW,
      ...extra,
    });
    const session = `cs_test_${r.orderId}`;
    exec(`UPDATE orders SET checkout_session_id = '${session}' WHERE id = '${r.orderId}'`);
    const paid = await markOrderPaid(db, PAID_ENV, {
      orderId: r.orderId,
      amountCents: r.priced.totalCents,
      currency: 'usd',
      providerRef: session,
      stripeAccountId: r.stripeAccountId,
      paymentIntentId: `pi_test_${r.orderId}`,
      now: PAID_NOW + 60,
    });
    assert.equal(paid.outcome, 'paid');
    return { ...r, tickets: await loadOrderTickets(db, r.orderId) };
  };
  return { d1, db, seed, exec, one, paidOrder };
}

const door = (t: { seed: { occurrenceId: string } }, code: string, by = 'stf_a') => ({
  occurrenceId: t.seed.occurrenceId,
  code,
  by,
  now: PAID_NOW + 30 * 86_400 - 600,
});

async function rejects(promise: Promise<unknown>, code: string, detail?: string) {
  await assert.rejects(promise, (e: unknown) => {
    assert.ok(e instanceof PaidError, String(e));
    assert.equal(e.code, code);
    if (detail !== undefined) assert.equal(e.detail, detail);
    return true;
  });
}

// ── Links ──────────────────────────────────────────────────────────────────────────────────────────────────────

test('order links: valid until expiry; expired, altered and forged links are rejected', async () => {
  const orderId = 'ord_' + 'a'.repeat(26);
  const token = await signOrderToken(PAID_ENV, orderId, PAID_NOW + 100);
  assert.equal(await verifyOrderToken(PAID_ENV, token, PAID_NOW), orderId);
  assert.equal(await verifyOrderToken(PAID_ENV, token, PAID_NOW + 100), null, 'expired');
  const [id, exp, mac] = token.split('.');
  assert.equal(
    await verifyOrderToken(PAID_ENV, `${id}.${Number(exp) + 1}.${mac}`, PAID_NOW),
    null,
    'expiry altered',
  );
  assert.equal(await verifyOrderToken(PAID_ENV, `${'ord_' + 'b'.repeat(26)}.${exp}.${mac}`, PAID_NOW), null);
  const other = { ...PAID_ENV, ENVIRONMENT: 'local', LIVE_TICKET_SECRET: 'x'.repeat(40) };
  assert.equal(await verifyOrderToken(other, token, PAID_NOW), null, 'signed with another secret');
  assert.equal(await verifyOrderToken(PAID_ENV, 'garbage', PAID_NOW), null);
  // A ticket link is not an order link, and the other way round.
  const ticket = await signTicketToken(PAID_ENV, 'tkt_' + 'c'.repeat(26), 2, PAID_NOW + 100);
  assert.equal(await verifyOrderToken(PAID_ENV, ticket, PAID_NOW), null);
  assert.deepEqual(await verifyOrderLink(PAID_ENV, ticket, PAID_NOW), {
    kind: 'ticket',
    ticketId: 'tkt_' + 'c'.repeat(26),
    version: 2,
  });
});

test('order links expire 30 days after the event’s last date; the page view rejects bad links', async () => {
  const t = await setup();
  const o = await t.paidOrder();
  const exp = await orderLinkExpiresAt(t.db, o.orderId);
  assert.equal(exp, PAID_NOW + 30 * 86_400 + 3 * 3600 + 30 * 86_400);
  const token = await signOrderToken(PAID_ENV, o.orderId, exp!);
  const view = await orderLinkView(t.db, PAID_ENV, token, PAID_NOW);
  assert.equal(view.kind, 'order');
  assert.equal((await orderLinkView(t.db, PAID_ENV, token, exp!)).kind, 'invalid');
  // Change the last signature character to a different one (replacing it with a fixed character is sometimes a no-op).
  const tampered = token.slice(0, -1) + (token.endsWith('0') ? '1' : '0');
  assert.equal((await orderLinkView(t.db, PAID_ENV, tampered, PAID_NOW)).kind, 'invalid');
});

// ── Credentials and check-in ───────────────────────────────────────────────────────────────────────────────────

test('credentials: GT1 format, parsed tolerantly (case, spaces, look-alikes), garbage rejected', async () => {
  const ticket = { id: 'tkt_' + '0123456789abcdefghjkmnpqrs', credentialVersion: 3, credentialSalt: 'salt' };
  const code = await ticketCredential(PAID_ENV, ticket);
  assert.match(code, /^GT1\.[0-9A-Z]{26}\.3\.[0-9A-Z]{26}$/);
  const parsed = parseTicketCredential(code);
  assert.deepEqual(parsed, { ticketId: ticket.id, version: 3, mac: code.split('.')[3] });
  assert.deepEqual(parseTicketCredential(` ${code.toLowerCase().replace(/0/g, 'o')} `), parsed);
  assert.equal(parseTicketCredential('GL1.ABCDEF'), null);
  assert.equal(parseTicketCredential('GT1.SHORT.1.MAC'), null);
  assert.equal(holderDisplayName('Maria del Carmen Gonzalez'), 'Maria G.');
  assert.equal(holderDisplayName('  '), null);
});

test('two staff scanning one ticket: one admitted, one already admitted', async () => {
  const t = await setup();
  const o = await t.paidOrder();
  const code = await ticketCredential(PAID_ENV, o.tickets[0]);
  const [a, b] = await Promise.all([
    checkInTicket(t.db, PAID_ENV, door(t, code, 'stf_a')),
    checkInTicket(t.db, PAID_ENV, door(t, code, 'stf_b')),
  ]);
  const outcomes = [a.outcome, b.outcome].sort();
  assert.deepEqual(outcomes, ['admitted', 'already_admitted']);
  const admitted = a.outcome === 'admitted' ? a : b;
  assert.ok(admitted.outcome === 'admitted');
  assert.equal(admitted.holder, 'Ruth B.');
  assert.equal(admitted.ticketType, 'General');
  assert.equal(admitted.people, 1);
  const again = await checkInTicket(t.db, PAID_ENV, door(t, code));
  assert.ok(again.outcome === 'already_admitted');
  assert.equal(again.checkedInAt, PAID_NOW + 30 * 86_400 - 600);
});

test('a forged MAC, another event’s ticket and a free-registration code', async () => {
  const t = await setup();
  const o = await t.paidOrder();
  const code = await ticketCredential(PAID_ENV, o.tickets[0]);
  const forged = code.slice(0, -2) + (code.endsWith('00') ? '11' : '00');
  assert.deepEqual(await checkInTicket(t.db, PAID_ENV, door(t, forged)), { outcome: 'not_found' });
  assert.deepEqual(await checkInTicket(t.db, PAID_ENV, door(t, 'GT1.nonsense')), { outcome: 'not_found' });
  // A second event: its ticket scanned at the first event's door is "not found", never another event's data.
  seedPaidEvent(t.d1, { flow: 'organizer_account' }, '2');
  const result = await checkInTicket(t.db, PAID_ENV, { ...door(t, code), occurrenceId: 'occ_2' });
  assert.deepEqual(result, { outcome: 'not_found' });
  // checkInAny routes anything else to free registrations.
  const free = await checkInAny(t.db, PAID_ENV, door(t, 'GL1.ABCDE12345'));
  assert.equal(free.kind, 'registration');
  const paid = await checkInAny(t.db, PAID_ENV, door(t, code));
  assert.equal(paid.kind, 'ticket');
  assert.equal(paid.kind === 'ticket' && paid.result.outcome, 'admitted');
});

test('a refunded or voided ticket cannot be admitted; a canceled date says canceled; the window applies', async () => {
  const t = await setup();
  const o = await t.paidOrder();
  const [first, second] = o.tickets;
  t.exec(`UPDATE tickets SET status = 'refunded' WHERE id = '${first.id}'`);
  t.exec(`UPDATE tickets SET status = 'voided' WHERE id = '${second.id}'`);
  assert.deepEqual(await checkInTicket(t.db, PAID_ENV, door(t, await ticketCredential(PAID_ENV, first))), {
    outcome: 'refunded',
  });
  assert.deepEqual(await checkInTicket(t.db, PAID_ENV, door(t, await ticketCredential(PAID_ENV, second))), {
    outcome: 'voided',
  });
  const o2 = await t.paidOrder();
  const code = await ticketCredential(PAID_ENV, o2.tickets[0]);
  const occ = { startsAt: PAID_NOW + 30 * 86_400, opensHours: 3, openedAt: null };
  assert.deepEqual(
    await checkInTicket(t.db, PAID_ENV, { ...door(t, code), now: PAID_NOW, occurrence: occ }),
    { outcome: 'outside_window' },
  );
  t.exec(`UPDATE event_occurrences SET status = 'canceled' WHERE id = '${t.seed.occurrenceId}'`);
  assert.deepEqual(await checkInTicket(t.db, PAID_ENV, door(t, code)), { outcome: 'canceled' });
});

test('a ticket of this event for another date says wrong date', async () => {
  const t = await setup();
  t.exec(
    `INSERT INTO event_occurrences (id, event_id, starts_at, ends_at) VALUES ('occ_1b', 'evt_1', ${PAID_NOW + 31 * 86_400}, ${PAID_NOW + 31 * 86_400 + 3600})`,
  );
  const o = await t.paidOrder();
  const code = await ticketCredential(PAID_ENV, o.tickets[0]);
  const r = await checkInTicket(t.db, PAID_ENV, { ...door(t, code), occurrenceId: 'occ_1b' });
  assert.deepEqual(r, { outcome: 'wrong_date', ticketStartsAt: PAID_NOW + 30 * 86_400 });
});

// ── Transfers ──────────────────────────────────────────────────────────────────────────────────────────────────

const transferInput = (ticket: OrderTicket, extra: Record<string, unknown> = {}) => ({
  ticketId: ticket.id,
  access: { kind: 'order' as const, orderId: ticket.orderId },
  toName: 'Abel Tesfaye',
  toEmail: 'abel@example.org',
  confirmEmail: 'Abel@Example.org ',
  now: PAID_NOW + 3600,
  ticketUrl: (token: string) => `https://live.test/orders/${token}`,
  ...extra,
});

test('a transferred ticket’s old QR says replaced (no holder data); the new one admits the new holder', async () => {
  const t = await setup();
  const o = await t.paidOrder();
  const ticket = o.tickets[0];
  const oldCode = await ticketCredential(PAID_ENV, ticket);
  const result = await transferTicket(t.db, PAID_ENV, transferInput(ticket));
  assert.equal(result.version, 2);
  assert.equal(result.emails.length, 2);
  assert.equal(result.emails[0].to, 'abel@example.org');
  assert.match(result.emails[0].text, /https:\/\/live\.test\/orders\/tkt_/);
  assert.equal(result.emails[1].to, 'ruth@example.org');
  const row = await t.one<Record<string, unknown>>(
    'SELECT * FROM ticket_transfers WHERE ticket_id = ?1',
    ticket.id,
  );
  assert.equal(row!.version_from, 1);
  assert.equal(row!.version_to, 2);
  assert.equal('price_cents' in row!, false);
  assert.deepEqual(await checkInTicket(t.db, PAID_ENV, door(t, oldCode)), { outcome: 'replaced' });
  const [fresh] = (await loadOrderTickets(t.db, o.orderId)).filter((x) => x.id === ticket.id);
  const admitted = await checkInTicket(t.db, PAID_ENV, door(t, await ticketCredential(PAID_ENV, fresh)));
  assert.ok(admitted.outcome === 'admitted');
  assert.equal(admitted.holder, 'Abel T.');
  // The buyer's order page no longer shows its QR.
  const page = await orderPageView(t.db, PAID_ENV, o.orderId, PAID_NOW + 3600);
  const card = page!.tickets.find((c) => c.id === ticket.id)!;
  assert.equal(card.transferred, true);
  assert.equal(card.credential, null);
});

test('transfers: confirm email, same email, policy, cutoff, one at a time, the holder’s own link', async () => {
  const t = await setup();
  const o = await t.paidOrder();
  const [a, b] = o.tickets;
  await rejects(
    transferTicket(t.db, PAID_ENV, transferInput(a, { confirmEmail: 'other@example.org' })),
    'invalid',
    'confirmEmail',
  );
  await rejects(
    transferTicket(
      t.db,
      PAID_ENV,
      transferInput(a, { toEmail: 'RUTH@example.org', confirmEmail: 'ruth@example.org' }),
    ),
    'invalid',
    'same_email',
  );
  // Cutoff: 24 hours before the start.
  t.exec(
    `UPDATE orders SET policy_snapshot = json_set(policy_snapshot, '$.transferCutoffHours', 24) WHERE id = '${o.orderId}'`,
  );
  t.exec(`UPDATE event_ticketing SET transfer_cutoff_hours = 24 WHERE event_id = 'evt_1'`);
  await rejects(
    transferTicket(t.db, PAID_ENV, transferInput(a, { now: PAID_NOW + 30 * 86_400 - 23 * 3600 })),
    'policy_forbids',
    'cutoff_passed',
  );
  // Done once through the order link; then only the new holder's ticket link can pass it on.
  const first = await transferTicket(t.db, PAID_ENV, transferInput(a));
  await rejects(
    transferTicket(
      t.db,
      PAID_ENV,
      transferInput(a, { toEmail: 'c@example.org', confirmEmail: 'c@example.org' }),
    ),
    'invalid',
    'already_transferred',
  );
  await rejects(
    transferTicket(
      t.db,
      PAID_ENV,
      transferInput(a, {
        access: { kind: 'ticket', version: 1 },
        toEmail: 'c@example.org',
        confirmEmail: 'c@example.org',
      }),
    ),
    'stale',
  );
  const second = await transferTicket(
    t.db,
    PAID_ENV,
    transferInput(a, {
      access: { kind: 'ticket', version: first.version },
      toEmail: 'c@example.org',
      confirmEmail: 'c@example.org',
    }),
  );
  assert.equal(second.version, 3);
  // Not allowed by the policy at all.
  t.exec(
    `UPDATE orders SET policy_snapshot = json_set(policy_snapshot, '$.transfersAllowed', json('false')) WHERE id = '${o.orderId}'`,
  );
  t.exec(`UPDATE event_ticketing SET transfers_allowed = 0 WHERE event_id = 'evt_1'`);
  await rejects(transferTicket(t.db, PAID_ENV, transferInput(b)), 'policy_forbids', 'not_allowed');
});

test('a transfer racing a check-in loses cleanly', async () => {
  const t = await setup();
  const o = await t.paidOrder();
  const ticket = o.tickets[0];
  await checkInTicket(t.db, PAID_ENV, door(t, await ticketCredential(PAID_ENV, ticket)));
  await rejects(transferTicket(t.db, PAID_ENV, transferInput(ticket)), 'invalid', 'checked_in');
});

// ── Order page ─────────────────────────────────────────────────────────────────────────────────────────────────

test('order page (Mode B): every receipt line, seller on behalf of the organization, QR only for valid tickets', async () => {
  const t = await setup({ flow: 'gamo_collects', giftsEnabled: true });
  const o = await t.paidOrder({ giftCents: 500 });
  t.exec(`UPDATE tickets SET status = 'refunded' WHERE id = '${o.tickets[1].id}'`);
  const page = await orderPageView(t.db, PAID_ENV, o.orderId, PAID_NOW + 3600);
  assert.ok(page);
  assert.equal(page.state, 'active');
  assert.equal(page.seller, 'Gamo Studios on behalf of Grace Church 1');
  assert.deepEqual(page.receipt.lines, [
    { label: 'General × 2', amountCents: 4000 },
    { label: 'Gift to Grace Church 1', amountCents: 500 },
  ]);
  assert.equal(page.receipt.totalCents, 4500);
  assert.match(String(page.tickets[0].credential), /^GT1\./);
  assert.equal(page.tickets[1].credential, null);
  assert.equal(page.refund.allowed, true);
  assert.deepEqual(page.refund.ticketIds, [o.tickets[0].id]);
  assert.equal(page.tickets[0].transfer.allowed, true);
});

// ── Find my tickets ────────────────────────────────────────────────────────────────────────────────────────────

test('find my tickets: same answer for unknown addresses, a link for known ones, rate limited', async () => {
  const t = await setup();
  const o = await t.paidOrder();
  const ask = (email: string, ipHash: string | null = 'a'.repeat(64), now = PAID_NOW) =>
    findMyTickets(t.db, PAID_ENV, {
      email,
      ipHash,
      now,
      orderUrl: (tok) => `https://live.test/orders/${tok}`,
    });
  const unknown = await ask('nobody@example.org');
  assert.deepEqual(unknown, { rateLimited: false, retryAfterSeconds: 0, email: null });
  assert.deepEqual(await ask('not an email'), { rateLimited: false, retryAfterSeconds: 0, email: null });
  const known = await ask('RUTH@example.org');
  assert.equal(known.rateLimited, false);
  assert.equal(known.email?.to, 'ruth@example.org');
  const url = /https:\/\/live\.test\/orders\/(\S+)/.exec(known.email!.text)![1];
  assert.equal(await verifyOrderToken(PAID_ENV, url, PAID_NOW), o.orderId);
  // A transferred ticket's holder finds that ticket.
  await transferTicket(t.db, PAID_ENV, transferInput(o.tickets[0]));
  const holder = await ask('abel@example.org', 'b'.repeat(64));
  assert.match(holder.email!.text, /orders\/tkt_/);
  // 3 per email per hour.
  await ask('ruth@example.org', 'c'.repeat(64));
  await ask('ruth@example.org', 'c'.repeat(64));
  const limited = await ask('ruth@example.org', 'c'.repeat(64));
  assert.equal(limited.rateLimited, true);
  assert.equal(limited.email, null);
  // 10 per IP per 15 minutes, whatever the address.
  for (let i = 0; i < 10; i++) await ask(`x${i}@example.org`, 'd'.repeat(64), PAID_NOW + 7200);
  assert.equal((await ask('y@example.org', 'd'.repeat(64), PAID_NOW + 7200)).rateLimited, true);
});

test('a ticket with an open refund request cannot be passed on (the refund and the transfer cannot both win)', async () => {
  const t = await setup();
  const o = await t.paidOrder();
  const ticket = o.tickets[0];
  t.exec(`INSERT INTO refunds (id, order_id, ticket_ids, amount_cents, method, requested_by, status)
          VALUES ('rfd_open', '${o.orderId}', '["${ticket.id}"]', 2000, 'stripe', 'buyer', 'requested')`);
  await assert.rejects(transferTicket(t.db, PAID_ENV, transferInput(ticket)), PaidError);
  const row = await t.one<{ credential_version: number }>(
    'SELECT credential_version FROM tickets WHERE id = ?1',
    ticket.id,
  );
  assert.equal(row?.credential_version, 1);
});
