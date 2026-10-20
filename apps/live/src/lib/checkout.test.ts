/** The three checkout steps (lib/checkout.ts): carried state, every step's checks, the review model and Pay. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PaidError,
  SecretNotConfiguredError,
  type PaymentRouting,
  type OrderCheckoutInput,
  type StripeCheckoutSession,
} from '@gamo/domain';
import { PAID_NOW } from '../../../../packages/domain/src/live/paid-testing.ts';
import { fakeCookies, formOf as form, liveFixture } from './checkout-testing.ts';
import {
  CHECKOUT_COOKIE,
  backToTicketsKey,
  decodeCheckoutState,
  detailsErrorText,
  encodeCheckoutState,
  isPaymentsUnavailable,
  openDetails,
  openReview,
  openSelection,
  orderedDetailsErrors,
  payReview,
  paymentTestMode,
  policyWords,
  readCheckoutState,
  readQuantities,
  submitDetails,
  submitSelection,
  writeCheckoutState,
  type CheckoutState,
} from './checkout.ts';

const SLUG = 'gospel-night-1';

function stateFor(
  seed: { eventId: string; occurrenceId: string; generalTypeId: string },
  extra: Partial<CheckoutState> = {},
): CheckoutState {
  return {
    v: 1,
    eventId: seed.eventId,
    occurrenceId: seed.occurrenceId,
    lines: [{ ticketTypeId: seed.generalTypeId, quantity: 2 }],
    code: null,
    details: null,
    pendingToken: null,
    ...extra,
  };
}

// ── State ──────────────────────────────────────────────────────────────────────────────────────────────────────

test('the carried state round-trips and is refused for another event, when tampered or malformed', () => {
  const state = stateFor(
    { eventId: 'evt_1', occurrenceId: 'occ_1', generalTypeId: 'tty_general_1' },
    {
      code: 'SAVE10',
      details: {
        buyerName: 'Ruth Bekele',
        buyerEmail: 'ruth@example.org',
        attendeeNames: null,
        giftCents: 500,
      },
    },
  );
  const raw = encodeCheckoutState(state);
  assert.match(raw, /^[A-Za-z0-9_-]+$/, 'cookie-safe, and the email is not readable in a URL-like value');
  assert.deepEqual(decodeCheckoutState(raw, 'evt_1'), state);
  assert.equal(decodeCheckoutState(raw, 'evt_2'), null);
  assert.equal(decodeCheckoutState(`${raw}%`, 'evt_1'), null);
  assert.equal(decodeCheckoutState('not-json', 'evt_1'), null);
  const bad = (patch: Record<string, unknown>) =>
    decodeCheckoutState(Buffer.from(JSON.stringify({ ...state, ...patch })).toString('base64url'), 'evt_1');
  assert.equal(bad({ lines: [{ ticketTypeId: 'tty_x', quantity: 51 }] }), null);
  assert.equal(bad({ lines: [{ ticketTypeId: 'drop table', quantity: 1 }] }), null);
  assert.equal(bad({ occurrenceId: '../x' }), null);
  assert.equal(bad({ details: { buyerName: 'x'.repeat(101), buyerEmail: 'a@b.co', giftCents: 0 } }), null);
  assert.equal(bad({ pendingToken: 'forged' })?.pendingToken, null, 'a malformed pending link is dropped');
});

test('the state cookie is HttpOnly, SameSite=Lax, short-lived, and refuses to grow past the cookie limit', () => {
  const cookies = fakeCookies();
  const state = stateFor({ eventId: 'evt_1', occurrenceId: 'occ_1', generalTypeId: 'tty_general_1' });
  assert.equal(writeCheckoutState(cookies, state, true), true);
  assert.deepEqual(cookies.options.get(CHECKOUT_COOKIE), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    maxAge: 3600,
  });
  assert.deepEqual(readCheckoutState(cookies, 'evt_1'), state);
  const huge = {
    ...state,
    details: {
      buyerName: 'R',
      buyerEmail: 'r@example.org',
      attendeeNames: Array.from({ length: 50 }, () => 'n'.repeat(100)),
      giftCents: 0,
    },
  };
  assert.equal(writeCheckoutState(fakeCookies(), huge, true), false);
});

test('readQuantities keeps only sensible qty:<type> fields', () => {
  const q = readQuantities(
    form({ 'qty:tty_a': '2', 'qty:tty_b': '0', 'qty:tty_c': 'x', 'qty:bad id': '3', code: 'X' }),
  );
  assert.deepEqual([...q], [['tty_a', 2]]);
});

// ── Words ──────────────────────────────────────────────────────────────────────────────────────────────────────

test('words: test mode, policies, details errors, the step-1 flash for each error, unavailable errors', () => {
  assert.deepEqual(paymentTestMode({ ENVIRONMENT: 'local', ALLOW_STRIPE_STANDIN: 'true' }), {
    show: true,
    standin: true,
  });
  assert.deepEqual(paymentTestMode({ ENVIRONMENT: 'preview', STRIPE_SECRET_KEY: 'sk_test_x' }), {
    show: true,
    standin: false,
  });
  assert.deepEqual(paymentTestMode({ ENVIRONMENT: 'production', STRIPE_SECRET_KEY: 'sk_live_x' }), {
    show: false,
    standin: false,
  });
  assert.deepEqual(paymentTestMode({ ENVIRONMENT: 'production' }), { show: false, standin: false });

  const words = policyWords({
    refundPolicy: 'until_hours_before',
    refundHours: 48,
    transfersAllowed: true,
    transferCutoffHours: 24,
    reentryAllowed: false,
    entryNotes: ' Doors at 6 ',
  });
  assert.equal(words.refund, 'Refunds can be requested until 48 hours before the start.');
  assert.match(words.transfer, /free, until 24 hours before the start/);
  assert.equal(words.reentry, 'No re-entry once you leave.');
  assert.equal(words.entryNotes, 'Doors at 6');
  assert.equal(
    policyWords({
      ...words,
      refundPolicy: 'none',
      refundHours: null,
      transfersAllowed: false,
      transferCutoffHours: 0,
      reentryAllowed: true,
      entryNotes: null,
    }).refund,
    'No refunds.',
  );

  assert.equal(detailsErrorText('attendee_2', 'required'), 'Enter the name for ticket 3.');
  assert.equal(detailsErrorText('confirmEmail', 'mismatch'), 'The two email addresses do not match.');
  assert.deepEqual(
    orderedDetailsErrors({ gift: 'g', attendee_1: 'a1', email: 'e', attendee_0: 'a0', name: 'n' }).map(
      (e) => e.field,
    ),
    ['name', 'email', 'attendee_0', 'attendee_1', 'gift-none'],
  );

  assert.equal(backToTicketsKey(new PaidError('sold_out')), 'checkout-sold-out');
  assert.equal(backToTicketsKey(new PaidError('code_used_up')), 'checkout-code');
  assert.equal(backToTicketsKey(new PaidError('not_on_sale')), 'checkout-not-on-sale');
  assert.equal(isPaymentsUnavailable(new PaidError('account_not_ready')), true);
  assert.equal(isPaymentsUnavailable(new SecretNotConfiguredError('LIVE_TICKET_SECRET')), true);
  assert.equal(isPaymentsUnavailable(new PaidError('sold_out')), false);
});

// ── Step 1 ─────────────────────────────────────────────────────────────────────────────────────────────────────

test('step 1 shows real prices and states; hidden types only with their access code', async () => {
  const { live, seed, exec } = await liveFixture();
  exec(`INSERT INTO ticket_types (id, event_id, name, kind, price_cents, capacity, per_order_limit, status, position)
          VALUES ('tty_secret_1', '${seed.eventId}', 'Choir seats', 'other', 1000, 5, 5, 'hidden', 2),
                 ('tty_later_1', '${seed.eventId}', 'Late', 'other', 1500, 5, 5, 'on_sale', 3);
        UPDATE ticket_types SET sales_start_at = ${PAID_NOW + 86_400} WHERE id = 'tty_later_1';
        INSERT INTO ticket_inventory (ticket_type_id, occurrence_id, capacity) VALUES ('tty_secret_1', '${seed.occurrenceId}', 5), ('tty_later_1', '${seed.occurrenceId}', 5);
        UPDATE ticket_inventory SET online_taken = 8 WHERE ticket_type_id = '${seed.vipTypeId}';`);
  const cookies = fakeCookies();
  const opened = await openSelection(live, { slug: SLUG, date: null, cookies, flash: null, now: PAID_NOW });
  assert.equal(opened.kind, 'view');
  if (opened.kind !== 'view') return;
  const byId = new Map(opened.view.types.map((t) => [t.id, t]));
  assert.equal(byId.has('tty_secret_1'), false, 'hidden without a code');
  assert.equal(byId.get(seed.generalTypeId)?.priceLabel, '$20.00');
  assert.equal(byId.get(seed.generalTypeId)?.max, 10, 'per-order limit');
  assert.equal(byId.get(seed.vipTypeId)?.state, 'sold_out', '10 − 8 taken − 2 for the door');
  assert.equal(byId.get('tty_later_1')?.state, 'not_open');
  assert.match(byId.get('tty_later_1')?.stateText ?? '', /^On sale from /);
  assert.equal(opened.view.closed, null);

  exec(`INSERT INTO event_codes (id, event_id, code, kind, ticket_type_ids, status)
          VALUES ('cod_choir', '${seed.eventId}', 'CHOIR', 'access', '["tty_secret_1"]', 'active')`);
  const applied = await submitSelection(live, {
    slug: SLUG,
    form: form({
      action: 'apply',
      occurrence: seed.occurrenceId,
      code: 'choir',
      [`qty:${seed.generalTypeId}`]: '1',
    }),
    cookies,
    secure: false,
    now: PAID_NOW,
  });
  assert.equal(applied.kind, 'redirect');
  const after = await openSelection(live, { slug: SLUG, date: null, cookies, flash: null, now: PAID_NOW });
  assert.ok(after.kind === 'view' && after.view.types.some((t) => t.id === 'tty_secret_1'), 'unlocked');
  assert.ok(after.kind === 'view' && /unlocks: Choir seats/.test(after.view.codeNote ?? ''));
  assert.equal(
    after.kind === 'view' && after.view.types.find((t) => t.id === seed.generalTypeId)?.quantity,
    1,
  );
});

test('step 1 Next: checks what is left, prices on the server, carries the choice; errors stay on the form', async () => {
  const { live, seed } = await liveFixture();
  const cookies = fakeCookies();
  const next = (fields: Record<string, string>) =>
    submitSelection(live, {
      slug: SLUG,
      form: form({ occurrence: seed.occurrenceId, ...fields }),
      cookies,
      secure: true,
      now: PAID_NOW,
    });

  const none = await next({ [`qty:${seed.generalTypeId}`]: '0' });
  assert.ok(none.kind === 'view' && none.view.errors.lines === 'Choose at least one ticket.');

  const tooMany = await next({ [`qty:${seed.vipTypeId}`]: '9' });
  assert.ok(tooMany.kind === 'view');
  if (tooMany.kind === 'view') assert.match(tooMany.view.errors[`qty:${seed.vipTypeId}`], /at most 4/);

  const badCode = await next({ [`qty:${seed.generalTypeId}`]: '1', code: 'NOPE' });
  assert.ok(badCode.kind === 'view' && badCode.view.errors.code === 'That code is not valid for this event.');

  const ok = await next({ [`qty:${seed.generalTypeId}`]: '2', [`qty:${seed.vipTypeId}`]: '0' });
  assert.deepEqual(ok, { kind: 'redirect', location: `/events/${SLUG}/tickets/details` });
  const state = readCheckoutState(cookies, seed.eventId);
  assert.deepEqual(state?.lines, [{ ticketTypeId: seed.generalTypeId, quantity: 2 }]);

  assert.deepEqual(
    await submitSelection(live, {
      slug: 'no-such-event',
      form: form({}),
      cookies,
      secure: true,
      now: PAID_NOW,
    }),
    { kind: 'not_found' },
  );
});

test('step 1 Next answers 503 in plain words when card payments are not set up', async () => {
  const { live, seed } = await liveFixture({});
  const out = await submitSelection(live, {
    slug: SLUG,
    form: form({ occurrence: seed.occurrenceId, [`qty:${seed.generalTypeId}`]: '1' }),
    cookies: fakeCookies(),
    secure: true,
    now: PAID_NOW,
  });
  assert.ok(out.kind === 'view');
  if (out.kind !== 'view') return;
  assert.equal(out.view.status, 503);
  assert.match(out.view.notice?.text ?? '', /not available right now\. Nothing was charged/);
});

// ── Step 2 ─────────────────────────────────────────────────────────────────────────────────────────────────────

test('step 2 without carried answers goes back to step 1; every error at once; the typo hint stops Next once', async () => {
  const { live, seed } = await liveFixture({
    flow: 'organizer_account',
    namesRequired: true,
    giftsEnabled: true,
  });
  const cookies = fakeCookies();
  assert.deepEqual(await openDetails(live, { slug: SLUG, cookies, flash: null, now: PAID_NOW }), {
    kind: 'redirect',
    location: `/events/${SLUG}/tickets`,
    flash: 'checkout-expired',
  });
  writeCheckoutState(cookies, stateFor(seed), false);
  const opened = await openDetails(live, { slug: SLUG, cookies, flash: null, now: PAID_NOW });
  assert.ok(opened.kind === 'view');
  if (opened.kind !== 'view') return;
  assert.equal(opened.view.values.attendeeNames.length, 2, 'one name field per ticket');
  assert.equal(opened.view.values.gift, 'none', 'No gift by default');
  assert.deepEqual(
    opened.view.gift.presets.map((p) => p.label),
    ['$5.00', '$10.00', '$25.00'],
  );
  assert.equal(opened.view.gift.organizationName, 'Grace Church 1');
  assert.equal(opened.view.summary, '2 tickets · $40.00 before any gift');

  const submit = (fields: Record<string, string>) =>
    submitDetails(live, { slug: SLUG, form: form(fields), cookies, secure: false, now: PAID_NOW });
  const bad = await submit({
    name: '',
    email: 'ruth@example',
    confirmEmail: '',
    gift: 'custom',
    giftCustom: '0.5',
  });
  assert.ok(bad.kind === 'view');
  if (bad.kind === 'view')
    assert.deepEqual(Object.keys(bad.view.errors).sort(), [
      'attendee_0',
      'attendee_1',
      'email',
      'gift',
      'name',
    ]);

  const typo = {
    name: 'Ruth Bekele',
    email: 'ruth@gmial.com',
    confirmEmail: 'ruth@gmial.com',
    attendee_0: 'Ruth',
    attendee_1: 'Sara',
    gift: '1000',
  };
  const hinted = await submit(typo);
  assert.ok(hinted.kind === 'view' && hinted.view.emailHint === 'ruth@gmail.com');
  assert.equal(hinted.kind === 'view' && hinted.view.values.email, 'ruth@gmial.com', 'never applied');
  const kept = await submit({ ...typo, hintFor: 'ruth@gmial.com' });
  assert.deepEqual(kept, { kind: 'redirect', location: `/events/${SLUG}/tickets/review` });
  assert.deepEqual(readCheckoutState(cookies, seed.eventId)?.details, {
    buyerName: 'Ruth Bekele',
    buyerEmail: 'ruth@gmial.com',
    attendeeNames: ['Ruth', 'Sara'],
    giftCents: 1000,
  });
});

// ── Step 3 ─────────────────────────────────────────────────────────────────────────────────────────────────────

function fakeRouting(flow: 'organizer_account' | 'gamo_collects', account: string | null) {
  const calls: OrderCheckoutInput[] = [];
  const routing: PaymentRouting = {
    flow,
    seller: flow === 'organizer_account' ? 'organization' : 'gamo',
    chargeAccountId: account,
    gateway: {} as PaymentRouting['gateway'],
    async createCheckout(input): Promise<StripeCheckoutSession> {
      calls.push(input);
      return {
        id: 'cs_test_1',
        object: 'checkout.session',
        url: 'https://checkout.stripe.com/c/pay/cs_test_1',
        status: 'open',
        payment_status: 'unpaid',
        amount_total: input.lines.reduce((s, l) => s + l.unitAmountCents * l.quantity, 0),
        currency: 'usd',
        client_reference_id: input.orderId,
        payment_intent: null,
        expires_at: input.expiresAt,
        metadata: { order_id: input.orderId },
        livemode: false,
      };
    },
    async expireCheckout() {},
    async createCardPresentPayment() {
      throw new Error('unused');
    },
    async refund() {
      throw new Error('unused');
    },
  };
  return { routing, calls };
}

const details = {
  buyerName: 'Ruth Bekele',
  buyerEmail: 'ruth@example.org',
  attendeeNames: null,
  giftCents: 1000,
};

test('step 3 shows every line priced on the server, the seller and the policies', async () => {
  const { live, seed } = await liveFixture({ flow: 'gamo_collects', giftsEnabled: true });
  const cookies = fakeCookies();
  writeCheckoutState(cookies, stateFor(seed), false);
  assert.deepEqual(await openReview(live, { slug: SLUG, cookies, now: PAID_NOW }), {
    kind: 'redirect',
    location: `/events/${SLUG}/tickets/details`,
    flash: 'checkout-details',
  });
  writeCheckoutState(cookies, stateFor(seed, { details }), false);
  const out = await openReview(live, { slug: SLUG, cookies, now: PAID_NOW });
  assert.ok(out.kind === 'view');
  if (out.kind !== 'view') return;
  assert.deepEqual(out.view.lines[0], { label: 'General × 2', amount: '$40.00', note: undefined });
  const gift = out.view.lines.find((l) => l.label === 'Gift to Grace Church 1');
  assert.equal(gift?.amount, '$10.00');
  assert.match(gift?.note ?? '', /Goes to Grace Church 1\. Gamo makes no tax claim/);
  assert.equal(out.view.total.label, 'Total');
  assert.equal(out.view.seller, 'Gamo Studios on behalf of Grace Church 1');
  assert.match(out.view.policy.refund, /48 hours/);
  assert.deepEqual(out.view.buyer, { name: 'Ruth Bekele', email: 'ruth@example.org' });
});

test('Pay needs the consent, reserves, starts Checkout and remembers the unfinished order; sold out goes back', async () => {
  const { live, seed, exec } = await liveFixture({ flow: 'organizer_account' });
  const cookies = fakeCookies();
  writeCheckoutState(cookies, stateFor(seed, { details: { ...details, giftCents: 0 } }), false);
  const { routing, calls } = fakeRouting('organizer_account', seed.connectedAccountId);
  const pay = (fields: Record<string, string>) =>
    payReview(
      live,
      {
        slug: SLUG,
        form: form(fields),
        cookies,
        secure: false,
        origin: 'https://live.example.org/',
        now: PAID_NOW,
      },
      { routingFor: async () => routing, flush: async () => {} },
    );

  const noConsent = await pay({});
  assert.ok(noConsent.kind === 'view' && noConsent.view.status === 422);
  assert.equal(calls.length, 0);

  const paid = await pay({ terms: 'yes' });
  assert.deepEqual(paid, { kind: 'redirect', location: 'https://checkout.stripe.com/c/pay/cs_test_1' });
  assert.equal(calls.length, 1);
  assert.match(calls[0].successUrl, /^https:\/\/live\.example\.org\/orders\/return\/ord_/);
  assert.equal(calls[0].cancelUrl, `https://live.example.org/events/${SLUG}/tickets`);
  assert.match(readCheckoutState(cookies, seed.eventId)?.pendingToken ?? '', /^ord_/);

  // Everything left is taken by someone else: back to step 1 with a notice.
  exec(`UPDATE ticket_inventory SET online_taken = capacity WHERE ticket_type_id = '${seed.generalTypeId}'`);
  const soldOut = await pay({ terms: 'yes' });
  assert.deepEqual(soldOut, {
    kind: 'redirect',
    location: `/events/${SLUG}/tickets`,
    flash: 'checkout-sold-out',
  });
});

test('Pay without a payment routing answers 503 and charges nothing; a free order opens its order page', async () => {
  const { live, seed, exec } = await liveFixture({ flow: 'organizer_account' });
  const cookies = fakeCookies();
  writeCheckoutState(cookies, stateFor(seed, { details: { ...details, giftCents: 0 } }), false);
  const input = {
    slug: SLUG,
    form: form({ terms: 'yes' }),
    cookies,
    secure: false,
    origin: 'https://live.example.org',
    now: PAID_NOW,
  };
  const none = await payReview(live, input, { routingFor: async () => null, flush: async () => {} });
  assert.ok(none.kind === 'view' && none.view.status === 503);

  exec(`UPDATE ticket_types SET price_cents = 0 WHERE id = '${seed.generalTypeId}'`);
  const sent: string[] = [];
  const free = await payReview(live, input, {
    routingFor: async () => null,
    flush: async () => {},
    sendEmail: async (_env, email) => {
      sent.push(email.subject);
    },
  });
  assert.equal(free.kind, 'redirect');
  if (free.kind === 'redirect')
    assert.match(free.location, /^\/orders\/ord_[0-9a-z]{26}\.\d+\.[0-9a-f]{32}\?new=1$/);
  assert.deepEqual(sent, ['Your tickets: Gospel Night 1']);
  assert.equal(cookies.store.has(CHECKOUT_COOKIE), false, 'answers cleared once the order exists');
});
