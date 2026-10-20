import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPublishPaidEvent, eventCardSalesAvailable, sellingChecklist } from './paid-event-rules.ts';
import { PAID_ENV, paidTestDatabase, seedPaidEvent, type SeedPaidEventOptions } from './paid-testing.ts';

async function checklist(options: SeedPaidEventOptions, mutate = '') {
  const { d1, db } = await paidTestDatabase();
  seedPaidEvent(d1, options);
  if (mutate) d1.sqlite.exec(mutate);
  return { list: await sellingChecklist(db, PAID_ENV, 'org_1'), db };
}

test('a verified organization with ready payments and accepted terms may publish paid events', async () => {
  const { list, db } = await checklist({ flow: 'organizer_account' });
  assert.equal(list.verified.ok, true);
  assert.equal(list.paymentsReady.ok, true);
  assert.equal(list.paymentsReady.reason, null);
  assert.equal(list.termsAccepted.ok, true);
  assert.equal(list.canPublishPaidEvent, true);
  assert.equal(await canPublishPaidEvent(db, PAID_ENV, 'org_1'), true);
  assert.deepEqual(
    [list.verified.fixPath, list.paymentsReady.fixPath, list.termsAccepted.fixPath],
    ['/organizer/organization', '/organizer/organization/payments', '/organizer/terms'],
  );
});

test('each missing item is named, with the payments reason', async () => {
  const unverified = (await checklist({ flow: 'gamo_collects', verified: false })).list;
  assert.equal(unverified.verified.ok, false);
  assert.equal(unverified.canPublishPaidEvent, false);
  assert.equal(unverified.canSellWithoutCards, false);

  const noMode = (await checklist({})).list;
  assert.equal(noMode.paymentsReady.ok, false);
  assert.equal(noMode.paymentsReady.reason, 'mode_not_chosen');
  assert.equal(noMode.canPublishPaidEvent, false);
  assert.equal(noMode.canSellWithoutCards, true);

  const notReady = (await checklist({ flow: 'organizer_account', accountReady: false })).list;
  assert.equal(notReady.paymentsReady.reason, 'account_not_ready');

  const oldTerms = (
    await checklist({ flow: 'organizer_account' }, "UPDATE terms_acceptances SET version = 'old'")
  ).list;
  assert.equal(oldTerms.termsAccepted.ok, false);
  assert.equal(oldTerms.canPublishPaidEvent, false);

  // A member (not an owner) accepting the terms does not count.
  const member = (await checklist({ flow: 'organizer_account' }, `UPDATE memberships SET role = 'member';`))
    .list;
  assert.equal(member.termsAccepted.ok, false);

  const suspended = (
    await checklist({ flow: 'organizer_account' }, "UPDATE organizations SET status = 'suspended'")
  ).list;
  assert.equal(suspended.canPublishPaidEvent, false);
});

test('card sales for an event follow its organization: closed until a mode is chosen and the account is ready', async () => {
  const closed = await paidTestDatabase();
  const a = seedPaidEvent(closed.d1);
  assert.equal(await eventCardSalesAvailable(closed.db, PAID_ENV, a.eventId), false);
  assert.equal(await eventCardSalesAvailable(closed.db, PAID_ENV, 'evt_missing'), false);
  const open = await paidTestDatabase();
  const b = seedPaidEvent(open.d1, { flow: 'organizer_account' });
  assert.equal(await eventCardSalesAvailable(open.db, PAID_ENV, b.eventId), true);
});
