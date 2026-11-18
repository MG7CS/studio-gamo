/**
 * Admin roster and requests (apps/admin: pages/roster, pages/requests, pages/api/{roster,requests,offers},
 * components/worship, lib/worship).
 *
 * Pages cannot be compiled by node:test, so the rules live in lib/worship (pure parsers, actions, HTTP
 * handlers) and are tested against a real migrated D1; the pages and components are checked from their
 * sources (no raw HTML, no raw styling, no token anywhere). The routes run with real staff sessions.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createSession } from '../../packages/auth/index.ts';
import { createDb } from '../../packages/db/index.ts';
import { StaffIdentityService } from '../../packages/domain/src/services/staff-identity.ts';
import {
  approveApplication,
  createRequestFromSubmission,
  respondToOffer,
  sendOffer,
} from '../../packages/domain/src/worship/index.ts';
import {
  ENV,
  all,
  fakeResend,
  get,
  musicianBinds,
  newDb,
  NOW,
  requestBinds,
  run,
  seedSubmission,
} from '../../packages/domain/src/worship/test-support.ts';
import type { AdminContext } from '../../apps/admin/src/lib/admin-page.ts';
import {
  candidatesForRole,
  changeRequestStatus,
  changeRosterStatus,
  proposeOffer,
  publicWebOrigin,
  recordW9,
  withdrawPendingOffer,
  type WorshipCtx,
} from '../../apps/admin/src/lib/worship/actions.ts';
import { parseRequestFilters, parseRosterFilters } from '../../apps/admin/src/lib/worship/filters.ts';
import { formatInstant, formatService, isoDay, shortName } from '../../apps/admin/src/lib/worship/format.ts';
import {
  handleListRoster,
  handleRequestPost,
  handleRosterPost,
  handleSendOffer,
  handleWithdrawOffer,
  rosterMemberJson,
} from '../../apps/admin/src/lib/worship/http.ts';
import {
  MAX_OFFER_CENTS,
  dollarsToCents,
  formatCents,
  parseCents,
  validateOfferCents,
} from '../../apps/admin/src/lib/worship/money.ts';
import {
  REQUEST_NOTICES,
  ROSTER_NOTICES,
  classifyWorshipError,
} from '../../apps/admin/src/lib/worship/notices.ts';
import { noticeFrom } from '../../apps/admin/src/lib/flash.ts';
import { GET as rosterGet } from '../../apps/admin/src/pages/api/roster/index.ts';
import { POST as sendOfferPost } from '../../apps/admin/src/pages/api/requests/[id]/offers.ts';
import { POST as withdrawPost } from '../../apps/admin/src/pages/api/offers/[id]/withdraw.ts';

const staffId = 'staff_1';
const ORIGIN = 'https://admin.gamostudio.org';
const JSON_HEADERS = { 'content-type': 'application/json', accept: 'application/json', origin: ORIGIN };
const FORM_HEADERS = { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN };

type Db = Awaited<ReturnType<typeof newDb>>;

// ---------------------------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------------------------

async function scenario(requestOver: Record<string, unknown> = {}) {
  const d1 = await newDb();
  const mail = fakeResend();
  const member = async (
    name: string,
    email: string,
    roles: string[],
    city = 'Phoenix',
    program = 'worship',
  ) =>
    (
      await approveApplication(
        d1,
        ENV,
        {
          submissionId: seedSubmission(d1, {
            kind: program === 'production' ? 'technician_application' : 'musician_application',
            program,
            binds: musicianBinds({
              'contact.name': name,
              'contact.email': email,
              'roster.roles': roles,
              'roster.city': city,
            }),
          }),
          staffId,
          now: NOW,
        },
        mail.options,
      )
    ).id;
  const ana = await member('Ana Reyes', 'ana@example.org', ['Drums', 'Bass']);
  const ben = await member('Ben Brooks', 'ben@example.org', ['drums']);
  const cy = await member('Cy Chen', 'cy@example.org', ['Keys'], 'Tucson');
  const dee = await member('Dee Diaz', 'dee@example.org', ['Bass'], 'Tucson');
  const request = await createRequestFromSubmission(d1, {
    submissionId: seedSubmission(d1, {
      kind: 'church_request',
      program: 'worship',
      binds: requestBinds(requestOver),
    }),
    now: NOW,
  });
  mail.calls.length = 0;
  const ctx: WorshipCtx = { sql: d1, env: ENV, staffId, now: NOW, mail: mail.options };
  const admin = {
    env: ENV,
    db: d1,
    staff: { userId: staffId, name: 'Staff', email: 'staff@example.org' },
    auth: { user: { id: staffId } },
  } as unknown as AdminContext;
  return { d1, mail, ctx, admin, ana, ben, cy, dee, request };
}

const tokenIn = (text: string): string => /\/worship\/offers\/([A-Za-z0-9_-]{43})/.exec(text)![1]!;
const requestStatus = (d1: Db, id: string) =>
  get(d1, 'SELECT status FROM service_requests WHERE id = ?', id)!.status;
const offerStatus = (d1: Db, id: string) => get(d1, 'SELECT status FROM offers WHERE id = ?', id)!.status;
const countOffers = (d1: Db) => Number(get(d1, 'SELECT count(*) AS n FROM offers')!.n);

async function refusedWith(
  promise: Promise<unknown>,
  key: string,
  context: Parameters<typeof classifyWorshipError>[1],
) {
  await assert.rejects(promise, (err) => {
    const classified = classifyWorshipError(err, context);
    assert.equal(classified?.key, key, `classified as ${classified?.key}: ${(err as Error).message}`);
    return true;
  });
}

const form = (fields: Record<string, string>, headers: Record<string, string> = FORM_HEADERS) =>
  new Request(`${ORIGIN}/x`, { method: 'POST', headers, body: new URLSearchParams(fields).toString() });
const json = (fields: Record<string, unknown>) =>
  new Request(`${ORIGIN}/x`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(fields) });

// ---------------------------------------------------------------------------------------------
// money
// ---------------------------------------------------------------------------------------------

test('dollarsToCents reads typed dollars exactly, with no floating point', () => {
  const cases: Array<[unknown, number | null]> = [
    ['150', 15_000],
    ['150.5', 15_050],
    ['150.05', 15_005],
    ['$150', 15_000],
    ['$ 19.99', 1_999],
    ['0.07', 7],
    ['1,200.00', 120_000],
    ['  75  ', 7_500],
    ['5000', 500_000],
    ['0', 0],
    ['', null],
    ['abc', null],
    ['-5', null],
    ['1e3', null],
    ['150.999', null],
    ['150.', null],
    ['.5', null],
    ['1,20', null],
    ['12,34,567', null],
    ['99999999', null],
    [150, null],
    [undefined, null],
  ];
  for (const [input, expected] of cases)
    assert.equal(dollarsToCents(input), expected, `input ${String(input)}`);
  assert.equal(dollarsToCents('19.99'), 1_999, '19.99 * 100 would be 1998.9999999999998');
});

test('offer pay must be a positive whole number of cents within the cap', () => {
  assert.equal(validateOfferCents(1), true);
  assert.equal(validateOfferCents(MAX_OFFER_CENTS), true);
  assert.equal(validateOfferCents(MAX_OFFER_CENTS + 1), false);
  for (const bad of [0, -1, 1.5, Number.NaN, Infinity, null])
    assert.equal(validateOfferCents(bad as number), false);
  assert.equal(parseCents(15_000), 15_000);
  assert.equal(parseCents('15000'), 15_000);
  for (const bad of ['1.5', '-3', '1e3', '', 'x', 1.5, null, undefined, {}])
    assert.equal(parseCents(bad), null);
  assert.equal(formatCents(150_000), '$1,500.00');
  assert.equal(formatCents(5), '$0.05');
});

// ---------------------------------------------------------------------------------------------
// filters
// ---------------------------------------------------------------------------------------------

test('roster filters accept role, city, status, program, limit and cursor; bad values are reported, not used', () => {
  const ok = parseRosterFilters(
    new URLSearchParams('role=Drums&city=Phoenix&status=paused&program=production&limit=10&cursor=abc'),
  );
  assert.deepEqual(ok.search, {
    limit: 10,
    role: 'Drums',
    city: 'Phoenix',
    status: 'paused',
    program: 'production',
    cursor: 'abc',
  });
  assert.deepEqual(ok.invalid, []);

  const bad = parseRosterFilters(new URLSearchParams('status=deleted&program=web&limit=500'));
  assert.deepEqual(bad.invalid.sort(), ['limit', 'program', 'status']);
  assert.equal(bad.search.status, undefined);
  assert.equal(bad.search.program, undefined);
  assert.equal(bad.search.limit, 25);

  const long = parseRosterFilters(new URLSearchParams({ role: 'x'.repeat(500), cursor: 'c'.repeat(600) }));
  assert.equal(long.values.role.length, 60);
  assert.equal(long.search.cursor, undefined);
  assert.deepEqual(long.invalid, ['cursor']);
});

test('request filters validate status, program and date range', () => {
  const ok = parseRequestFilters(
    new URLSearchParams('status=offered&program=worship&from=2030-03-01&to=2030-03-31'),
  );
  assert.deepEqual(ok.filter, {
    limit: 25,
    status: 'offered',
    program: 'worship',
    fromDate: '2030-03-01',
    toDate: '2030-03-31',
  });
  const bad = parseRequestFilters(
    new URLSearchParams('status=done&from=2030-02-31&to=tomorrow&program=academy'),
  );
  assert.deepEqual(bad.invalid.sort(), ['from', 'program', 'status', 'to']);
  assert.deepEqual(bad.filter, { limit: 25 });
});

// ---------------------------------------------------------------------------------------------
// notices
// ---------------------------------------------------------------------------------------------

test('notice keys are safe for see(), notices name no person, and noticeFrom only reads own keys', () => {
  for (const table of [ROSTER_NOTICES, REQUEST_NOTICES]) {
    for (const [key, notice] of Object.entries(table)) {
      assert.match(key, /^[a-z0-9-]{1,40}$/, key);
      assert.ok(notice.text.length > 10 && notice.text.endsWith('.'), key);
      assert.ok(!/token|https?:|@/.test(notice.text), `${key} must not carry a link or address`);
    }
  }
  assert.deepEqual(noticeFrom(new URL(`${ORIGIN}/roster?notice=w9-recorded`), ROSTER_NOTICES), {
    kind: 'ok',
    text: 'W-9 receipt recorded.',
  });
  for (const hostile of ['__proto__', 'toString', 'offer-sent', '%3Cscript%3E']) {
    assert.equal(noticeFrom(new URL(`${ORIGIN}/roster?notice=${hostile}`), ROSTER_NOTICES), null, hostile);
  }
});

// ---------------------------------------------------------------------------------------------
// actions: sending an offer
// ---------------------------------------------------------------------------------------------

test('proposeOffer converts dollars to cents, emails once and never returns the link or token', async () => {
  const { d1, mail, ctx, ana, request } = await scenario();
  const out = await proposeOffer(ctx, request.id, {
    rosterMemberId: ana,
    role: 'drums',
    payDollars: '150.50',
  });
  assert.equal(get(d1, 'SELECT pay_cents FROM offers WHERE id = ?', out.offerId)!.pay_cents, 15_050);
  assert.equal(out.role, 'Drums');
  assert.equal(out.memberName, 'Ana Reyes');
  assert.equal(out.requestStatus, 'offered');
  assert.equal(out.emailed, true);
  assert.equal(out.expiresAt, NOW + 72 * 3600);
  assert.equal(mail.calls.length, 1);
  const token = tokenIn(mail.calls[0]!.text);
  const serialized = JSON.stringify(out);
  assert.ok(!serialized.includes(token), 'the token must not be in the result');
  assert.ok(!serialized.includes('/worship/offers'), 'no link in the result');
  assert.equal('url' in out, false);
  assert.match(
    mail.calls[0]!.text,
    /https:\/\/gamostudio\.org\/worship\/offers\//,
    'the link points at the public web origin',
  );
  assert.match(mail.calls[0]!.text, /\$150\.50/);
});

test('proposeOffer: payCents (the contract field) wins; invalid pay is refused before anything is written', async () => {
  const { d1, ctx, ana, ben, request } = await scenario();
  const viaCents = await proposeOffer(ctx, request.id, {
    rosterMemberId: ana,
    role: 'Drums',
    payCents: '20000',
    payDollars: '1',
  });
  assert.equal(get(d1, 'SELECT pay_cents FROM offers WHERE id = ?', viaCents.offerId)!.pay_cents, 20_000);
  const before = countOffers(d1);
  for (const pay of [
    { payDollars: '0' },
    { payDollars: '0.00' },
    { payDollars: '' },
    { payDollars: 'free' },
    { payDollars: '-5' },
    { payDollars: '5000.01' },
    { payDollars: '150.999' },
    { payCents: '0' },
    { payCents: '12.5' },
    { payCents: String(MAX_OFFER_CENTS + 1) },
    {},
  ]) {
    await refusedWith(
      proposeOffer(ctx, request.id, { rosterMemberId: ben, role: 'Drums', ...pay }),
      'offer-pay-invalid',
      'offer_request',
    );
  }
  assert.equal(countOffers(d1), before, 'no offer row for refused pay');
  const ok = await proposeOffer(ctx, request.id, { rosterMemberId: ben, role: 'Drums', payDollars: '5000' });
  assert.equal(get(d1, 'SELECT pay_cents FROM offers WHERE id = ?', ok.offerId)!.pay_cents, MAX_OFFER_CENTS);
});

test('proposeOffer refusals: missing member, role not held, role not needed, paused member, unknown ids', async () => {
  const { d1, ctx, ana, ben, cy, request } = await scenario();
  const base = { payDollars: '100' };
  await refusedWith(
    proposeOffer(ctx, request.id, { role: 'Drums', ...base }),
    'offer-member-required',
    'offer_request',
  );
  await refusedWith(
    proposeOffer(ctx, request.id, { rosterMemberId: ben, role: 'Bass', ...base }),
    'offer-role-not-held',
    'offer_request',
  );
  await refusedWith(
    proposeOffer(ctx, request.id, { rosterMemberId: cy, role: 'Keys', ...base }),
    'offer-role-not-needed',
    'offer_request',
  );
  await refusedWith(
    proposeOffer(ctx, 'req_missing', { rosterMemberId: ana, role: 'Drums', ...base }),
    'offer-request-not-found',
    'offer_request',
  );
  await refusedWith(
    proposeOffer(ctx, request.id, { rosterMemberId: 'ros_missing', role: 'Drums', ...base }),
    'offer-member-not-found',
    'offer_request',
  );
  await changeRosterStatus(ctx, ana, 'paused');
  await refusedWith(
    proposeOffer(ctx, request.id, { rosterMemberId: ana, role: 'Drums', ...base }),
    'offer-member-inactive',
    'offer_request',
  );
  assert.equal(countOffers(d1), 0);
});

test('proposeOffer refusals: service already started, duplicate pending, role filled, closed request', async () => {
  const { d1, ctx, ana, ben, request } = await scenario();
  const base = { role: 'Drums', payDollars: '100' };
  await proposeOffer(ctx, request.id, { rosterMemberId: ana, ...base });
  await refusedWith(
    proposeOffer(ctx, request.id, { rosterMemberId: ana, ...base }),
    'offer-duplicate',
    'offer_request',
  );

  // Ben accepts through the public link, filling the role (and closing Ana's pending offer).
  const mail = fakeResend();
  const benOffer = await sendOffer(
    d1,
    ENV,
    {
      requestId: request.id,
      rosterMemberId: ben,
      role: 'Drums',
      payCents: 10_000,
      staffId,
      siteOrigin: 'https://gamostudio.org',
      now: NOW,
    },
    mail.options,
  );
  const url = benOffer.url;
  await respondToOffer(
    d1,
    ENV,
    { token: url.slice(url.lastIndexOf('/') + 1), action: 'accept', now: NOW },
    mail.options,
  );
  await refusedWith(
    proposeOffer(ctx, request.id, { rosterMemberId: ana, ...base }),
    'offer-role-filled',
    'offer_request',
  );

  // Service start: request date 2030-03-24 10:00 America/Phoenix is 17:00 UTC.
  const late = await scenario();
  const started: WorshipCtx = { ...late.ctx, now: Date.parse('2030-03-24T17:00:01Z') / 1000 };
  await refusedWith(
    proposeOffer(started, late.request.id, { rosterMemberId: late.ana, ...base }),
    'offer-service-started',
    'offer_request',
  );

  const closed = await scenario();
  await changeRequestStatus(closed.ctx, closed.request.id, { status: 'cancelled', confirm: 'yes' });
  await refusedWith(
    proposeOffer(closed.ctx, closed.request.id, { rosterMemberId: closed.ana, ...base }),
    'offer-request-closed',
    'offer_request',
  );
});

test('publicWebOrigin uses the configured web origin, else the shared helper', () => {
  assert.equal(
    publicWebOrigin({ PUBLIC_SITE_URL_WEB: 'https://gamostudio.org/' } as never),
    'https://gamostudio.org',
  );
  assert.equal(
    publicWebOrigin({ PUBLIC_SITE_URL_WEB: 'http://127.0.0.1:4321' } as never),
    'http://127.0.0.1:4321',
  );
  assert.equal(
    publicWebOrigin({ PUBLIC_SITE_URL_WEB: 'javascript:alert(1)' } as never),
    'https://gamostudio.org',
  );
  assert.equal(publicWebOrigin({} as never), 'https://gamostudio.org');
});

// ---------------------------------------------------------------------------------------------
// actions: withdraw, roster status, W-9, request status
// ---------------------------------------------------------------------------------------------

test('withdrawPendingOffer revokes, returns the request id, is repeatable and refuses answered offers', async () => {
  const { d1, ctx, ana, ben, request } = await scenario();
  const a = await proposeOffer(ctx, request.id, { rosterMemberId: ana, role: 'Drums', payDollars: '100' });
  const out = await withdrawPendingOffer(ctx, a.offerId);
  assert.deepEqual(out, { offerId: a.offerId, requestId: request.id, status: 'withdrawn' });
  assert.equal(offerStatus(d1, a.offerId), 'withdrawn');
  assert.equal(requestStatus(d1, request.id), 'matching', 'no pending offers left');
  assert.equal((await withdrawPendingOffer(ctx, a.offerId)).status, 'withdrawn', 'repeat is harmless');

  const b = await proposeOffer(ctx, request.id, { rosterMemberId: ben, role: 'Drums', payDollars: '100' });
  run(d1, "UPDATE offers SET status = 'declined', responded_at = 1 WHERE id = ?", b.offerId);
  await refusedWith(withdrawPendingOffer(ctx, b.offerId), 'offer-already-answered', 'request');
  await refusedWith(withdrawPendingOffer(ctx, 'off_missing'), 'offer-not-found', 'request');
});

test('pausing a roster member withdraws their pending offers and reopens the request', async () => {
  const { d1, ctx, ana, request } = await scenario();
  const offer = await proposeOffer(ctx, request.id, {
    rosterMemberId: ana,
    role: 'Drums',
    payDollars: '100',
  });
  assert.equal(requestStatus(d1, request.id), 'offered');
  const out = await changeRosterStatus(ctx, ana, 'paused');
  assert.equal(out.changed, true);
  assert.equal(out.member.status, 'paused');
  assert.equal(offerStatus(d1, offer.offerId), 'withdrawn');
  assert.equal(requestStatus(d1, request.id), 'matching');
  assert.equal((await changeRosterStatus(ctx, ana, 'paused')).changed, false);
  assert.equal((await changeRosterStatus(ctx, ana, 'active')).member.status, 'active');
  await refusedWith(changeRosterStatus(ctx, ana, 'banned'), 'roster-status-invalid', 'roster');
  await refusedWith(changeRosterStatus(ctx, 'ros_missing', 'paused'), 'roster-not-found', 'roster');
});

test('W-9 is a received date only: today, a chosen date, cleared; bad and future dates refused', async () => {
  const { d1, ctx, ana } = await scenario();
  const read = () => get(d1, 'SELECT w9_received_at AS w FROM roster_members WHERE id = ?', ana)!.w;
  assert.equal(read(), null);
  assert.equal((await recordW9(ctx, ana, { date: '' })).w9ReceivedAt, NOW);
  assert.equal(
    (await recordW9(ctx, ana, { date: '2030-03-10' })).w9ReceivedAt,
    Date.parse('2030-03-10T00:00:00Z') / 1000,
  );
  assert.equal(isoDay(read() as number), '2030-03-10');
  assert.equal((await recordW9(ctx, ana, { clear: true })).w9ReceivedAt, null);
  for (const bad of ['2030-02-31', 'yesterday', '03/10/2030', '2031-01-01']) {
    await refusedWith(recordW9(ctx, ana, { date: bad }), 'w9-date-invalid', 'roster');
  }
  assert.equal(read(), null, 'refused dates change nothing');
  const columns = all(d1, 'PRAGMA table_info(roster_members)').map((c) => String(c.name));
  assert.ok(!columns.some((c) => /tax|tin|ssn|ein/i.test(c)), 'no tax identifier column exists');
});

test('request status: matching, completed (from confirmed only), cancelled needs confirmation and withdraws offers', async () => {
  const { d1, ctx, ana, ben, request } = await scenario();
  const offer = await proposeOffer(ctx, request.id, {
    rosterMemberId: ana,
    role: 'Drums',
    payDollars: '100',
  });
  await refusedWith(
    changeRequestStatus(ctx, request.id, { status: 'offered' }),
    'request-status-invalid',
    'request',
  );
  await refusedWith(
    changeRequestStatus(ctx, request.id, { status: 'confirmed' }),
    'request-status-invalid',
    'request',
  );
  await refusedWith(
    changeRequestStatus(ctx, request.id, { status: 'completed' }),
    'request-needs-confirmed',
    'request',
  );
  await refusedWith(
    changeRequestStatus(ctx, request.id, { status: 'cancelled' }),
    'request-cancel-unconfirmed',
    'request',
  );
  await refusedWith(
    changeRequestStatus(ctx, request.id, { status: 'cancelled', confirm: 'no' }),
    'request-cancel-unconfirmed',
    'request',
  );
  assert.equal(offerStatus(d1, offer.offerId), 'pending', 'unconfirmed cancel changed nothing');
  assert.deepEqual(await changeRequestStatus(ctx, request.id, { status: 'matching' }), {
    status: 'matching',
    changed: true,
  });
  const done = await changeRequestStatus(ctx, request.id, { status: 'cancelled', confirm: 'yes' });
  assert.deepEqual(done, { status: 'cancelled', changed: true });
  assert.equal(offerStatus(d1, offer.offerId), 'withdrawn');
  await refusedWith(
    changeRequestStatus(ctx, request.id, { status: 'matching' }),
    'request-closed',
    'request',
  );
  await refusedWith(
    changeRequestStatus(ctx, 'req_missing', { status: 'matching' }),
    'request-not-found',
    'request',
  );

  // A fully accepted request can be completed.
  const fresh = await scenario({ 'request.roles_needed': ['Drums'] });
  const sent = await sendOffer(
    fresh.d1,
    ENV,
    {
      requestId: fresh.request.id,
      rosterMemberId: fresh.ana,
      role: 'Drums',
      payCents: 10_000,
      staffId,
      siteOrigin: 'https://gamostudio.org',
      now: NOW,
    },
    fresh.mail.options,
  );
  await respondToOffer(
    fresh.d1,
    ENV,
    { token: sent.url.slice(sent.url.lastIndexOf('/') + 1), action: 'accept', now: NOW },
    fresh.mail.options,
  );
  assert.equal(requestStatus(fresh.d1, fresh.request.id), 'confirmed');
  assert.deepEqual(await changeRequestStatus(fresh.ctx, fresh.request.id, { status: 'completed' }), {
    status: 'completed',
    changed: true,
  });
  void ben;
});

// ---------------------------------------------------------------------------------------------
// candidates
// ---------------------------------------------------------------------------------------------

test('candidates: role is case-insensitive, only active members, request city first, ordered by name only', async () => {
  const { d1, ctx, ana, ben, dee, request } = await scenario();
  const detail = async () =>
    (await import('../../packages/domain/src/worship/index.ts')).getRequest(d1, request.id);
  const req = (await detail())!;

  const drums = await candidatesForRole(d1, req, 'Drums', { city: 'phoenix' });
  assert.deepEqual(
    drums.candidates.map((c) => c.member.displayName),
    ['Ana Reyes', 'Ben Brooks'],
  );
  const bass = await candidatesForRole(d1, req, 'bass', { city: 'Phoenix' });
  assert.deepEqual(
    bass.candidates.map((c) => c.member.displayName),
    ['Ana Reyes'],
    'Dee holds Bass but lives in Tucson',
  );
  const bassAnywhere = await candidatesForRole(d1, req, 'Bass', { city: 'Phoenix', widenCity: true });
  assert.deepEqual(
    bassAnywhere.candidates.map((c) => c.member.displayName),
    ['Ana Reyes', 'Dee Diaz'],
  );
  const noCity = await candidatesForRole(d1, req, 'Bass', { city: null });
  assert.deepEqual(
    noCity.candidates.map((c) => c.member.id),
    [ana, dee],
  );

  // Money never changes the order: give the last name a big pending offer and an old approval date.
  await proposeOffer(ctx, request.id, { rosterMemberId: ben, role: 'Drums', payDollars: '5000' });
  run(d1, 'UPDATE roster_members SET approved_at = 1 WHERE id = ?', ben);
  const again = await candidatesForRole(d1, (await detail())!, 'Drums', { city: 'Phoenix' });
  assert.deepEqual(
    again.candidates.map((c) => c.member.displayName),
    ['Ana Reyes', 'Ben Brooks'],
  );
  assert.equal(again.candidates[1]!.pendingOfferId !== null, true);
  assert.equal(again.candidates[0]!.pendingOfferId, null);

  await changeRosterStatus(ctx, ana, 'removed');
  const active = await candidatesForRole(d1, (await detail())!, 'Drums', { city: 'Phoenix' });
  assert.deepEqual(
    active.candidates.map((c) => c.member.displayName),
    ['Ben Brooks'],
    'removed members are never candidates',
  );
});

// ---------------------------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------------------------

test('sendOffer JSON: the contract fields only, and not a trace of the token or link', async () => {
  const { d1, mail, admin, ana, request } = await scenario();
  const res = await handleSendOffer(
    admin,
    json({ rosterMemberId: ana, role: 'Drums', payCents: 15_000 }),
    request.id,
    {
      now: NOW,
      mail: mail.options,
    },
  );
  const text = await res.text();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  const body = JSON.parse(text);
  assert.deepEqual(Object.keys(body), ['success', 'data']);
  assert.deepEqual(Object.keys(body.data).sort(), ['expiresAt', 'offerId']);
  assert.equal(body.data.expiresAt, new Date((NOW + 72 * 3600) * 1000).toISOString());
  const token = tokenIn(mail.calls[0]!.text);
  assert.ok(!text.includes(token) && !text.includes('/worship/offers'), 'no token or link in the response');
  assert.equal(get(d1, 'SELECT pay_cents FROM offers WHERE id = ?', body.data.offerId)!.pay_cents, 15_000);
});

test('sendOffer form post: 303 back to the request with a notice; no body, no token in the redirect', async () => {
  const { mail, admin, ana, request } = await scenario();
  const res = await handleSendOffer(
    admin,
    form({ rosterMemberId: ana, role: 'Drums', payDollars: '$150' }),
    request.id,
    { now: NOW, mail: mail.options },
  );
  assert.equal(res.status, 303);
  const location = res.headers.get('Location')!;
  assert.match(location, new RegExp(`^/requests/${request.id}\\?offer=off_[^&]+&notice=offer-sent$`));
  assert.equal(await res.text(), '');
  assert.ok(!location.includes(tokenIn(mail.calls[0]!.text)));
  const key = new URL(location, ORIGIN).searchParams.get('notice')!;
  assert.ok(REQUEST_NOTICES[key], 'the notice key is in the table');
});

test('sendOffer: every refusal is a typed JSON error and a keyed redirect for forms', async () => {
  const { d1, mail, admin, ana, ben, cy, request } = await scenario();
  const deps = { now: NOW, mail: mail.options };
  const cases: Array<[Record<string, unknown>, number, string, string]> = [
    [{ rosterMemberId: ana, role: 'Drums', payDollars: '0' }, 400, 'INVALID_INPUT', 'offer-pay-invalid'],
    [{ rosterMemberId: ben, role: 'Bass', payDollars: '50' }, 400, 'INVALID_INPUT', 'offer-role-not-held'],
    [{ rosterMemberId: cy, role: 'Keys', payDollars: '50' }, 400, 'INVALID_INPUT', 'offer-role-not-needed'],
    [
      { rosterMemberId: 'ros_missing', role: 'Drums', payDollars: '50' },
      404,
      'NOT_FOUND',
      'offer-member-not-found',
    ],
  ];
  for (const [fields, status, code, key] of cases) {
    const j = await handleSendOffer(admin, json(fields), request.id, deps);
    assert.equal(j.status, status, key);
    const body = await j.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, code);
    assert.equal(body.error.message, REQUEST_NOTICES[key]!.text);
    const f = await handleSendOffer(
      admin,
      form(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, String(v)]))),
      request.id,
      deps,
    );
    assert.equal(f.status, 303);
    assert.equal(f.headers.get('Location'), `/requests/${request.id}?notice=${key}`);
  }
  const missing = await handleSendOffer(
    admin,
    json({ rosterMemberId: ana, role: 'Drums', payCents: 100 }),
    'req_missing',
    deps,
  );
  assert.equal(missing.status, 404);
  const weird = await handleSendOffer(
    admin,
    json({ rosterMemberId: ana, role: 'Drums', payCents: 100 }),
    '../../etc',
    deps,
  );
  assert.equal(weird.status, 404);
  assert.equal(countOffers(d1), 0);
  assert.equal(mail.calls.length, 0, 'nothing emailed for refused offers');

  await handleSendOffer(admin, json({ rosterMemberId: ana, role: 'Drums', payCents: 100 }), request.id, deps);
  const dup = await handleSendOffer(
    admin,
    json({ rosterMemberId: ana, role: 'Drums', payCents: 100 }),
    request.id,
    deps,
  );
  assert.equal(dup.status, 409);
  assert.equal((await dup.json()).error.code, 'INVALID_STATE');
});

test('sendOffer reports an undelivered email without exposing anything', async () => {
  const { admin, ana, request } = await scenario();
  const failing = (async () => new Response('nope', { status: 500 })) as typeof fetch;
  const res = await handleSendOffer(
    admin,
    form({ rosterMemberId: ana, role: 'Drums', payDollars: '100' }),
    request.id,
    {
      now: NOW,
      mail: { fetchImpl: failing },
    },
  );
  assert.equal(res.status, 303);
  assert.match(res.headers.get('Location')!, /notice=offer-sent-email-failed$/);
});

test('withdraw: JSON and form answers, unknown and answered offers, hostile ids', async () => {
  const { d1, mail, admin, ctx, ana, ben, request } = await scenario();
  const deps = { now: NOW, mail: mail.options };
  const a = await proposeOffer(ctx, request.id, { rosterMemberId: ana, role: 'Drums', payDollars: '100' });
  const res = await handleWithdrawOffer(admin, json({}), a.offerId, deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, data: { offerId: a.offerId, status: 'withdrawn' } });
  assert.equal(offerStatus(d1, a.offerId), 'withdrawn');
  assert.equal((await handleWithdrawOffer(admin, json({}), a.offerId, deps)).status, 200, 'repeat is 200');

  const b = await proposeOffer(ctx, request.id, { rosterMemberId: ben, role: 'Drums', payDollars: '100' });
  const f = await handleWithdrawOffer(admin, form({}), b.offerId, deps);
  assert.equal(f.status, 303);
  assert.equal(f.headers.get('Location'), `/requests/${request.id}?notice=offer-withdrawn`);

  run(d1, "UPDATE offers SET status = 'accepted', responded_at = 1 WHERE id = ?", b.offerId);
  const answered = await handleWithdrawOffer(admin, json({}), b.offerId, deps);
  assert.equal(answered.status, 409);
  const fAnswered = await handleWithdrawOffer(admin, form({ requestId: request.id }), b.offerId, deps);
  assert.equal(fAnswered.headers.get('Location'), `/requests/${request.id}?notice=offer-already-answered`);
  assert.equal((await handleWithdrawOffer(admin, json({}), 'off_missing', deps)).status, 404);
  assert.equal((await handleWithdrawOffer(admin, json({}), 'a/b', deps)).status, 404);
  const hostile = await handleWithdrawOffer(admin, form({ requestId: '"><script>' }), 'off_missing', deps);
  assert.equal(
    hostile.headers.get('Location'),
    '/requests?notice=offer-not-found',
    'a hostile return id is ignored',
  );
});

test('roster and request page posts: PRG with keyed notices; JSON answers for scripts', async () => {
  const { d1, admin, ana, request } = await scenario();
  const deps = { now: NOW };
  const paused = await handleRosterPost(admin, form({ intent: 'status', status: 'paused' }), ana, deps);
  assert.equal(paused.headers.get('Location'), `/roster/${ana}?notice=status-paused`);
  const same = await handleRosterPost(admin, form({ intent: 'status', status: 'paused' }), ana, deps);
  assert.equal(same.headers.get('Location'), `/roster/${ana}?notice=status-unchanged`);
  const bad = await handleRosterPost(admin, form({ intent: 'status', status: 'zzz' }), ana, deps);
  assert.equal(bad.headers.get('Location'), `/roster/${ana}?notice=roster-status-invalid`);
  const w9 = await handleRosterPost(admin, form({ intent: 'w9', date: '2030-03-01' }), ana, deps);
  assert.equal(w9.headers.get('Location'), `/roster/${ana}?notice=w9-recorded`);
  const cleared = await handleRosterPost(admin, form({ intent: 'w9', clear: '1' }), ana, deps);
  assert.equal(cleared.headers.get('Location'), `/roster/${ana}?notice=w9-cleared`);
  const badDate = await handleRosterPost(admin, form({ intent: 'w9', date: 'nope' }), ana, deps);
  assert.equal(badDate.headers.get('Location'), `/roster/${ana}?notice=w9-date-invalid`);
  const gone = await handleRosterPost(
    admin,
    form({ intent: 'status', status: 'active' }),
    'ros_missing',
    deps,
  );
  assert.equal(gone.headers.get('Location'), '/roster/ros_missing?notice=roster-not-found');
  assert.equal(get(d1, 'SELECT status FROM roster_members WHERE id = ?', ana)!.status, 'paused');

  const noConfirm = await handleRequestPost(admin, form({ status: 'cancelled' }), request.id, deps);
  assert.equal(
    noConfirm.headers.get('Location'),
    `/requests/${request.id}?notice=request-cancel-unconfirmed`,
  );
  const matching = await handleRequestPost(admin, form({ status: 'matching' }), request.id, deps);
  assert.equal(matching.headers.get('Location'), `/requests/${request.id}?notice=status-matching`);
  const cancelled = await handleRequestPost(
    admin,
    form({ status: 'cancelled', confirm: 'yes' }),
    request.id,
    deps,
  );
  assert.equal(cancelled.headers.get('Location'), `/requests/${request.id}?notice=status-cancelled`);
  const asJson = await handleRequestPost(admin, json({ status: 'matching' }), request.id, deps);
  assert.equal(asJson.status, 409, 'a cancelled request cannot change');
  assert.equal((await asJson.json()).error.code, 'INVALID_STATE');
  assert.equal(requestStatus(d1, request.id), 'cancelled');
  for (const response of [paused, same, bad, w9, noConfirm, cancelled]) {
    const key = new URL(response.headers.get('Location')!, ORIGIN).searchParams.get('notice')!;
    assert.ok(ROSTER_NOTICES[key] ?? REQUEST_NOTICES[key], `notice ${key} is declared`);
  }
});

test('malformed or oversized bodies are answered by readBody, not run', async () => {
  const { d1, admin, request } = await scenario();
  const big = await handleSendOffer(
    admin,
    new Request(`${ORIGIN}/x`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ role: 'x'.repeat(300_000) }),
    }),
    request.id,
    { now: NOW },
  );
  assert.equal(big.status, 413);
  const bad = await handleSendOffer(
    admin,
    new Request(`${ORIGIN}/x`, { method: 'POST', headers: JSON_HEADERS, body: '{nope' }),
    request.id,
    { now: NOW },
  );
  assert.equal(bad.status, 400);
  assert.equal(countOffers(d1), 0);
});

// ---------------------------------------------------------------------------------------------
// GET /api/roster
// ---------------------------------------------------------------------------------------------

test('listRoster: contract shape, filters, name order and keyset paging', async () => {
  const { admin, ana, cy } = await scenario();
  const list = async (query = '') => {
    const res = await handleListRoster(admin, new URL(`${ORIGIN}/api/roster${query}`));
    return { status: res.status, body: await res.json(), headers: res.headers };
  };
  const all4 = await list();
  assert.equal(all4.status, 200);
  assert.equal(all4.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(Object.keys(all4.body), ['success', 'data', 'meta']);
  assert.deepEqual(
    all4.body.data.map((m: { displayName: string }) => m.displayName),
    ['Ana Reyes', 'Ben Brooks', 'Cy Chen', 'Dee Diaz'],
  );
  assert.equal(all4.body.meta.nextCursor, null);
  const first = all4.body.data[0];
  assert.deepEqual(Object.keys(first).sort(), [
    'approvedAt',
    'canTeach',
    'city',
    'displayName',
    'email',
    'id',
    'phone',
    'program',
    'roles',
    'status',
    'submissionId',
    'w9ReceivedAt',
  ]);
  assert.equal(first.id, ana);
  assert.equal(first.approvedAt, new Date(NOW * 1000).toISOString());
  assert.equal(first.w9ReceivedAt, null);

  const byRole = await list('?role=KEYS');
  assert.deepEqual(
    byRole.body.data.map((m: { id: string }) => m.id),
    [cy],
  );
  assert.deepEqual(
    (await list('?city=tucson')).body.data.map((m: { displayName: string }) => m.displayName),
    ['Cy Chen', 'Dee Diaz'],
  );
  assert.equal((await list('?status=paused')).body.data.length, 0);
  assert.equal((await list('?program=production')).body.data.length, 0);

  const page1 = await list('?limit=3');
  assert.equal(page1.body.data.length, 3);
  assert.ok(page1.body.meta.nextCursor);
  const page2 = await list(`?limit=3&cursor=${encodeURIComponent(page1.body.meta.nextCursor)}`);
  assert.deepEqual(
    page2.body.data.map((m: { displayName: string }) => m.displayName),
    ['Dee Diaz'],
  );
  assert.equal(page2.body.meta.nextCursor, null);

  for (const bad of ['?status=deleted', '?limit=0', '?limit=101', '?program=web', '?cursor=%25%25%25']) {
    const res = await list(bad);
    assert.equal(res.status, 400, bad);
    assert.equal(res.body.error.code, 'INVALID_INPUT');
  }
});

test('rosterMemberJson carries no more than the contract allows', () => {
  const json = rosterMemberJson({
    id: 'ros_1',
    submissionId: 'sub_1',
    program: 'worship',
    displayName: 'Ana',
    email: 'ana@example.org',
    phone: null,
    roles: ['Drums'],
    city: null,
    canTeach: false,
    status: 'active',
    w9ReceivedAt: 86_400,
    approvedAt: 0,
  });
  assert.equal(json.w9ReceivedAt, '1970-01-02T00:00:00.000Z');
  assert.equal(JSON.stringify(json).includes('pay'), false);
});

// ---------------------------------------------------------------------------------------------
// routes: staff session and same origin
// ---------------------------------------------------------------------------------------------

const SECRET = 'admin-worship-test-session-secret-0123456789';

async function routeSetup() {
  const s = await scenario();
  const db = createDb(s.d1 as never);
  const env = { ENVIRONMENT: 'local', DB: s.d1, SESSION_SECRET: SECRET };
  const identity = new StaffIdentityService(db);
  const staff = await identity.findOrCreateUser('worship-staff@example.org', 'Sample Staff');
  await identity.assignSystemRole(staff.id, 'staff_reviewer');
  const visitor = await identity.findOrCreateUser('visitor@example.org', 'Sample Visitor');
  const cookie = async (userId: string) =>
    `__session=${encodeURIComponent((await createSession(db, userId, SECRET)).cookieValue)}`;
  const ctx = (request: Request, params: Record<string, string> = {}) =>
    ({ request, params, locals: { runtime: { env } } }) as never;
  return { ...s, env, staffCookie: await cookie(staff.id), visitorCookie: await cookie(visitor.id), ctx };
}

const route = (url: string, method: string, headers: Record<string, string>, body?: unknown) =>
  new Request(`${ORIGIN}${url}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

test('routes: no session is 401, a signed-in non-staff user is 403, staff are served', async () => {
  const s = await routeSetup();
  const call = async (cookie: string | null) => {
    const h = (extra: Record<string, string> = {}) => ({ ...(cookie ? { cookie } : {}), ...extra });
    return {
      list: await rosterGet(s.ctx(route('/api/roster', 'GET', h({ accept: 'application/json' })))),
      send: await sendOfferPost(
        s.ctx(
          route(`/api/requests/${s.request.id}/offers`, 'POST', h(JSON_HEADERS), {
            rosterMemberId: s.ana,
            role: 'Drums',
            payCents: 10_000,
          }),
          { id: s.request.id },
        ),
      ),
      withdraw: await withdrawPost(
        s.ctx(route('/api/offers/off_x/withdraw', 'POST', h(JSON_HEADERS), {}), { id: 'off_x' }),
      ),
    };
  };
  const anon = await call(null);
  assert.deepEqual([anon.list.status, anon.send.status, anon.withdraw.status], [401, 401, 401]);
  const visitor = await call(s.visitorCookie);
  assert.deepEqual([visitor.list.status, visitor.send.status, visitor.withdraw.status], [403, 403, 403]);
  assert.equal(countOffers(s.d1), 0, 'no offer without staff');
  const staff = await call(s.staffCookie);
  assert.equal(staff.list.status, 200);
  assert.equal(staff.send.status, 200);
  assert.equal(staff.withdraw.status, 404, 'unknown offer id');
  const body = await staff.send.clone().text();
  assert.ok(!body.includes('/worship/offers'), 'the route never returns the link');
});

test('routes: a cross-origin or cross-site write is refused before anything is read or sent', async () => {
  const s = await routeSetup();
  const attempt = (headers: Record<string, string>) =>
    sendOfferPost(
      s.ctx(
        route(
          `/api/requests/${s.request.id}/offers`,
          'POST',
          { cookie: s.staffCookie, ...JSON_HEADERS, ...headers },
          {
            rosterMemberId: s.ana,
            role: 'Drums',
            payCents: 10_000,
          },
        ),
        { id: s.request.id },
      ),
    );
  const hostile: Array<Record<string, string>> = [
    { origin: 'https://evil.example' },
    { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' },
  ];
  for (const headers of hostile) {
    const res = await attempt(headers);
    assert.equal(res.status, 403, JSON.stringify(headers));
  }
  const withdraw = await withdrawPost(
    s.ctx(
      route(
        '/api/offers/off_x/withdraw',
        'POST',
        { cookie: s.staffCookie, ...JSON_HEADERS, origin: 'https://evil.example' },
        {},
      ),
      {
        id: 'off_x',
      },
    ),
  );
  assert.equal(withdraw.status, 403);
  assert.equal(countOffers(s.d1), 0);
  assert.equal(all(s.d1, "SELECT id FROM email_log WHERE kind LIKE 'offer_%'").length, 0);
});

// ---------------------------------------------------------------------------------------------
// escaping and tokens
// ---------------------------------------------------------------------------------------------

test('hostile names and addresses travel as data: JSON-encoded, never into a redirect or a notice', async () => {
  const { d1, admin, request } = await scenario();
  const evil = '<img src=x onerror=alert(1)>"\'';
  run(
    d1,
    "UPDATE roster_members SET display_name = ?, city = ? WHERE email_normalized = 'ana@example.org'",
    evil,
    evil,
  );
  run(d1, 'UPDATE service_requests SET church_name = ?, address = ? WHERE id = ?', evil, evil, request.id);
  const res = await handleListRoster(admin, new URL(`${ORIGIN}/api/roster?role=Drums`));
  assert.match(res.headers.get('Content-Type') ?? '', /^application\/json/);
  const body = await res.json();
  assert.equal(body.data[0].displayName, evil, 'stored as typed; escaping is the renderer');
  const hostileFilter = parseRosterFilters(new URLSearchParams({ role: evil, city: evil }));
  assert.equal(hostileFilter.values.role, evil.slice(0, 60));
  const rows = (
    await handleListRoster(admin, new URL(`${ORIGIN}/api/roster?role=${encodeURIComponent(evil)}`))
  ).status;
  assert.equal(rows, 200);
  const redirect = await handleRosterPost(admin, form({ intent: 'status', status: evil }), 'ros_x', {
    now: NOW,
  });
  assert.ok(!decodeURIComponent(redirect.headers.get('Location')!).includes('<img'));
  for (const n of [...Object.values(ROSTER_NOTICES), ...Object.values(REQUEST_NOTICES)])
    assert.ok(!/[<>]/.test(n.text));
  assert.equal(formatService('2030-03-24', '10:00'), 'Sunday, March 24, 2030, 10:00 AM');
  assert.equal(shortName('Ana Reyes'), 'Ana R.');
  assert.equal(shortName('Cher'), 'Cher');
  assert.equal(shortName('  María  de la Cruz '), 'María C.');
  assert.match(formatInstant(NOW, 'America/Phoenix'), /MST/);
  assert.match(formatInstant(NOW, 'Not/AZone'), /MST/, 'an unknown zone falls back to the service default');
});

// ---------------------------------------------------------------------------------------------
// sources: pages and components
// ---------------------------------------------------------------------------------------------

const ADMIN = 'apps/admin/src';
function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const OWNED = [
  ...walk(`${ADMIN}/pages/roster`),
  ...walk(`${ADMIN}/pages/requests`),
  ...walk(`${ADMIN}/pages/api/roster`),
  ...walk(`${ADMIN}/pages/api/requests`),
  ...walk(`${ADMIN}/pages/api/offers`),
  ...walk(`${ADMIN}/components/worship`),
  ...walk(`${ADMIN}/lib/worship`),
];
const code = (file: string) =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

test('owned sources exist and the pages are thin, composed screens', () => {
  for (const page of ['roster/index', 'roster/[id]', 'requests/index', 'requests/[id]']) {
    assert.ok(existsSync(`${ADMIN}/pages/${page}.astro`), `missing page ${page}`);
    const lines = readFileSync(`${ADMIN}/pages/${page}.astro`, 'utf8').split('\n').length;
    assert.ok(lines <= 160, `${page} is ${lines} lines: extract components`);
  }
  assert.ok(OWNED.filter((f) => f.includes('/components/worship/')).length >= 6, 'composed from components');
});

test('no raw HTML, scripts, inline handlers, inline styles or raw colours in pages and components', () => {
  for (const file of OWNED.filter((f) => /\.astro$/.test(f))) {
    const src = code(file);
    assert.ok(!/set:html|innerHTML|dangerouslySetInnerHTML/.test(src), `${file} injects raw HTML`);
    assert.ok(!/<script/i.test(src), `${file} has a script`);
    assert.ok(!/\son[a-z]+\s*=/i.test(src), `${file} has an inline event handler`);
    assert.ok(!/\sstyle\s*=/.test(src), `${file} has an inline style`);
    assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(src.replace(/&#\d+;/g, '')), `${file} has a raw colour`);
    assert.ok(!/-\[[^\]]+\]/.test(src), `${file} uses an arbitrary Tailwind value`);
    assert.ok(!/<h1/.test(src), `${file}: the layout renders the only h1`);
    assert.ok(
      !/\b(text|bg|border|ring)-(white|black|red|green|amber|emerald|sky|slate|gray|stone)\b/.test(src),
      `${file} uses a palette colour`,
    );
  }
});

test('the offer link and token are never read, rendered or logged by the owned code', () => {
  for (const file of OWNED) {
    const src = code(file);
    assert.ok(!/\b(sent|offer|result|out)\.url\b/.test(src), `${file} reads an offer link`);
    assert.ok(
      !/offerUrl|tokenHash|token_hash|newOfferToken|hashOfferToken/.test(src),
      `${file} touches token internals`,
    );
    assert.ok(!/console\.(log|info|debug|warn|error)/.test(src), `${file} logs`);
  }
  const actions = code(`${ADMIN}/lib/worship/actions.ts`);
  assert.ok(/const sent = await sendOffer/.test(actions));
  assert.ok(!/sent\.url|\.\.\.sent\b/.test(actions), 'proposeOffer drops the link');
});

test('nothing commercial orders or ranks roster members or requests', () => {
  for (const file of OWNED.filter((f) => /\.(ts|astro)$/.test(f))) {
    const src = code(file);
    assert.ok(
      !/\.sort\(|\.toSorted\(/.test(src),
      `${file} orders rows itself instead of using the domain's name order`,
    );
    assert.ok(
      !/\b(sponsor|sponsorship|donat|rank|ranking|tier|premium|score|rating)\w*/i.test(src),
      `${file} mentions a ranking or commercial factor`,
    );
    const orderBy = src.match(/ORDER BY[^`;]*/g) ?? [];
    if (file.endsWith('lib/worship/queries.ts')) {
      // The only SQL ordering in the owned code is an offer history in time order, never people by pay.
      assert.deepEqual(
        orderBy.map((o) => o.replace(/\s+/g, ' ').trim()),
        ['ORDER BY o.sent_at DESC, o.id LIMIT ?2'],
      );
    } else {
      assert.deepEqual(orderBy, [], `${file} orders rows itself`);
    }
  }
});

test('forms: unique names for repeated buttons, a status Apply button, confirmation for cancel, no JS change handlers', () => {
  const panel = code(`${ADMIN}/components/worship/RoleMatchPanel.astro`);
  assert.ok(
    /Propose \$\{/.test(panel) || /Propose \{/.test(panel),
    'the Propose button names the member and role',
  );
  const requests = walk(`${ADMIN}/components/worship`)
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  assert.ok(/name="confirm"/.test(requests), 'cancel asks for confirmation');
  assert.ok(/Withdraw\b/.test(requests), 'pending offers have a Withdraw button');
  assert.ok(
    /check availability/i.test(requests),
    'availability is not modelled: the panel says to check by contact',
  );
  assert.ok(/Apply/.test(requests), 'status changes use an explicit Apply button');
  assert.ok(!/onchange|oninput/i.test(requests));
});
