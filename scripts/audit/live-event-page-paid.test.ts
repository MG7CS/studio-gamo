/** A paid event's Overview: door-day totals, tab counts and the preview checkout (O10). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listDoorTickets, parseDoorFilter, standinCompleteCheckout } from '../../packages/domain/index.ts';
import {
  doorDayOccurrence,
  doorTotalsView,
  eventTabCounts,
  listPreviewOrders,
  paidOverviewView,
  startPreviewCheckout,
  voidPreview,
} from '../../apps/live/src/lib/event-page.ts';
import { ENV, NOW, formOf, paidSetup } from './live-paid-fixtures.ts';

const ORIGIN = 'https://live.example.org';

test('the door-day card counts the chosen date, else today’s or the next, else the last', () => {
  const dates = [
    { id: 'a', startsAt: NOW - 3 * 86_400, endsAt: null, canceled: false },
    { id: 'b', startsAt: NOW - 3600, endsAt: NOW + 3600, canceled: false },
    { id: 'c', startsAt: NOW + 86_400, endsAt: null, canceled: true },
    { id: 'd', startsAt: NOW + 2 * 86_400, endsAt: null, canceled: false },
  ];
  assert.equal(doorDayOccurrence(dates, ['d'], NOW), 'd');
  assert.equal(doorDayOccurrence(dates, [], NOW), 'b');
  assert.equal(doorDayOccurrence(dates.slice(0, 1), [], NOW), 'a');
  assert.equal(doorDayOccurrence([], [], NOW), null);
});

test('each door-day number equals the length of the ticket list its link opens', async () => {
  const { db, seeded, buy, comp } = await paidSetup();
  await buy('ruth@example.org', 2);
  await comp(1);
  const items = await doorTotalsView(db, {
    organizationId: seeded.organizationId,
    eventId: seeded.eventId,
    occurrenceId: seeded.occurrenceId,
  });
  assert.equal(items.find((i) => i.key === 'soldOnline')?.value, 3);
  for (const item of items) {
    const params = new URL(item.href, ORIGIN).searchParams;
    assert.ok(item.href.startsWith(`/organizer/door/${seeded.occurrenceId}/list?`));
    const rows = await listDoorTickets(db, {
      organizationId: seeded.organizationId,
      occurrenceId: seeded.occurrenceId,
      filter: parseDoorFilter(params),
    });
    assert.equal(item.value, rows.length, item.label);
  }
});

test('the paid Overview: door totals, paid orders to refund on cancel, door sales flag; tab counts', async () => {
  const { db, seeded, buy } = await paidSetup();
  await buy('ruth@example.org');
  const event = {
    id: seeded.eventId,
    occurrences: [{ id: seeded.occurrenceId, startsAt: NOW + 30 * 86_400, endsAt: null, canceled: false }],
  };
  const view = await paidOverviewView(db, {
    organizationId: seeded.organizationId,
    event: event as never,
    selectedIds: [],
    now: NOW,
  });
  assert.equal(view.occurrenceId, seeded.occurrenceId);
  assert.equal(view.paidOrders, 1);
  assert.equal(view.doorSales, true);
  assert.deepEqual(
    await eventTabCounts(db, {
      organizationId: seeded.organizationId,
      eventId: seeded.eventId,
      admission: 'paid_tickets',
      now: NOW,
    }),
    { tickets: 2, orders: 1 },
  );
  assert.deepEqual(
    await eventTabCounts(db, {
      organizationId: seeded.organizationId,
      eventId: seeded.eventId,
      admission: 'external_tickets',
      now: NOW,
    }),
    {},
  );
});

test('preview checkout: refused with the reason when card sales are unavailable', async () => {
  const { db, seeded } = await paidSetup({ flow: undefined });
  const out = await startPreviewCheckout({
    db,
    env: ENV,
    organizationId: seeded.organizationId,
    event: {
      id: seeded.eventId,
      title: 'Gospel Night 1',
      status: 'draft',
      occurrences: [{ id: seeded.occurrenceId }],
    },
    buyer: { name: 'Owner One', email: 'owner1@example.org' },
    form: formOf({ occurrence: seeded.occurrenceId, [`qty_${seeded.generalTypeId}`]: '1' }),
    origin: ORIGIN,
    now: NOW,
  });
  assert.equal(out.kind, 'error');
  assert.match(out.kind === 'error' ? out.notice : '', /not available yet: Waiting for Gamo/);
});

test('preview checkout: fields checked, a preview order placed through the same checkout, listed, then voided', async () => {
  const { db, seeded } = await paidSetup();
  const base = {
    db,
    env: ENV,
    organizationId: seeded.organizationId,
    event: {
      id: seeded.eventId,
      title: 'Gospel Night 1',
      status: 'published',
      occurrences: [{ id: seeded.occurrenceId }],
    },
    buyer: { name: 'Owner One', email: 'owner1@example.org' },
    origin: ORIGIN,
    now: NOW,
  };
  const empty = await startPreviewCheckout({ ...base, form: formOf({}) });
  assert.deepEqual(Object.keys(empty.kind === 'error' ? (empty.fields ?? {}) : {}).sort(), [
    'occurrence',
    'quantities',
  ]);
  const canceled = await startPreviewCheckout({
    ...base,
    event: { ...base.event, status: 'canceled' },
    form: formOf({}),
  });
  assert.equal(canceled.kind, 'error');
  const started = await startPreviewCheckout({
    ...base,
    form: formOf({ occurrence: seeded.occurrenceId, [`qty_${seeded.generalTypeId}`]: '2' }),
  });
  assert.equal(started.kind, 'redirect');
  const sessionId = new URL(started.kind === 'redirect' ? started.url : '', ORIGIN).pathname
    .split('/')
    .pop()!;
  await standinCompleteCheckout(db, ENV, sessionId, 'paid', NOW);
  const previews = await listPreviewOrders(db, ENV, {
    organizationId: seeded.organizationId,
    eventId: seeded.eventId,
  });
  assert.equal(previews.length, 1);
  assert.equal(previews[0].status, 'paid');
  assert.match(previews[0].orderPath ?? '', /^\/orders\//);
  assert.deepEqual(
    await voidPreview({
      db,
      env: ENV,
      organizationId: seeded.organizationId,
      orderId: previews[0].id,
      now: NOW,
    }),
    { kind: 'done', flash: 'voided' },
  );
  assert.equal(
    (await listPreviewOrders(db, ENV, { organizationId: seeded.organizationId, eventId: seeded.eventId }))
      .length,
    0,
  );
  const again = await voidPreview({
    db,
    env: ENV,
    organizationId: seeded.organizationId,
    orderId: previews[0].id,
    now: NOW,
  });
  assert.equal(again.kind, 'error');
});
