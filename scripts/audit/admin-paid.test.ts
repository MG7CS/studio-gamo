/**
 * The admin's part of Gamo Live paid ticketing (apps/admin/src/lib): the shared meeting form (organizations and
 * churches), the paid details on event review, the Payments tab (orders across organizations, refund requests,
 * disputes, not ready, Mode B balances and payouts, one order) and the Live settings (funds flow, Gamo fee with its
 * confirm step, door sales, decision history). Databases are in memory; no request leaves the process.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryD1, applyMigrations, readMigrations } from '../../packages/db/testing.ts';
import {
  PAID_ENV,
  paidTestDatabase,
  seedPaidEvent,
  type SeedPaidEventOptions,
} from '../../packages/domain/src/live/paid-testing.ts';
import {
  loadPaidOrder,
  paymentsRuntime,
  standinCompleteCheckout,
  startOnlineCheckout,
} from '../../packages/domain/index.ts';
import { requestRefund } from '../../packages/domain/src/live/refunds.ts';
import { paidEventReviewDetails } from '../../packages/domain/src/live/admin.ts';
import { PaidError } from '../../packages/domain/src/live/paid-types.ts';
import { LiveAdminError } from '../../packages/domain/src/live/admin.ts';
import { allRows } from '../../packages/domain/src/security/sql-database.ts';
import {
  MEETING_FIELDS,
  meetingDefaults,
  meetingErrorField,
  readChurchMeeting,
  readMeetingForm,
} from '../../apps/admin/src/lib/meeting-form.ts';
import { decideProfile } from '../../apps/admin/src/lib/provider-actions.ts';
import {
  failureFor,
  handleCleanupForm,
  loadPaidReviewDetails,
  organizationErrorField,
  organizationFilterFrom,
  outcomeFrom,
  sendOwnerEmails,
} from '../../apps/admin/src/lib/live-admin.ts';
import { paidReviewText } from '../../apps/admin/src/lib/paid-review.ts';
import {
  decisionLine,
  feeChangePreview,
  feeText,
  handleLiveSettingsForm,
  loadLiveSettings,
  loadOrganizationPayments,
  parsePercentToBps,
  paymentsConfig,
  percentText,
  settingsOutcomeFrom,
} from '../../apps/admin/src/lib/live-settings.ts';
import {
  emailRefundIssued,
  handleAdminOrderForm,
  handlePaymentsForm,
  loadAdminOrder,
  loadAdminOrderPage,
  loadPaymentsView,
  orderFilterFrom,
  ordersHref,
  paymentsFailure,
  paymentsOutcomeFrom,
  paymentsTabCounts,
  paymentsTabFrom,
  searchAdminOrders,
} from '../../apps/admin/src/lib/payments-admin.ts';

const ORIGIN = 'http://127.0.0.1:4326';
const post = (path: string, fields: Record<string, string | string[]>, origin = ORIGIN) => {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) for (const one of [v].flat()) body.append(k, one);
  return new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { origin }, body });
};
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const warn = console.warn;
  const error = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.warn = warn;
    console.error = error;
  }
}

const NOW = Math.floor(Date.now() / 1000);

/**
 * A seeded paid event (its date a month ahead of the real clock) with orders paid through the local Stripe stand-in,
 * so refunds and payouts reach real stand-in charges. Mode B (Gamo collects) unless told otherwise.
 */
async function paidSetup(options: SeedPaidEventOptions = { flow: 'gamo_collects' }) {
  const { d1, db } = await paidTestDatabase();
  const seed = seedPaidEvent(d1, { startsAt: NOW + 30 * 86_400, ...options });
  const paidOrder = async (buyerName = 'Ruth Bekele', buyerEmail = 'ruth@example.org') => {
    const resolved = await paymentsRuntime(db, PAID_ENV).routingForOrganization(seed.organizationId);
    assert.ok(resolved.available);
    const started = await startOnlineCheckout(db, PAID_ENV, {
      input: {
        eventId: seed.eventId,
        occurrenceId: seed.occurrenceId,
        lines: [{ ticketTypeId: seed.generalTypeId, quantity: 2 }],
        buyerName,
        buyerEmail,
        now: NOW,
      },
      routing: resolved.routing,
      origin: 'https://live.example.invalid',
      eventTitle: 'Gospel Night 1',
      now: NOW,
    });
    assert.equal(started.kind, 'redirect');
    const sessionId = new URL(started.kind === 'redirect' ? started.url : '', 'https://x.test').pathname
      .split('/')
      .pop()!;
    await quietly(() => standinCompleteCheckout(db, PAID_ENV, sessionId, 'paid', NOW));
    assert.equal((await loadPaidOrder(db, started.orderId))?.status, 'paid');
    return { orderId: started.orderId };
  };
  return { d1, db, seed, paidOrder };
}

// ── The meeting form ────────────────────────────────────────────────────────────────────────────────────────

