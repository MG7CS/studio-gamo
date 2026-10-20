/**
 * After checkout (lib/checkout-orders.ts), end to end on the local Stripe stand-in: Pay,
 * the stand-in's hosted page, the webhook, the return page, the order page with QR codes, the calendar file, passing a
 * ticket on, asking for a refund, find my tickets.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paymentsRuntime, type LiveEmail } from '@gamo/domain';
import { payReview, readCheckoutState, writeCheckoutState, CHECKOUT_COOKIE } from './checkout.ts';
import { fakeCookies, formOf as form, liveFixture } from './checkout-testing.ts';
import {
  checkTransferValues,
  findTickets,
  openOrderLink,
  openRefund,
  openReturn,
  openTransfer,
  orderCalendar,
  submitRefund,
  submitTransfer,
} from './checkout-orders.ts';
import { completeStandinCheckout, openStandinCheckout } from './checkout-stripe.ts';
import type { LiveContext } from './registration.ts';

const SLUG = 'gospel-night-1';
const ORIGIN = 'https://live.example.org';
/** The stand-in checks Checkout expiry against the real clock, so these tests run at the real time. */
const NOW = Math.floor(Date.now() / 1000);
const STARTS = NOW + 30 * 86_400;
const standinEvent = () => liveFixture({ flow: 'gamo_collects', startsAt: STARTS }, {}, NOW);

/** Buys two General tickets through the stand-in and returns the order token. */
async function buy(
  live: LiveContext,
  seed: { eventId: string; occurrenceId: string; generalTypeId: string; organizationId: string },
  outcome = 'paid',
) {
  const cookies = fakeCookies();
  writeCheckoutState(
    cookies,
    {
      v: 1,
      eventId: seed.eventId,
      occurrenceId: seed.occurrenceId,
      lines: [{ ticketTypeId: seed.generalTypeId, quantity: 2 }],
      code: null,
      details: {
        buyerName: 'Ruth Bekele',
        buyerEmail: 'ruth@example.org',
        attendeeNames: null,
        giftCents: 0,
      },
      pendingToken: null,
    },
    false,
  );
  const runtime = paymentsRuntime(live.db, live.env);
  const paid = await payReview(
    live,
    { slug: SLUG, form: form({ terms: 'yes' }), cookies, secure: false, origin: ORIGIN, now: NOW },
    {
      routingFor: async () => {
        const r = await runtime.routingForOrganization(seed.organizationId);
        return r.available ? r.routing : null;
      },
    },
  );
  assert.equal(paid.kind, 'redirect', JSON.stringify(paid));
  if (paid.kind !== 'redirect') throw new Error('not redirected');
  const sessionId = paid.location.replace('/dev/stripe/checkout/', '');
  assert.match(sessionId, /^cs_test_/);
  const page = await openStandinCheckout(live, { sessionId, now: NOW });
  assert.equal(page?.total, '$40.00');
  assert.deepEqual(page?.lines, [{ label: 'General × 2', amount: '$40.00' }]);
  const done = await completeStandinCheckout(live, { sessionId, outcome, now: NOW });
  assert.ok(done);
  return {
    cookies,
    done: done!,
    sessionId,
    pendingToken: readCheckoutState(cookies, seed.eventId)?.pendingToken,
  };
}

