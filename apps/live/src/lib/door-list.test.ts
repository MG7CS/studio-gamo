import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DOOR_TOTAL_FILTERS, doorFilterQuery, doorTotals } from '@gamo/domain';
import { doorListTitle, loadDoorList } from './door-list';
import { doorOpenDrawer, doorSellCash } from './door-sell';
import { NOW, doorFixture } from './door-testing';

test('each door-day number opens a list of exactly that many tickets', async () => {
  const fx = await doorFixture();
  await doorOpenDrawer(fx.deps, fx.organizer, { float: '0', now: NOW });
  await doorSellCash(fx.deps, fx.organizer, {
    selection: new Map([[fx.seed.generalTypeId, 2]]),
    received: '40',
    email: '',
    now: NOW,
  });
  const totals = await doorTotals(fx.db, {
    organizationId: fx.seed.organizationId,
    occurrenceId: fx.seed.occurrenceId,
  });
  for (const key of Object.keys(DOOR_TOTAL_FILTERS) as Array<keyof typeof DOOR_TOTAL_FILTERS>) {
    const list = await loadDoorList(
      fx.db,
      fx.organizer,
      new URLSearchParams(doorFilterQuery(DOOR_TOTAL_FILTERS[key])),
    );
    assert.equal(list.rows.length, totals[key], key);
  }
  const cash = await loadDoorList(fx.db, fx.organizer, new URLSearchParams('channel=door&method=cash'));
  assert.equal(cash.title, 'Sold at the door: cash');
  assert.equal(cash.rows[0].method, 'Door · Cash');
  assert.ok(cash.rows[0].checkedIn);
  assert.match(cash.rows[0].orderHref, new RegExp(`^/organizer/events/${fx.seed.eventId}/orders/ord_`));
});

test('a filter that is not a door-day number is titled plainly', () => {
  assert.equal(doorListTitle({ channel: 'online', arrival: 'checked_in' }), 'Tickets');
  assert.equal(doorListTitle({ arrival: 'to_arrive' }), 'Still to arrive');
});