test('the meeting form reads date, time, zone, format, link or place and note for the domain', () => {
  assert.deepEqual(
    readMeetingForm(
      form({
        meeting_date: '2030-07-01',
        meeting_time: '09:30',
        meeting_zone: 'America/Chicago',
        meeting_format: 'in_person',
        meeting_location: '1 Main St',
        notes: '  Bring the bylaws. ',
      }),
    ),
    {
      date: '2030-07-01',
      time: '09:30',
      timeZone: 'America/Chicago',
      format: 'in_person',
      location: '1 Main St',
      note: 'Bring the bylaws.',
    },
  );
  assert.equal(readMeetingForm(form({})).timeZone, 'America/Phoenix', 'the default zone');
  assert.equal(readMeetingForm(form({})).note, null);
});

test('a church meeting writes its format into the visible note (the shared record has no format column)', () => {
  const ok = readChurchMeeting(
    form({
      meeting_date: '2030-07-01',
      meeting_time: '09:00',
      meeting_zone: 'America/Phoenix',
      meeting_format: 'video',
      meeting_location: ' https://meet.example.invalid/x ',
      notes: 'Pastor and one elder.',
    }),
  );
  assert.deepEqual(ok, {
    ok: true,
    meetingAt: Date.UTC(2030, 6, 1, 16) / 1000,
    timeZone: 'America/Phoenix',
    location: 'https://meet.example.invalid/x',
    notes: 'Video call. Pastor and one elder.',
  });
  const base = { meeting_date: '2030-07-01', meeting_time: '09:00', meeting_location: 'Hall' };
  assert.deepEqual(readChurchMeeting(form({ ...base })), {
    ok: false,
    message: 'Choose video call or in person.',
    field: 'format',
  });
  assert.equal(
    (
      readChurchMeeting(
        form({ ...base, meeting_format: 'in_person', meeting_zone: 'Mars/Base' }),
      ) as never as {
        field: string;
      }
    ).field,
    'timeZone',
  );
  const r = readChurchMeeting(form({ ...base, meeting_format: 'in_person', meeting_time: '25:00' }));
  assert.equal(!r.ok && r.field, 'time');
  const noPlace = readChurchMeeting(form({ ...base, meeting_format: 'video', meeting_location: ' ' }));
  assert.equal(!noPlace.ok && noPlace.message, 'Enter the video call link.');
  const inPerson = readChurchMeeting(form({ ...base, meeting_format: 'in_person' }));
  assert.equal(inPerson.ok && inPerson.notes, 'In person.');
});

test('meeting errors point at the right field whatever names them', () => {
  assert.equal(meetingErrorField('meeting_at'), 'date');
  assert.equal(meetingErrorField('meeting_location'), 'location');
  assert.equal(meetingErrorField(MEETING_FIELDS.timeZone), 'timeZone');
  assert.equal(meetingErrorField('note'), 'note');
  assert.equal(meetingErrorField('notes'), 'note');
  assert.equal(meetingErrorField('meeting_staff'), null);
  assert.equal(meetingErrorField(null), null);
  assert.equal(
    organizationErrorField({ ok: false, status: 400, message: 'x', field: 'location' }),
    'location',
  );
  assert.equal(organizationErrorField({ ok: true, location: '/' }), null);
});

test('rescheduling starts from the meeting’s own date and time in its zone', () => {
  assert.deepEqual(
    meetingDefaults({
      startsAt: Date.UTC(2030, 0, 1, 16) / 1000,
      timeZone: 'America/New_York',
      format: 'video',
      location: 'https://meet.example.invalid/y',
    }),
    {
      date: '2030-01-01',
      time: '11:00',
      timeZone: 'America/New_York',
      format: 'video',
      location: 'https://meet.example.invalid/y',
    },
  );
});

