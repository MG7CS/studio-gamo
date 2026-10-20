import { test } from 'node:test';
import assert from 'node:assert/strict';
import { admissionLabel, eventStateLabel, seatsLabel } from './labels.ts';

test('admission is worded the same everywhere', () => {
  assert.equal(admissionLabel({ admission: 'free_open', externalTicketProvider: null }), 'Free');
  assert.equal(
    admissionLabel({ admission: 'free_registration', externalTicketProvider: null }),
    'Free · register',
  );
  assert.equal(
    admissionLabel({ admission: 'external_tickets', externalTicketProvider: 'Eventbrite' }),
    'Tickets at Eventbrite',
  );
  assert.equal(
    admissionLabel({ admission: 'external_tickets', externalTicketProvider: null }),
    'Tickets elsewhere',
  );
});

test('state badge: canceled wins over past, upcoming has none', () => {
  assert.equal(eventStateLabel({ status: 'canceled', isPast: true }), 'Canceled');
  assert.equal(eventStateLabel({ status: 'approved', isPast: true }), 'Past');
  assert.equal(eventStateLabel({ status: 'approved', isPast: false }), null);
});

test('seats are counted only for registration events with a capacity', () => {
  const base = { admission: 'free_registration' as const, capacity: 10, seatsTaken: 7 };
  assert.equal(seatsLabel(base), '3 seats left');
  assert.equal(seatsLabel({ ...base, seatsTaken: 9 }), '1 seat left');
  assert.equal(seatsLabel({ ...base, seatsTaken: 12 }), 'Full');
  assert.equal(seatsLabel({ ...base, capacity: null }), null);
  assert.equal(seatsLabel({ ...base, admission: 'free_open' as never }), null);
});
