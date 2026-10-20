/** The sales summary (O5) and the Organization area's Payments tab (O8). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { organizationPaymentsStatus } from '../../packages/domain/index.ts';
import { doorLines, runReconcile, salesLines, salesPageView } from '../../apps/live/src/lib/sales-page.ts';
import {
  modeWording,
  paymentsPageView,
  readinessWording,
  redirectOrigin,
  runPaymentsAction,
  statementMonth,
} from '../../apps/live/src/lib/payments-page.ts';
import { ENV, NOW, paidSetup } from './live-paid-fixtures.ts';

test('the sales summary comes from the ledger, per event and per date', async () => {
  const { db, seeded, buy, comp } = await paidSetup();
  await buy('ruth@example.org', 2);
  await comp(1);
  const view = await salesPageView(db, { organizationId: seeded.organizationId, eventId: seeded.eventId });
  assert.equal(view.total.ticketsSold, 3);
  assert.equal(view.total.ticketSalesCents, 4000);
  assert.equal(view.byDate.length, 1);
  const lines = salesLines(view.total);
  assert.deepEqual(
    lines.map((l) => l.label),
    ['Ticket prices', 'Discounts', 'Ticket sales'],
  );
  assert.deepEqual(doorLines(view.total), []);
  await assert.rejects(salesPageView(db, { organizationId: 'org_other', eventId: seeded.eventId }));
});

test('the check against the processor: owners only; card orders matched through the stand-in', async () => {
  const { db, seeded, buy } = await paidSetup();
  await buy('ruth@example.org', 1);
  const input = { db, env: ENV, organizationId: seeded.organizationId, eventId: seeded.eventId, now: NOW };
  assert.equal((await runReconcile({ ...input, isOwner: false })).kind, 'error');
  const r = await runReconcile({ ...input, isOwner: true });
  assert.equal(r.kind, 'done');
  assert.equal(r.kind === 'done' ? r.lines.length : 0, 1);
  assert.equal(r.kind === 'done' ? r.lines[0].status : '', 'matched');
  const none = await runReconcile({ ...input, env: { ENVIRONMENT: 'local' }, isOwner: true });
  assert.match(none.kind === 'error' ? none.notice : '', /not set up here/);
});

test('payments wording: the mode, the seller and readiness in plain words, never escrow', () => {
  assert.equal(modeWording('organizer_account', 'Grace').seller, 'Grace');
  assert.equal(modeWording('gamo_collects', 'Grace').seller, 'Gamo Studios on behalf of Grace');
  assert.equal(modeWording(null, 'Grace').seller, null);
  for (const flow of ['organizer_account', 'gamo_collects', null] as const)
    assert.doesNotMatch(JSON.stringify(modeWording(flow, 'Grace')), /escrow/i);
  assert.equal(readinessWording(null, 'organizer_account', 0).ready, true);
  assert.equal(readinessWording('account_missing', 'gamo_collects', 0).canConnect, true);
  assert.match(readinessWording('account_not_ready', 'organizer_account', 2).text, /2 details/);
  assert.equal(readinessWording('mode_not_chosen', null, 0).canConnect, false);
});

test('statement months: default the current month, never the future, with neighbours', () => {
  const now = Date.UTC(2026, 9, 19, 18) / 1000;
  const m = statementMonth(null, now, 'America/Phoenix');
  assert.equal(m.month, '2026-10');
  assert.equal(m.previous, '2026-09');
  assert.equal(m.next, null);
  assert.equal(statementMonth('2027-01', now, 'America/Phoenix').month, '2026-10');
  const past = statementMonth('2025-12', now, 'America/Phoenix');
  assert.equal(past.next, '2026-01');
  assert.ok(past.to > past.from);
});

test('Mode B: payouts and the statement are shown; connecting starts Stripe onboarding (stand-in)', async () => {
  const { d1, db, seeded } = await paidSetup({ flow: 'gamo_collects' });
  // No payout account yet: connecting creates one at the stand-in.
  d1.sqlite.exec('DELETE FROM organization_payments');
  const view = await paymentsPageView(db, ENV, {
    organizationId: seeded.organizationId,
    organizationName: 'Grace Church 1',
    month: null,
    timeZone: 'America/Phoenix',
    now: NOW,
  });
  assert.equal(view.status.flow, 'gamo_collects');
  assert.deepEqual(view.payouts, []);
  assert.ok(view.statement);
  assert.equal(view.readiness.canConnect, true);
  assert.equal(view.standin, true);
  const connect = await runPaymentsAction({
    db,
    env: ENV,
    organizationId: seeded.organizationId,
    action: 'connect',
    origin: 'https://live.example.org',
    now: NOW,
  });
  assert.equal(connect.kind, 'redirect');
  const check = await runPaymentsAction({
    db,
    env: ENV,
    organizationId: seeded.organizationId,
    action: 'returned',
    origin: 'https://live.example.org',
    now: NOW,
  });
  assert.deepEqual(check, { kind: 'done', flash: 'returned' });
  assert.equal((await organizationPaymentsStatus(db, ENV, seeded.organizationId)).flow, 'gamo_collects');
});

test('connecting before Gamo chose a mode says so; redirects allow only an outside https origin', async () => {
  const { db, seeded } = await paidSetup({ flow: undefined });
  const out = await runPaymentsAction({
    db,
    env: ENV,
    organizationId: seeded.organizationId,
    action: 'connect',
    origin: 'https://live.example.org',
    now: NOW,
  });
  assert.match(out.kind === 'error' ? out.notice : '', /not chosen how payments flow/);
  assert.equal(
    redirectOrigin('https://connect.stripe.com/setup/abc', 'https://live.example.org'),
    'https://connect.stripe.com',
  );
  assert.equal(redirectOrigin('/dev/stripe/onboard/acct_1', 'https://live.example.org'), null);
  assert.equal(redirectOrigin('http://evil.test/', 'https://live.example.org'), null);
});