test('churches use the same meeting form: date, time, zone, format and place reach the shared record', async () => {
  const d1 = createInMemoryD1();
  await applyMigrations(d1, readMigrations());
  const now = Math.floor(Date.now() / 1000);
  await d1.exec(
    `INSERT INTO persons (id,email_normalized,email_verified_at,created_at,updated_at) VALUES ('p1','church@example.invalid',${now},${now},${now})`,
  );
  await d1.exec(
    `INSERT INTO provider_profiles (id,person_id,role,product_origin,display_name,status,requires_staff_review,created_at,updated_at) VALUES ('c1','p1','church','worship','Sample Church','submitted',1,${now},${now})`,
  );
  const env = { DB: d1, ENVIRONMENT: 'local' } as never;
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix' }).format(
    new Date((now + 5 * 86_400) * 1000),
  );
  const fields = {
    action: 'schedule_meeting',
    expected_status: 'submitted',
    meeting_date: day,
    meeting_time: '10:00',
    meeting_zone: 'America/Phoenix',
    meeting_location: 'https://meet.example.invalid/church',
    meeting_staff: 'Gamo staff',
    notes: 'Pastor joins.',
  };
  const missing = await decideProfile(post('/churches/c1', fields), env, 'c1', 'Gamo staff');
  assert.deepEqual(missing, {
    ok: false,
    status: 400,
    message: 'Choose video call or in person.',
    field: 'meeting_format',
  });
  const done = await quietly(() =>
    decideProfile(post('/churches/c1', { ...fields, meeting_format: 'video' }), env, 'c1', 'Gamo staff'),
  );
  assert.equal(done.ok, true);
  assert.match(done.ok ? done.location : '', /^\/churches\/c1\?done=schedule_meeting/);
  const [record] = await allRows<{ meeting_location: string; notes: string; meeting_at: number }>(
    d1 as never,
    {
      sql: "SELECT meeting_location, notes, meeting_at FROM verification_records WHERE subject_id = 'c1' AND action = 'schedule_meeting'",
      params: [],
    },
  );
  assert.equal(record.meeting_location, 'https://meet.example.invalid/church');
  assert.ok(record.meeting_at > now);
  const evil = await decideProfile(post('/churches/c1', fields, 'https://evil.example'), env, 'c1', 'x');
  assert.equal(!evil.ok && evil.status, 403);
});

// ── Gamo Live forms ─────────────────────────────────────────────────────────────────────────────────────────

test('Live form errors become plain words, tied to their field', async () => {
  const words = (e: unknown) => {
    const o = failureFor(e);
    return o.ok ? null : { status: o.status, message: o.message, field: o.field };
  };
  assert.deepEqual(words(new LiveAdminError('not_verified')), {
    status: 409,
    message:
      'This organization is not verified, so its paid event cannot be approved yet. Verify it first (meeting held, then verified), or ask for changes.',
    field: undefined,
  });
  assert.equal(words(new PaidError('stale'))?.status, 409);
  assert.match(
    words(new PaidError('invalid', { detail: 'meeting_not_started' }))?.message ?? '',
    /not started/,
  );
  assert.equal(words(new PaidError('invalid', { detail: 'location' }))?.field, 'location');
  assert.equal(words(new PaidError('invalid', { detail: 'note_required' }))?.field, 'notes');
  assert.equal(words(new PaidError('invalid', { detail: 'reason' }))?.field, 'reason');
  assert.equal(words(new PaidError('forbidden', { detail: 'suspended' }))?.status, 409);
  assert.equal(words(new PaidError('invalid', { detail: 'something_new' }))?.status, 400);
  assert.equal(await quietly(async () => words(new Error('boom'))?.status), 500);
});

test('owner emails: sent, unavailable or nobody to email; the step stands either way', async () => {
  const email = { to: 'owner@example.invalid', subject: 'Sample', text: 'Sample' };
  assert.equal(await quietly(() => sendOwnerEmails({ ENVIRONMENT: 'local' } as never, [email])), 'yes');
  assert.equal(await quietly(() => sendOwnerEmails({ ENVIRONMENT: 'production' } as never, [email])), 'no');
  assert.equal(await sendOwnerEmails({ ENVIRONMENT: 'production' } as never, []), 'none');
});

test('organization filters: unknown values fall back to “waiting for you”', () => {
  assert.equal(organizationFilterFrom(new URL('http://x/organizations?filter=to_schedule')), 'to_schedule');
  assert.equal(organizationFilterFrom(new URL('http://x/organizations?filter=to_decide')), 'to_decide');
  assert.equal(organizationFilterFrom(new URL('http://x/organizations?filter=nope')), 'waiting');
  assert.equal(organizationFilterFrom(new URL('http://x/organizations')), 'waiting');
});

test('cleanup reports anonymized paid orders and ended staff devices too', async () => {
  const { d1 } = await paidTestDatabase();
  const env = { LIVE_DB: d1, ENVIRONMENT: 'local' } as never;
  const outcome = await handleCleanupForm(post('/maintenance', { action: 'cleanup', confirm: 'yes' }), env);
  assert.equal(outcome.ok, true);
  const location = new URL(outcome.ok ? outcome.location : '/', 'http://x');
  assert.equal(location.searchParams.get('orders'), '0');
  assert.equal(location.searchParams.get('devices'), '0');
  assert.match(
    outcomeFrom(location) ?? '',
    /0 ended door staff devices.*0 paid orders \(amounts and references kept\)/,
  );
});

// ── Event review: paid details ──────────────────────────────────────────────────────────────────────────────

