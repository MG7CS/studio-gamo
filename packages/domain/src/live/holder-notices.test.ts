import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventPlace, holderChanges, notifyHoldersOfChange } from './holder-notices.ts';
import { PAID_ENV, PAID_NOW, paidTestDatabase, seedPaidEvent } from './paid-testing.ts';

test('a venue change is the one change ticket holders are told about', () => {
  const place = { venueName: 'Grace Hall', address: '1 Main St', city: 'Phoenix', state: 'AZ' };
  assert.deepEqual(holderChanges(place, { ...place, city: 'Mesa' }), ['The venue']);
  assert.deepEqual(holderChanges(place, { ...place, venueName: ' Grace Hall ' }), []);
});

test('the place of an event and the holders emailed after a change; no orders, no emails', async () => {
  const { d1, db } = await paidTestDatabase();
  const seed = seedPaidEvent(d1, { flow: 'gamo_collects' });
  const place = await eventPlace(db, seed.eventId);
  assert.deepEqual(place, {
    organizationId: seed.organizationId,
    admission: 'paid_tickets',
    venueName: 'Grace Hall 1',
    address: '1 Main St',
    city: 'Phoenix',
    state: 'AZ',
  });
  assert.equal(await eventPlace(db, 'evt_missing'), null);
  const none = await notifyHoldersOfChange(db, PAID_ENV, {
    organizationId: seed.organizationId,
    eventId: seed.eventId,
    changes: ['The venue'],
    origin: 'http://127.0.0.1:4324',
    now: PAID_NOW,
  });
  assert.deepEqual(none, { emailed: 0, notEmailed: 0 });
});
