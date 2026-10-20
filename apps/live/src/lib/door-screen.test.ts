import assert from 'node:assert/strict';
import { test } from 'node:test';
import { doorListHref, loadDoorScreen, sellHref } from './door-screen';
import { doorOpenDrawer, doorSellCash, doorSellPhone } from './door-sell';
import { NOW, doorFixture } from './door-testing';

const params = (q: string) => new URLSearchParams(q);

test('modes follow the permissions: check-in only, sell only, or both', async () => {
  const fx = await doorFixture();
  const scanner = await loadDoorScreen(fx.deps, fx.staff({ checkIn: true }, 'stf_a'), {
    params: params('mode=sell'),
    now: NOW,
  });
  assert.equal(scanner.mode, 'checkin');
  assert.equal(scanner.modeHrefs.sell, null);
  assert.equal(scanner.sell, null);

  const seller = await loadDoorScreen(fx.deps, fx.staff({ sell: true }, 'stf_b'), {
    params: params(''),
    now: NOW,
  });
  assert.equal(seller.mode, 'sell');
  assert.equal(seller.modeHrefs.checkin, null);

  const org = await loadDoorScreen(fx.deps, fx.organizer, { params: params('mode=sell'), now: NOW });
  assert.equal(org.mode, 'sell');
  assert.ok(org.modeHrefs.checkin && org.modeHrefs.sell);
  assert.equal(org.checkIn.window.title, 'Check-in is open');
});

test('sell card: types with what the door can sell, steppers in the address, server quote', async () => {
  const fx = await doorFixture();
  const base = fx.organizer.basePath;
  const view = await loadDoorScreen(fx.deps, fx.organizer, {
    params: params(`mode=sell&sel=${fx.seed.generalTypeId}:2,${fx.seed.vipTypeId}:9&pay=cash`),
    now: NOW,
  });
  const sell = view.sell!;
  assert.equal(sell.closedReason, null);
  const general = sell.types.find((t) => t.id === fx.seed.generalTypeId)!;
  const vip = sell.types.find((t) => t.id === fx.seed.vipTypeId)!;
  assert.equal(general.quantity, 2);
  assert.equal(general.price, '$20.00');
  // VIP: 4 per order at most, and only 2 held for the door: the selection is held to what the door can sell.
  assert.equal(vip.left, 2);
  assert.equal(vip.quantity, 2);
  assert.equal(vip.plusHref, null);
  assert.equal(
    general.plusHref,
    sellHref(
      base,
      new Map([
        [fx.seed.generalTypeId, 3],
        [fx.seed.vipTypeId, 2],
      ]),
      'cash',
    ),
  );
  assert.equal(sell.pay, 'cash');
  assert.equal(sell.quote?.totalCents, 4000 + 10_000);

  const ok = await loadDoorScreen(fx.deps, fx.organizer, {
    params: params(`mode=sell&sel=${fx.seed.generalTypeId}:2`),
    now: NOW,
  });
  assert.equal(ok.sell!.quote!.totalCents, 4000);
  assert.equal(ok.sell!.cardAvailable, true);
  assert.equal(ok.testMode.show, true);
});

test('door sales switched off: the sell card says why', async () => {
  const fx = await doorFixture({ doorSalesEnabled: false });
  const view = await loadDoorScreen(fx.deps, fx.organizer, { params: params('mode=sell'), now: NOW });
  assert.match(view.sell!.closedReason ?? '', /switched off/);
});

test('a cash sale result shows the change due; a waiting phone sale shows its QR and refreshes', async () => {
  const fx = await doorFixture();
  await doorOpenDrawer(fx.deps, fx.organizer, { float: '0', now: NOW });
  const cash = await doorSellCash(fx.deps, fx.organizer, {
    selection: new Map([[fx.seed.generalTypeId, 1]]),
    received: '50',
    email: '',
    now: NOW,
  });
  const done = await loadDoorScreen(fx.deps, fx.organizer, {
    params: params(`mode=sell&sale=${cash.orderId}`),
    now: NOW,
  });
  assert.equal(done.sale?.state, 'paid');
  assert.equal(done.sale?.changeDue, '$30.00');
  assert.equal(done.sale?.admitted, 1);
  assert.equal(done.refreshSeconds, null);
  assert.equal(done.recentSales.length, 1);

  const phone = await doorSellPhone(fx.deps, fx.organizer, {
    selection: new Map([[fx.seed.generalTypeId, 1]]),
    email: '',
    eventSlug: 'gospel-night-1',
    now: NOW,
  });
  const waiting = await loadDoorScreen(fx.deps, fx.organizer, {
    params: params(`mode=sell&sale=${phone.orderId}`),
    now: NOW + 5,
  });
  assert.equal(waiting.sale?.state, 'pending');
  assert.match(waiting.sale?.qr ?? '', /<svg/);
  assert.equal(waiting.sale?.canCancel, true);
  assert.equal(waiting.refreshSeconds, 4);
});

test('a sale of another organization is not shown', async () => {
  const fx = await doorFixture();
  const view = await loadDoorScreen(fx.deps, fx.organizer, {
    params: params('mode=sell&sale=ord_other'),
    now: NOW,
  });
  assert.equal(view.sale, null);
});

test('door-day totals: organizers get the list behind each number, staff only the number', async () => {
  const fx = await doorFixture();
  const org = await loadDoorScreen(fx.deps, fx.organizer, { params: params(''), now: NOW });
  const cash = org.totals.find((t) => t.key === 'doorCash')!;
  assert.equal(cash.href, doorListHref(fx.seed.occurrenceId, 'doorCash'));
  assert.match(cash.href ?? '', /channel=door&method=cash/);
  assert.equal(org.countsHref, doorListHref(fx.seed.occurrenceId, 'checkedIn'));
  const staff = await loadDoorScreen(fx.deps, fx.staff({ checkIn: true }), { params: params(''), now: NOW });
  assert.ok(staff.totals.every((t) => t.href === null));
  assert.equal(staff.countsHref, null);
});