test('paid events on the review list show their ticket types, fee payer, policies, gifts, door sales and codes', async () => {
  const { db, seed } = await paidSetup({ giftsEnabled: true });
  const details = await loadPaidReviewDetails(db, [
    { id: seed.eventId, admission: 'paid_tickets' },
    { id: 'evt_free', admission: 'free_registration' },
  ]);
  assert.deepEqual([...details.keys()], [seed.eventId], 'free events are left out');
  const text = paidReviewText(details.get(seed.eventId)!, 'America/Phoenix');
  assert.deepEqual(
    text.ticketTypes.map((t) => [t.name, t.price]),
    [
      ['General', '$20.00'],
      ['VIP', '$50.00'],
    ],
  );
  assert.equal(text.ticketTypes[1].lines[0], 'On sale · 10 per date · up to 4 per order');
  assert.equal(text.ticketTypes[1].lines[1], 'Door: 2 held for the door');
  assert.equal(text.feePayer, 'The buyer pays the Gamo fee (shown as its own line)');
  assert.ok(text.policies.includes('Refunds: until 48 hours before the start'));
  assert.ok(text.extras.includes('Gifts to the organization: offered'));
  assert.ok(text.extras.includes('Codes: 0 promo codes, 0 presale access codes'));
  const bare = paidReviewText(
    { ...(await paidEventReviewDetails(db, seed.eventId))!, feePayer: null, policies: null },
    'America/Phoenix',
  );
  assert.deepEqual(bare.policies, ['Policies not saved yet']);
});

// ── Live settings ───────────────────────────────────────────────────────────────────────────────────────────

test('fee words: percent, fixed, both or none; typed percents become basis points', () => {
  assert.equal(percentText(250), '2.5%');
  assert.equal(percentText(300), '3%');
  assert.equal(percentText(5), '0.05%');
  assert.equal(feeText({ fixedCents: 50, percentBps: 250 }), '$0.50 + 2.5%');
  assert.equal(feeText({ fixedCents: 0, percentBps: 0 }), 'No fee');
  assert.equal(parsePercentToBps('2.5'), 250);
  assert.equal(parsePercentToBps('2.5%'), 250);
  assert.equal(parsePercentToBps('0'), 0);
  assert.equal(parsePercentToBps('-1'), null);
  assert.equal(parsePercentToBps('1.234'), null);
});

test('a fee change is reviewed first: old and new fee, errors on their field, nothing when unchanged', () => {
  const current = { fixedCents: 0, percentBps: 0 };
  const p = (q: string) => feeChangePreview(new URLSearchParams(q), current);
  assert.deepEqual(p(''), { state: 'none' });
  assert.deepEqual(p('fee_fixed=0.50&fee_percent=2.5'), {
    state: 'ready',
    fixedCents: 50,
    percentBps: 250,
    oldText: 'No fee',
    newText: '$0.50 + 2.5%',
  });
  assert.equal((p('fee_fixed=abc&fee_percent=1') as { field: string }).field, 'fee_fixed');
  assert.equal((p('fee_fixed=0&fee_percent=50') as { field: string }).field, 'fee_percent');
  assert.equal((p('fee_fixed=1000.00&fee_percent=0') as { field: string }).field, 'fee_fixed');
  assert.deepEqual(p('fee_fixed=0&fee_percent=0'), { state: 'same', text: 'No fee' });
});