test('paid through the stand-in: return page, order page with QR codes, calendar, forged 404 and expired 410', async () => {
  const { live, seed } = await standinEvent();
  const { cookies, done } = await buy(live, seed);
  assert.equal(done.declined, false);
  assert.match(done.location, /^\/orders\/return\/ord_/);
  const token = done.location.replace('/orders/return/', '');

  const back = await openReturn(live, { token, cookies, now: NOW });
  assert.deepEqual(back, { kind: 'redirect', location: `/orders/${token}?new=1` });
  assert.equal(cookies.store.has(CHECKOUT_COOKIE), false, 'the checkout answers are cleared once paid');

  const order = await openOrderLink(live, { token, now: NOW });
  assert.equal(order.kind, 'order');
  if (order.kind !== 'order') return;
  assert.equal(order.state, 'active');
  assert.equal(order.tickets.length, 2);
  assert.ok(order.tickets.every((t) => t.qr?.startsWith('<svg') && t.status.label === 'Valid'));
  assert.ok(order.tickets.every((t) => t.transfer.href?.startsWith(`/orders/${token}/transfer/tkt_`)));
  assert.equal(order.seller, 'Gamo Studios on behalf of Grace Church 1');
  assert.deepEqual(order.receipt.total, { label: 'Total paid', amount: '$40.00' });
  assert.equal(order.refund.href, `/orders/${token}/refund`);
  assert.equal(order.calendarHref, `/orders/${token}/calendar.ics`);
  assert.match(order.mapsUrl ?? '', /^https:\/\/www\.google\.com\/maps\/search\//);

  const ics = await orderCalendar(live, { token, origin: ORIGIN, now: NOW });
  assert.match(ics ?? '', /BEGIN:VCALENDAR[\s\S]*SUMMARY:Gospel Night 1/);
  assert.ok(!(ics ?? '').includes(token.split('.')[2]), 'the private link is never in the file');

  // Forged links are a 404; real ones that ran out are a 410.
  assert.deepEqual(await openOrderLink(live, { token: `${token.slice(0, -1)}0`, now: NOW }), {
    kind: 'not_found',
  });
  assert.deepEqual(await openOrderLink(live, { token: 'garbage', now: NOW }), { kind: 'not_found' });
  const expiry = Number(token.split('.')[1]);
  assert.deepEqual(await openOrderLink(live, { token, now: expiry + 1 }), { kind: 'expired' });
  assert.deepEqual(await openReturn(live, { token, cookies, now: expiry + 1 }), { kind: 'expired' });
  assert.equal(await orderCalendar(live, { token, origin: ORIGIN, now: expiry + 1 }), null);
});

test('a declined card stays on the stand-in page; a canceled checkout is released when the buyer chooses again', async () => {
  const { live, seed } = await standinEvent();
  const declined = await buy(live, seed, 'declined');
  assert.equal(declined.done.declined, true);
  assert.equal(declined.done.location, `/dev/stripe/checkout/${declined.sessionId}`);

  const canceled = await buy(live, seed, 'canceled');
  assert.equal(canceled.done.location, `/events/${SLUG}/tickets`);
  const token = canceled.pendingToken!;
  const waiting = await openReturn(live, { token, cookies: canceled.cookies, now: NOW });
  assert.equal(waiting.kind, 'waiting', 'still pending: the return page waits');
  const { releasePendingCheckout } = await import('./checkout.ts');
  assert.equal(await releasePendingCheckout(live, token, NOW), true);
  assert.deepEqual(await openReturn(live, { token, cookies: canceled.cookies, now: NOW }), {
    kind: 'redirect',
    location: `/events/${SLUG}/tickets`,
    flash: 'checkout-not-paid',
  });
});

test('passing a ticket on: form checks, confirm step, both emailed, the new holder’s page, the old link updated', async () => {
  const { live, seed } = await standinEvent();
  const { done } = await buy(live, seed);
  const token = done.location.replace('/orders/return/', '');
  const order = await openOrderLink(live, { token, now: NOW });
  if (order.kind !== 'order') throw new Error('no order');
  const ticketId = order.tickets[0].id;

  assert.deepEqual(await openTransfer(live, { token, ticketId: 'tkt_nope', now: NOW }), {
    kind: 'not_found',
  });
  const opened = await openTransfer(live, { token, ticketId, now: NOW });
  assert.ok(opened.kind === 'view' && opened.view.phase === 'form' && opened.view.notice === null);

  assert.deepEqual(checkTransferValues({ toName: ' ', toEmail: 'x', confirmEmail: '' }), {
    toName: 'Enter the new holder’s name.',
    toEmail: 'Enter a valid email address.',
  });
  const fields = { toName: 'Sara Haile', toEmail: 'sara@example.org', confirmEmail: 'SARA@example.org' };
  const send = (extra: Record<string, string>, emails: LiveEmail[] = []) =>
    submitTransfer(
      live,
      { token, ticketId, form: form({ ...fields, ...extra }), origin: ORIGIN, now: NOW },
      { sendEmail: async (_env, email) => void emails.push(email) },
    );
  const review = await send({ action: 'review' });
  assert.ok(review.kind === 'view' && review.view.phase === 'confirm');
  const mismatch = await submitTransfer(live, {
    token,
    ticketId,
    form: form({ ...fields, confirmEmail: 'other@example.org', action: 'confirm' }),
    origin: ORIGIN,
    now: NOW,
  });
  assert.ok(mismatch.kind === 'view' && mismatch.view.errors.confirmEmail);
  const sameEmail = await send({
    action: 'confirm',
    toEmail: 'ruth@example.org',
    confirmEmail: 'ruth@example.org',
  });
  assert.ok(sameEmail.kind === 'view' && /already with/.test(sameEmail.view.errors.toEmail ?? ''));

  const emails: LiveEmail[] = [];
  const moved = await send({ action: 'confirm' }, emails);
  assert.deepEqual(moved, { kind: 'redirect', location: `/orders/${token}`, flash: 'ticket-transferred' });
  assert.deepEqual(
    emails.map((e) => e.to),
    ['sara@example.org', 'ruth@example.org'],
  );
  const holderUrl = /https:\/\/live\.example\.org\/orders\/(tkt_\S+)/.exec(emails[0].text)?.[1];
  assert.ok(holderUrl, 'the new holder gets their own ticket link');

  const after = await openOrderLink(live, { token, now: NOW });
  if (after.kind !== 'order') throw new Error('no order');
  const passed = after.tickets.find((t) => t.id === ticketId)!;
  assert.equal(passed.status.label, 'Passed on');
  assert.equal(passed.qr, null, 'the buyer no longer sees its QR');

  const holder = await openOrderLink(live, { token: holderUrl!, now: NOW });
  assert.equal(holder.kind, 'ticket');
  if (holder.kind === 'ticket') {
    assert.equal(holder.state, 'active');
    assert.equal(holder.ticket?.holder, 'Sara Haile');
    assert.ok(holder.ticket?.qr?.startsWith('<svg'));
  }
  const again = await openTransfer(live, { token, ticketId, now: NOW });
  assert.ok(again.kind === 'view' && again.view.notice !== null, 'the buyer cannot pass it on twice');
});

test('asking for a refund: choose, the server’s amount, confirm, owners emailed; refused outside the policy', async () => {
  const { live, seed } = await standinEvent();
  const { done } = await buy(live, seed);
  const token = done.location.replace('/orders/return/', '');
  const opened = await openRefund(live, { token, now: NOW });
  assert.ok(opened.kind === 'view');
  if (opened.kind !== 'view') return;
  assert.deepEqual(
    opened.view.options.map((o) => o.amount),
    ['$20.00', '$20.00'],
  );
  const [first] = opened.view.options;

  const none = await submitRefund(live, {
    token,
    form: form({ action: 'review' }),
    origin: ORIGIN,
    now: NOW,
  });
  assert.ok(none.kind === 'view' && none.view.error === 'Choose at least one ticket.');
  const review = await submitRefund(live, {
    token,
    form: form({ action: 'review', ticket: [first.id, 'tkt_not_mine'], reason: 'Cannot come' }),
    origin: ORIGIN,
    now: NOW,
  });
  assert.ok(review.kind === 'view' && review.view.phase === 'confirm' && review.view.amount === '$20.00');

  const emails: LiveEmail[] = [];
  const asked = await submitRefund(
    live,
    {
      token,
      form: form({ action: 'confirm', ticket: first.id, reason: 'Cannot come' }),
      origin: ORIGIN,
      now: NOW,
    },
    { sendEmail: async (_env, email) => void emails.push(email) },
  );
  assert.deepEqual(asked, { kind: 'redirect', location: `/orders/${token}`, flash: 'refund-requested' });
  assert.deepEqual(
    emails.map((e) => e.to),
    ['owner1@example.org'],
  );
  assert.match(emails[0].text, new RegExp(`${ORIGIN}/organizer/events/${seed.eventId}/orders/ord_`));

  const order = await openOrderLink(live, { token, now: NOW });
  assert.ok(order.kind === 'order' && order.refunds[0]?.status === 'Requested, waiting for the organizer');

  // After the policy's deadline (48 hours before the start) the page goes back to the order.
  const late = STARTS - 3600;
  assert.deepEqual(await openRefund(live, { token, now: late }), {
    kind: 'redirect',
    location: `/orders/${token}`,
  });
});

test('find my tickets: same answer for every address, the email sent only when there are tickets', async () => {
  const { live, seed } = await standinEvent();
  await buy(live, seed);
  const request = new Request(`${ORIGIN}/tickets/find`, {
    method: 'POST',
    headers: { 'cf-connecting-ip': '203.0.113.9' },
  });
  const run = async (email: string) => {
    const sent: LiveEmail[] = [];
    const out = await findTickets(
      live,
      { form: form({ email }), request, origin: ORIGIN, now: NOW },
      { sendEmail: async (_env, e) => void sent.push(e) },
    );
    return { out, sent };
  };
  const known = await run('RUTH@example.org');
  assert.deepEqual(known.out, { kind: 'done' });
  assert.equal(known.sent.length, 1);
  assert.match(known.sent[0].text, /https:\/\/live\.example\.org\/orders\/ord_/);
  const unknown = await run('nobody@example.org');
  assert.deepEqual(unknown.out, { kind: 'done' });
  assert.equal(unknown.sent.length, 0);
  assert.deepEqual((await run('')).out, {
    kind: 'error',
    error: 'Enter the email address you bought the tickets with.',
  });
  assert.deepEqual((await run('not-an-email')).out, { kind: 'error', error: 'Enter a valid email address.' });
  // Rate limited (3 per address per hour): still the same answer, and nothing more is sent.
  await run('ruth@example.org');
  await run('ruth@example.org');
  const limited = await run('ruth@example.org');
  assert.deepEqual(limited.out, { kind: 'done' });
  assert.equal(limited.sent.length, 0);
});
