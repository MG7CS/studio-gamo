/** The event editor's paid section: every error at once, saved with the event, the checklist and fee table (O1). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getOrganizerEvent, readEventTicketing, type EventFormValues } from '../../packages/domain/index.ts';
import { holderChanges } from '../../apps/live/src/lib/organizer-events.ts';
import {
  EMPTY_EVENT,
  EMPTY_TICKETING,
  NOT_VERIFIED_NOTICE,
  REFUND_CHOICES,
  paidEditorView,
  readTicketingForm,
  saveFromForm,
  ticketingErrors,
  ticketingValuesOf,
} from '../../apps/live/src/lib/event-editor.ts';
import { ENV, NOW, formOf, paidSetup } from './live-paid-fixtures.ts';

const dateIn = (days: number) => new Date((NOW + days * 86_400) * 1000).toISOString().slice(0, 10);

function eventForm(values: Partial<EventFormValues>, extra: Record<string, string> = {}): FormData {
  const v: EventFormValues = {
    ...EMPTY_EVENT,
    title: 'Paid Gospel Night',
    description: 'An evening of gospel music and worship for the whole family.',
    venueName: 'Grace Hall',
    city: 'Phoenix',
    state: 'AZ',
    date: dateIn(20),
    admission: 'paid_tickets',
    ...values,
  };
  return formOf({
    ...Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, typeof x === 'boolean' ? (x ? 'yes' : '') : String(x)]),
    ),
    ...extra,
  });
}

test('the refund choices are the offered options only', () => {
  assert.deepEqual(
    REFUND_CHOICES.map((c) => c.value),
    ['none', '24', '48', '72', '168', 'until_start'],
  );
});

test('every problem in the paid section is shown at once, each on its field', () => {
  const errors = ticketingErrors({
    ...EMPTY_TICKETING,
    feePayer: 'nobody',
    refund: '12',
    transferCutoffHours: '500',
    entryNotes: 'x'.repeat(281),
    giftsEnabled: true,
    giftPresets: '0.5, 1, 2, 3, 4',
  });
  assert.deepEqual(Object.keys(errors).sort(), [
    'entryNotes',
    'feePayer',
    'giftPresets',
    'refund',
    'transferCutoffHours',
  ]);
  assert.deepEqual(ticketingErrors(EMPTY_TICKETING), {});
});

test('the form reads back what was saved', () => {
  const typed = readTicketingForm(
    formOf({
      feePayer: 'organizer',
      refund: '72',
      transfersAllowed: 'yes',
      transferCutoffHours: '24',
      reentryAllowed: 'yes',
      entryNotes: 'Doors at 6',
      namesRequired: 'yes',
      giftsEnabled: 'yes',
      giftPresets: '5, 10',
      doorSalesEnabled: 'yes',
    }),
  );
  assert.equal(typed.refund, '72');
  assert.equal(typed.doorSalesEnabled, true);
  assert.deepEqual(ticketingValuesOf(null), EMPTY_TICKETING);
});

test('a paid draft saves its settings with the event; errors keep the event unsaved', async () => {
  const { db, seeded } = await paidSetup();
  const bad = await saveFromForm(db, {
    organizationId: seeded.organizationId,
    form: eventForm({}, { intent: 'draft', feePayer: 'buyer', refund: 'whenever' }),
    now: NOW,
  });
  assert.deepEqual(bad, { kind: 'errors', errors: { refund: 'Choose a refund policy.' } });
  const saved = await saveFromForm(db, {
    organizationId: seeded.organizationId,
    form: eventForm(
      {},
      {
        intent: 'draft',
        feePayer: 'organizer',
        refund: '48',
        transfersAllowed: 'yes',
        transferCutoffHours: '6',
        doorSalesEnabled: 'yes',
      },
    ),
    now: NOW,
  });
  assert.equal(saved.kind, 'saved');
  const t = await readEventTicketing(db, saved.kind === 'saved' ? saved.eventId : '');
  assert.equal(t?.feePayer, 'organizer');
  assert.equal(t?.refundPolicy, 'until_hours_before');
  assert.equal(t?.refundHours, 48);
  assert.equal(t?.transferCutoffHours, 6);
  assert.equal(t?.doorSalesEnabled, true);
});

test('sending a paid event for review needs verification: said in plain words', async () => {
  const { db, seeded } = await paidSetup({ verified: false });
  const out = await saveFromForm(db, {
    organizationId: seeded.organizationId,
    form: eventForm({}, { intent: 'submit', feePayer: 'buyer', refund: 'none' }),
    now: NOW,
  });
  assert.deepEqual(out, { kind: 'errors', errors: {}, notice: NOT_VERIFIED_NOTICE });
});

test('the paid section view: saved settings, a fee row per ticket type, the checklist and the review rule', async () => {
  const { db, seeded } = await paidSetup();
  const view = await paidEditorView(db, ENV, {
    organizationId: seeded.organizationId,
    eventId: seeded.eventId,
    now: NOW,
  });
  assert.equal(view.ticketing.refund, '48');
  assert.deepEqual(
    view.feeRows.map((r) => [r.name, r.passOn.buyerPays, r.absorb.youReceive]),
    [
      ['General', 2000, 2000],
      ['VIP', 5000, 5000],
    ],
  );
  assert.equal(view.checklist.canPublishPaidEvent, true);
  assert.equal(typeof view.paidReviewed, 'boolean');
  const fresh = await paidEditorView(db, ENV, { organizationId: seeded.organizationId, now: NOW });
  assert.deepEqual(fresh.feeRows, []);
  assert.deepEqual(fresh.ticketing, EMPTY_TICKETING);
});

test('a live venue change on a published paid event emails every ticket holder; other edits do not', async () => {
  const { db, seeded, buy } = await paidSetup();
  await buy('ruth@example.org');
  const current = (await getOrganizerEvent(db, seeded.organizationId, seeded.eventId, NOW))!;
  // The seeded event has no description; the editor asks for one.
  current.values.description = 'An evening of gospel music and worship for the whole family.';
  const ticketing = { feePayer: 'buyer', refund: '48', transfersAllowed: 'yes', transferCutoffHours: '0' };
  const notify = { env: ENV, origin: 'https://live.example.org' };
  const same = await saveFromForm(db, {
    organizationId: seeded.organizationId,
    eventId: seeded.eventId,
    form: eventForm(
      { ...current.values, title: 'Gospel Night, renamed' },
      { intent: 'submit', ...ticketing },
    ),
    now: NOW,
    notify,
  });
  assert.equal(same.kind, 'saved', JSON.stringify(same));
  assert.equal(same.kind === 'saved' ? same.holders : 'x', undefined);
  const moved = await saveFromForm(db, {
    organizationId: seeded.organizationId,
    eventId: seeded.eventId,
    form: eventForm({ ...current.values, venueName: 'Grace Annex' }, { intent: 'submit', ...ticketing }),
    now: NOW,
    notify,
  });
  assert.equal(moved.kind, 'saved');
  // This organization publishes directly, so the change is live and the one buyer is told.
  assert.deepEqual(moved.kind === 'saved' ? moved.holders : null, { emailed: 1, notEmailed: 0 });
  assert.deepEqual(holderChanges(current.values, { ...current.values, city: 'Mesa' }), ['The venue']);
  assert.deepEqual(holderChanges(current.values, current.values), []);
});