test('Live settings: funds-flow default, fee (confirmed), door sales, overrides and the decision history', async () => {
  const { d1, seed } = await paidSetup({});
  const env = { LIVE_DB: d1, ENVIRONMENT: 'local' } as never;
  const send = (fields: Record<string, string>, origin?: string) =>
    handleLiveSettingsForm(post('/live-settings', fields, origin), env);
  assert.equal(
    (await send({ action: 'flow_default', funds_flow: 'gamo_collects', reason: 'x' }, 'https://evil.example'))
      .ok,
    false,
  );
  const noReason = await send({ action: 'flow_default', funds_flow: 'gamo_collects' });
  assert.deepEqual(noReason, {
    ok: false,
    status: 400,
    message: 'Add a reason (at most 500 characters). It is kept with the decision.',
    field: 'reason',
  });
  assert.equal((await send({ action: 'flow_default', funds_flow: 'stripe', reason: 'x' })).ok, false);
  assert.deepEqual(
    await send({ action: 'flow_default', funds_flow: 'gamo_collects', reason: 'Start with Mode B.' }),
    {
      ok: true,
      location: '/live-settings?done=flow_default#funds-flow',
    },
  );
  assert.deepEqual(await send({ action: 'flow_default', funds_flow: 'gamo_collects', reason: 'Again.' }), {
    ok: true,
    location: '/live-settings?done=same#funds-flow',
  });
  // The fee needs the confirm step.
  const unconfirmed = await send({ action: 'fee', fixed_cents: '50', percent_bps: '250', reason: 'Costs.' });
  assert.equal(!unconfirmed.ok && unconfirmed.message, 'Confirm the fee change to save it.');
  assert.deepEqual(
    await send({ action: 'fee', fixed_cents: '50', percent_bps: '250', reason: 'Costs.', confirm: 'yes' }),
    { ok: true, location: '/live-settings?done=fee#fee' },
  );
  const tooHigh = await send({
    action: 'fee',
    fixed_cents: '50',
    percent_bps: '99999',
    reason: 'x',
    confirm: 'yes',
  });
  assert.equal(!tooHigh.ok && tooHigh.field, 'fee_percent');
  assert.deepEqual(await send({ action: 'door_off', reason: 'Pause.' }), {
    ok: true,
    location: '/live-settings?done=door_off#door-sales',
  });
  assert.equal((await send({ action: 'dance' })).ok, false);
  // An override set from the organization page shows in the list.
  const { handleOrganizationForm } = await import('../../apps/admin/src/lib/live-admin.ts');
  await handleOrganizationForm(
    post(`/organizations/${seed.organizationId}`, {
      action: 'funds_flow',
      funds_flow: 'organizer_account',
      reason: 'Has its own Stripe.',
    }),
    env,
    seed.organizationId,
  );
  const view = await loadLiveSettings(env, Math.floor(Date.now() / 1000) + 60);
  assert.equal(view?.settings.fundsFlowDefault, 'gamo_collects');
  assert.equal(view?.settings.doorSalesEnabled, false);
  assert.deepEqual(view?.fee, { fixedCents: 50, percentBps: 250, effectiveAt: view?.fee.effectiveAt });
  assert.deepEqual(
    view?.feeHistory.map((h) => [h.fixedCents, h.percentBps]),
    [
      [50, 250],
      [0, 0],
    ],
    'newest first, after the starting $0 fee',
  );
  assert.deepEqual(view?.overrides, [
    { organizationId: seed.organizationId, name: 'Grace Church 1', flow: 'organizer_account' },
  ]);
  assert.deepEqual(
    view?.decisions.map((d) => [d.subject, d.change, d.organizationName]),
    [
      [
        'Organization funds flow',
        'Platform default → Mode A: the organization’s own Stripe account',
        'Grace Church 1',
      ],
      ['Door sales', 'On → Off', null],
      ['Gamo fee', 'No fee → $0.50 + 2.5%', null],
      ['Funds-flow default', 'Not chosen (card sales off) → Mode B: Gamo collects and pays out', null],
    ],
  );
  assert.equal(
    settingsOutcomeFrom(new URL('http://x/live-settings?done=fee')),
    'Gamo fee changed. It applies to new orders; tickets already sold keep their fee.',
  );
  assert.equal(settingsOutcomeFrom(new URL('http://x/live-settings?done=toString')), null);
  const org = await loadOrganizationPayments(env, seed.organizationId);
  assert.equal(org?.status.flow, 'organizer_account');
  assert.equal(org?.platformDefault, 'gamo_collects');
  assert.equal(org?.decisions.length, 1);
  assert.equal(
    await quietly(() => loadLiveSettings({} as never)),
    null,
    'unavailable is never shown as defaults',
  );
});

test('payout decisions read in plain words', () => {
  const line = decisionLine(
    {
      id: 'pd1',
      subject: 'payout',
      organizationId: 'org_1',
      oldValue: null,
      newValue: JSON.stringify({ payoutId: 'po1', amountCents: 1500, status: 'prepared' }),
      reason: 'Event over.',
      decidedAt: 1,
    },
    new Map([['org_1', 'Grace Church 1']]),
  );
  assert.deepEqual(line, {
    id: 'pd1',
    subject: 'Payout',
    organizationName: 'Grace Church 1',
    change: '$15.00 prepared',
    reason: 'Event over.',
    decidedAt: 1,
  });
});

test('payments config: test keys, the local stand-in, live keys and nothing', () => {
  assert.deepEqual(paymentsConfig({ ENVIRONMENT: 'local' } as never), {
    configured: false,
    standin: false,
    liveMode: false,
  });
  assert.deepEqual(paymentsConfig({ ...PAID_ENV } as never), {
    configured: true,
    standin: true,
    liveMode: false,
  });
  assert.deepEqual(paymentsConfig({ ENVIRONMENT: 'preview', STRIPE_SECRET_KEY: 'sk_test_x' } as never), {
    configured: true,
    standin: false,
    liveMode: false,
  });
  assert.deepEqual(paymentsConfig({ ENVIRONMENT: 'production', STRIPE_SECRET_KEY: 'sk_live_x' } as never), {
    configured: true,
    standin: false,
    liveMode: true,
  });
});

// ── Payments ────────────────────────────────────────────────────────────────────────────────────────────────

test('payments tabs and order filters come from the URL; anything else falls back', () => {
  assert.equal(paymentsTabFrom(new URL('http://x/payments?tab=refunds')), 'refunds');
  assert.equal(paymentsTabFrom(new URL('http://x/payments?tab=nope')), 'orders');
  assert.deepEqual(orderFilterFrom(new URL('http://x/payments?q=%20ruth%20&status=disputed&seller=gamo')), {
    q: 'ruth',
    status: 'disputed',
    seller: 'gamo',
  });
  assert.deepEqual(orderFilterFrom(new URL('http://x/payments?status=lost&seller=bank')), {
    q: '',
    status: null,
    seller: null,
  });
  assert.equal(
    ordersHref({ q: 'ruth', status: 'paid', seller: null }),
    '/payments?tab=orders&q=ruth&status=paid',
  );
});

test('orders across organizations: search by reference, buyer or organization; filters; previews never show', async () => {
  const { d1, db, paidOrder } = await paidSetup();
  const a = await paidOrder('Ruth Bekele', 'ruth@example.org');
  await paidOrder('Abel Tesfaye', 'abel@example.org');
  d1.sqlite.exec(`UPDATE orders SET is_preview = 1 WHERE buyer_email = 'abel@example.org'`);
  const all = await searchAdminOrders(db, { q: '', status: null, seller: null });
  assert.deepEqual(
    all.map((o) => o.buyerName),
    ['Ruth Bekele'],
  );
  assert.equal(all[0].organizationName, 'Grace Church 1');
  assert.equal(all[0].seller, 'gamo');
  const reference = all[0].reference;
  assert.equal(
    (await searchAdminOrders(db, { q: reference.replace('-', ''), status: null, seller: null })).length,
    1,
  );
  assert.equal((await searchAdminOrders(db, { q: 'RUTH@', status: null, seller: null })).length, 1);
  assert.equal((await searchAdminOrders(db, { q: 'grace church', status: null, seller: null })).length, 1);
  assert.equal((await searchAdminOrders(db, { q: '100%_', status: null, seller: null })).length, 0);
  assert.equal((await searchAdminOrders(db, { q: '', status: 'refunded', seller: null })).length, 0);
  assert.equal((await searchAdminOrders(db, { q: '', status: 'paid', seller: 'organization' })).length, 0);
  assert.equal((await searchAdminOrders(db, { q: '', status: 'disputed', seller: null })).length, 0);
  d1.sqlite.exec(`UPDATE orders SET disputed = 1 WHERE id = '${a.orderId}'`);
  assert.equal((await searchAdminOrders(db, { q: '', status: 'disputed', seller: 'gamo' })).length, 1);
});

test('the Payments tab: every chip count is the length of its list; unavailable is null', async () => {
  const { d1, db, seed, paidOrder } = await paidSetup();
  const env = { LIVE_DB: d1, ...PAID_ENV } as never;
  const o = await paidOrder();
  const tickets = await allRows<{ id: string }>(db, {
    sql: 'SELECT id FROM tickets WHERE order_id = ?1 ORDER BY seq',
    params: [o.orderId],
  });
  await requestRefund(db, PAID_ENV, {
    orderId: o.orderId,
    ticketIds: [tickets[0].id],
    reason: 'Sick',
    now: NOW,
  });
  const view = await loadPaymentsView(
    env,
    { tab: 'refunds', filter: { q: '', status: null, seller: null } },
    NOW,
  );
  assert.ok(view);
  assert.equal(view.orders, null, 'orders are read only on their tab');
  assert.equal(view.refunds.length, 1);
  assert.equal(view.balances.length, 1);
  assert.equal(view.balances[0].organizationId, seed.organizationId);
  assert.equal(view.balances[0].availability.availableCents, 0, 'the event is still ahead');
  assert.deepEqual(paymentsTabCounts(view), {
    orders: null,
    refunds: 1,
    disputes: 0,
    not_ready: view.notReady.length,
    balances: 1,
  });
  const ordersTab = await loadPaymentsView(env, {
    tab: 'orders',
    filter: { q: '', status: null, seller: null },
  });
  assert.equal(ordersTab?.orders?.length, 1);
  assert.equal(
    await quietly(() =>
      loadPaymentsView({} as never, { tab: 'orders', filter: { q: '', status: null, seller: null } }),
    ),
    null,
  );
});

test('refund requests where Gamo sold: decline keeps the tickets; approve needs payments configured', async () => {
  const { d1, db, paidOrder } = await paidSetup();
  const o = await paidOrder();
  const tickets = await allRows<{ id: string }>(db, {
    sql: 'SELECT id FROM tickets WHERE order_id = ?1 ORDER BY seq',
    params: [o.orderId],
  });
  const first = await requestRefund(db, PAID_ENV, {
    orderId: o.orderId,
    ticketIds: [tickets[0].id],
    reason: 'Sick',
    now: NOW,
  });
  const second = await requestRefund(db, PAID_ENV, {
    orderId: o.orderId,
    ticketIds: [tickets[1].id],
    reason: 'Away',
    now: NOW,
  });
  const noStripe = { LIVE_DB: d1, ENVIRONMENT: 'local' } as never;
  assert.equal(
    (
      await handlePaymentsForm(
        post('/payments', { action: 'decline_refund', refund_id: first.refundId }, 'https://evil.example'),
        noStripe,
      )
    ).ok,
    false,
  );
  assert.deepEqual(
    await handlePaymentsForm(
      post('/payments', { action: 'decline_refund', refund_id: first.refundId, notes: 'Policy.' }),
      noStripe,
    ),
    { ok: true, location: '/payments?tab=refunds&done=refund_declined&buyer=yes' },
  );
  assert.deepEqual(
    await handlePaymentsForm(
      post('/payments', { action: 'decline_refund', refund_id: first.refundId }),
      noStripe,
    ),
    { ok: false, status: 409, message: 'That was already decided or refunded. Reload to see the latest.' },
  );
  assert.deepEqual(
    await handlePaymentsForm(
      post('/payments', { action: 'approve_refund', refund_id: second.refundId }),
      noStripe,
    ),
    { ok: false, status: 503, message: 'Payments are not configured here, so nothing was sent to Stripe.' },
  );
  assert.equal(
    (
      await handlePaymentsForm(
        post('/payments', { action: 'approve_refund', refund_id: 'rfd_nope' }),
        noStripe,
      )
    ).ok,
    false,
  );
  // With the local stand-in the refund goes through and the buyer is emailed.
  const standin = { LIVE_DB: d1, ...PAID_ENV } as never;
  const approved = await quietly(() =>
    handlePaymentsForm(post('/payments', { action: 'approve_refund', refund_id: second.refundId }), standin),
  );
  assert.equal(approved.ok, true, JSON.stringify(approved));
  assert.match(
    approved.ok ? approved.location : '',
    /^\/payments\?tab=refunds&done=refund_(approved|pending)&buyer=yes$/,
  );
  const statuses = await allRows<{ status: string }>(db, {
    sql: 'SELECT status FROM tickets WHERE order_id = ?1 ORDER BY seq',
    params: [o.orderId],
  });
  assert.deepEqual(
    statuses.map((t) => t.status),
    ['valid', 'refunded'],
  );
  assert.match(
    paymentsOutcomeFrom(new URL('http://x/payments?done=refund_approved&buyer=no')) ?? '',
    /buyer was not emailed/,
  );
  assert.equal(paymentsOutcomeFrom(new URL('http://x/payments?done=constructor')), null);
});

test('Mode B payouts: prepare (reason), cancel, and send only through the confirm step in test mode', async () => {
  const { d1, db, seed, paidOrder } = await paidSetup();
  await paidOrder();
  // The event's dates have all passed: the money can be paid out.
  const past = Math.floor(Date.now() / 1000) - 7 * 86_400;
  d1.sqlite.exec(
    `UPDATE event_occurrences SET starts_at = ${past}, ends_at = ${past + 3600} WHERE id = '${seed.occurrenceId}'`,
  );
  const noStripe = { LIVE_DB: d1, ENVIRONMENT: 'local' } as never;
  const standin = { LIVE_DB: d1, ...PAID_ENV } as never;
  const prepare = (fields: Record<string, string>, env = noStripe) =>
    handlePaymentsForm(
      post('/payments', { action: 'prepare_payout', organization_id: seed.organizationId, ...fields }),
      env,
    );
  assert.equal(((await prepare({})) as { status: number }).status, 400, 'a reason is required');
  assert.equal(((await prepare({ amount: 'lots', reason: 'x' })) as { status: number }).status, 400);
  assert.deepEqual(await prepare({ amount: '5.00', reason: 'Event over.' }), {
    ok: true,
    location: '/payments?tab=balances&done=payout_prepared',
  });
  const [first] = await allRows<{ id: string }>(db, {
    sql: "SELECT id FROM payouts WHERE status = 'prepared'",
    params: [],
  });
  assert.equal(
    (
      (await handlePaymentsForm(
        post('/payments', { action: 'cancel_payout', payout_id: first.id }),
        noStripe,
      )) as { status: number }
    ).status,
    400,
    'canceling needs a reason',
  );
  assert.deepEqual(
    await handlePaymentsForm(
      post('/payments', { action: 'cancel_payout', payout_id: first.id, reason: 'Wrong amount.' }),
      noStripe,
    ),
    { ok: true, location: '/payments?tab=balances&done=payout_canceled' },
  );
  assert.deepEqual(await prepare({ reason: 'Everything available.' }), {
    ok: true,
    location: '/payments?tab=balances&done=payout_prepared',
  });
  const [payout] = await allRows<{ id: string; amount_cents: number }>(db, {
    sql: "SELECT id, amount_cents FROM payouts WHERE status = 'prepared'",
    params: [],
  });
  assert.ok(payout.amount_cents > 500);
  // Without the confirm step nothing is sent, whatever the environment.
  assert.deepEqual(
    await handlePaymentsForm(post('/payments', { action: 'send_payout', payout_id: payout.id }), standin),
    {
      ok: false,
      status: 400,
      message: 'Open “Send payout…” and confirm to send it. Nothing was sent.',
    },
  );
  assert.deepEqual(
    await handlePaymentsForm(
      post('/payments', { action: 'send_payout', payout_id: payout.id, confirm: 'yes' }),
      noStripe,
    ),
    { ok: false, status: 503, message: 'Payments are not configured here, so nothing was sent to Stripe.' },
  );
  const sent = await quietly(() =>
    handlePaymentsForm(
      post('/payments', { action: 'send_payout', payout_id: payout.id, confirm: 'yes' }),
      standin,
    ),
  );
  assert.deepEqual(sent, { ok: true, location: '/payments?tab=balances&done=payout_sent' });
  const [after] = await allRows<{ status: string }>(db, {
    sql: 'SELECT status FROM payouts WHERE id = ?1',
    params: [payout.id],
  });
  assert.equal(after.status, 'sent');
});

test('payment errors in plain words: live mode, not Gamo’s order, nothing available, Stripe down', () => {
  const message = (e: unknown) => {
    const o = paymentsFailure(e);
    return o.ok ? '' : o.message;
  };
  assert.match(
    message(new PaidError('forbidden', { detail: 'live_mode' })),
    /test mode until the owner approves/,
  );
  assert.match(
    message(new PaidError('forbidden', { detail: 'not_gamo_seller' })),
    /only the organization can refund/,
  );
  assert.match(
    message(new PaidError('limit_exceeded', { detail: 'nothing_available' })),
    /dates have all passed/,
  );
  assert.match(message(new PaidError('stripe_error', { detail: 'retry' })), /could not be reached/);
  assert.match(message(new PaidError('account_not_ready')), /cannot receive transfers/);
});

test('one order across organizations: receipt, tickets, history, and a refund only where Gamo sold it', async () => {
  const { d1, db, paidOrder } = await paidSetup();
  const o = await paidOrder();
  const view = await loadAdminOrder(db, o.orderId);
  assert.ok(view);
  assert.equal(view.canRefund, true);
  assert.equal(view.refundableTickets.length, 2);
  assert.equal(view.receipt.lines[0].label, 'General × 2');
  assert.equal(view.detail.tickets.length, 2);
  assert.equal(await loadAdminOrder(db, 'ord_nope'), null);
  assert.equal(await loadAdminOrderPage({ LIVE_DB: d1 } as never, 'ord_nope'), 'not_found');
  assert.equal(await quietly(() => loadAdminOrderPage({} as never, o.orderId)), null);

  const standin = { LIVE_DB: d1, ...PAID_ENV } as never;
  const path = `/payments/orders/${o.orderId}`;
  const chosenNone = await handleAdminOrderForm(
    post(path, { action: 'refund', scope: 'chosen' }),
    standin,
    o.orderId,
  );
  assert.equal(!chosenNone.ok && chosenNone.message, 'Choose the tickets to refund.');
  const done = await quietly(() =>
    handleAdminOrderForm(
      post(path, {
        action: 'refund',
        scope: 'chosen',
        ticket_id: [view.refundableTickets[0].id],
        reason: 'Asked by phone.',
      }),
      standin,
      o.orderId,
    ),
  );
  assert.equal(done.ok, true, JSON.stringify(done));
  assert.match(
    done.ok ? done.location : '',
    new RegExp(`^/payments/orders/${o.orderId}\\?done=(refunded|refund_sent)&buyer=yes$`),
  );
  assert.equal((await loadAdminOrder(db, o.orderId))?.refundableTickets.length, 1);

  // A Mode A order: the organization is the seller, so Gamo does not refund it.
  const modeA = await paidSetup({ flow: 'organizer_account' });
  const a = await modeA.paidOrder();
  const aView = await loadAdminOrder(modeA.db, a.orderId);
  assert.equal(aView?.canRefund, false);
  assert.match(aView?.refundNote ?? '', /only the organization can refund/);
  const refused = await handleAdminOrderForm(
    post(`/payments/orders/${a.orderId}`, { action: 'refund', scope: 'all' }),
    { LIVE_DB: modeA.d1, ...PAID_ENV } as never,
    a.orderId,
  );
  assert.equal(!refused.ok && refused.status, 403);
});

test('the refund email goes to the buyer; without email it says so', async () => {
  const { db, paidOrder } = await paidSetup();
  const o = await paidOrder();
  const view = await loadAdminOrder(db, o.orderId);
  const order = view!.order;
  assert.equal(
    await quietly(() =>
      emailRefundIssued(db, { ...PAID_ENV } as never, order, { amountCents: 2000, ticketCount: 1 }),
    ),
    'yes',
  );
  assert.equal(
    await quietly(() =>
      emailRefundIssued(db, { ENVIRONMENT: 'production' } as never, order, {
        amountCents: 2000,
        ticketCount: 1,
      }),
    ),
    'no',
  );
  assert.equal(
    await emailRefundIssued(
      db,
      { ...PAID_ENV } as never,
      { ...order, buyerEmail: null },
      { amountCents: 1, ticketCount: 0 },
    ),
    'none',
  );
});
