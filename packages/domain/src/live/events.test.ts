import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createSqliteD1 } from '@gamo/db/testing';
import {
  cancelEvent,
  countWaitingEvents,
  WAITING_FILTER,
  cancelOccurrence,
  checkInWindow,
  setCheckInOpen,
  deleteUnpublishedEvent,
  cancelRegistrationForOrganizer,
  checkInForOrganizer,
  getCheckInOccurrence,
  csvCell,
  expandOccurrences,
  getOrganizerEvent,
  listEventRegistrations,
  listOrganizationSchedule,
  listOrganizerEvents,
  registrationsCsv,
  reviewRuleFor,
  saveEvent,
  submitEvent,
  validateEvent,
  type EventFormValues,
} from './events.ts';
import { OrganizerError } from './organizers.ts';
import {
  LiveAdminError,
  listPendingEvents,
  listPublishedOrganizerEvents,
  paidEventReviewDetails,
  reviewLiveEvent,
  setOrganizerEventHidden,
} from './admin.ts';
import { PaidError } from './paid-types.ts';
import { PAID_NOW, paidTestDatabase, seedPaidEvent, type SeedPaidEventOptions } from './paid-testing.ts';
import {
  confirmRegistration,
  normalizeCheckinCode,
  releaseExpiredHolds,
  startRegistration,
} from './registration.ts';

const MIGRATIONS = new URL('../../../db/live/migrations/', import.meta.url);
const NOW = Date.UTC(2026, 9, 20) / 1000;
const ENV = { ENVIRONMENT: 'local' };

const FORM: EventFormValues = {
  title: 'Sunday Worship Night',
  category: 'worship',
  description: 'An evening of worship, prayer and fellowship for the whole family.',
  performers: 'Maria Lopez | Worship leader\nGrace Choir',
  venueName: 'Grace Fellowship',
  address: '100 Main St',
  city: 'Phoenix',
  state: 'az',
  timezone: 'America/Phoenix',
  schedule: 'once',
  date: '2026-11-15',
  startTime: '18:30',
  endTime: '20:00',
  until: '',
  admission: 'free_registration',
  externalUrl: '',
  priceText: '',
  refundPolicyText: '',
  capacity: '10',
  maxPartySize: '4',
  qrCheckin: false,
  checkinOpensHours: '3',
};

async function database() {
  const d1 = createSqliteD1();
  for (const name of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await d1.exec(readFileSync(new URL(name, MIGRATIONS), 'utf8'));
  d1.sqlite.exec(
    `INSERT INTO organizations (id, name, slug, kind) VALUES ('org_1', 'Grace', 'grace', 'church'), ('org_2', 'Other', 'other', 'church')`,
  );
  return { d1, db: d1 as never };
}

const codeOf = (e: unknown) =>
  e instanceof OrganizerError ? `${e.code}${e.field ? `:${e.field}` : ''}` : String(e);
const invalid = (patch: Partial<EventFormValues>) => {
  try {
    validateEvent({ ...FORM, ...patch });
    return 'accepted';
  } catch (e) {
    return codeOf(e);
  }
};

test('the event form is validated field by field', () => {
  assert.equal(validateEvent(FORM).state, 'AZ');
  assert.deepEqual(validateEvent(FORM).performers, [
    { name: 'Maria Lopez', role: 'Worship leader' },
    { name: 'Grace Choir', role: null },
  ]);
  assert.equal(invalid({ title: 'ab' }), 'invalid:title');
  assert.equal(invalid({ category: 'party' }), 'invalid:category');
  assert.equal(invalid({ description: 'short' }), 'invalid:description');
  assert.equal(invalid({ date: '2026-02-30' }), 'invalid:date');
  assert.equal(invalid({ startTime: '25:00' }), 'invalid:startTime');
  assert.equal(invalid({ endTime: '18:30' }), 'invalid:endTime');
  assert.equal(invalid({ timezone: 'Mars/Base' }), 'invalid:timezone');
  assert.equal(
    invalid({ admission: 'external_tickets', externalUrl: 'http://tickets.example.org' }),
    'invalid:externalUrl',
  );
  assert.equal(
    invalid({ admission: 'external_tickets', externalUrl: 'https://tickets.example.org/x' }),
    'accepted',
  );
  assert.equal(invalid({ admission: 'free_open', qrCheckin: true }), 'invalid:qrCheckin');
  assert.equal(invalid({ capacity: '0' }), 'invalid:capacity');
  assert.equal(invalid({ maxPartySize: '21' }), 'invalid:maxPartySize');
  assert.equal(invalid({ schedule: 'weekly', until: '' }), 'invalid:until');
  assert.equal(
    invalid({ schedule: 'weekly', date: '2026-11-15', until: '2028-11-15' }),
    'invalid:until',
    'more than 52 dates',
  );
  assert.equal(
    validateEvent({ ...FORM, admission: 'free_open', capacity: '50' }).capacity,
    null,
    'capacity only counts for registration events',
  );
});

test('weekly series keep the local start time across daylight-time changes; monthly clamps short months', () => {
  const weekly = expandOccurrences({
    schedule: 'weekly',
    date: '2026-10-25',
    startTime: '19:00',
    endTime: null,
    until: '2026-11-15',
    timezone: 'America/Los_Angeles',
  });
  assert.equal(weekly.length, 4);
  assert.equal(weekly[0].startsAt, Date.UTC(2026, 9, 26, 2, 0) / 1000, 'PDT is UTC-7');
  assert.equal(
    weekly[1].startsAt,
    Date.UTC(2026, 10, 2, 3, 0) / 1000,
    'after the change PST is UTC-8, still 19:00 local',
  );
  const monthly = expandOccurrences({
    schedule: 'monthly',
    date: '2026-01-31',
    startTime: '10:00',
    endTime: null,
    until: '2026-04-30',
    timezone: 'America/Phoenix',
  });
  assert.deepEqual(
    monthly.map((o) => new Date(o.startsAt * 1000).toISOString().slice(0, 10)),
    ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'],
  );
  const once = expandOccurrences({
    schedule: 'once',
    date: '2026-11-15',
    startTime: '18:30',
    endTime: '20:00',
    until: null,
    timezone: 'America/Phoenix',
  });
  assert.equal(once.length, 1);
  assert.equal(once[0].endsAt! - once[0].startsAt, 90 * 60);
});

test('the review rule decides between draft, review and publishing', async () => {
  const { d1, db } = await database();
  assert.equal(await reviewRuleFor(db, 'org_1'), 'first_event');
  const draft = await saveEvent(db, { organizationId: 'org_1', input: FORM, submit: false, now: NOW });
  assert.equal(draft.status, 'draft');
  assert.equal(
    await submitEvent(db, { organizationId: 'org_1', eventId: draft.eventId, now: NOW }),
    'pending_review',
  );
  d1.sqlite.exec("UPDATE organizations SET first_event_approved_at = 1 WHERE id = 'org_1'");
  assert.equal(await reviewRuleFor(db, 'org_1'), 'none');
  const direct = await saveEvent(db, {
    organizationId: 'org_1',
    input: { ...FORM, title: 'Second night' },
    submit: true,
    now: NOW,
  });
  assert.equal(direct.status, 'published');
  d1.sqlite.exec("UPDATE organizations SET review_every_event = 1 WHERE id = 'org_1'");
  assert.equal(await reviewRuleFor(db, 'org_1'), 'every_event');
  const again = await saveEvent(db, {
    organizationId: 'org_1',
    input: { ...FORM, title: 'Third night' },
    submit: true,
    now: NOW,
  });
  assert.equal(again.status, 'pending_review');
});

test('the "waiting" list filter shows events in review or needing changes, and nothing else', async () => {
  const { d1, db } = await database();
  const draft = await saveEvent(db, { organizationId: 'org_1', input: FORM, submit: false, now: NOW });
  const review = await saveEvent(db, {
    organizationId: 'org_1',
    input: { ...FORM, title: 'In review night' },
    submit: true,
    now: NOW,
  });
  const changes = await saveEvent(db, {
    organizationId: 'org_1',
    input: { ...FORM, title: 'Needs changes night' },
    submit: true,
    now: NOW,
  });
  d1.sqlite.exec(`UPDATE events SET status = 'changes_requested' WHERE id = '${changes.eventId}'`);
  const other = await saveEvent(db, {
    organizationId: 'org_2',
    input: { ...FORM, title: 'Other organization night' },
    submit: true,
    now: NOW,
  });
  assert.equal(draft.status, 'draft');
  assert.equal(review.status, 'pending_review');
  assert.equal(other.status, 'pending_review');
  const waiting = await listOrganizerEvents(db, 'org_1', { status: WAITING_FILTER }, NOW);
  assert.deepEqual(waiting.map((e) => e.id).sort(), [review.eventId, changes.eventId].sort());
  assert.equal((await listOrganizerEvents(db, 'org_1', {}, NOW)).length, 3, 'no filter lists everything');
  assert.equal(countWaitingEvents({ pending_review: 1, changes_requested: 2, published: 5 }), 3);
  assert.equal(countWaitingEvents({}), 0);
});

test('editing a published event goes back to review when the rule asks for it; other organizations cannot touch it', async () => {
  const { d1, db } = await database();
  d1.sqlite.exec("UPDATE organizations SET first_event_approved_at = 1 WHERE id = 'org_1'");
  const created = await saveEvent(db, { organizationId: 'org_1', input: FORM, submit: true, now: NOW });
  assert.equal(created.status, 'published');
  const edit = (title: string, org = 'org_1', patch: Partial<EventFormValues> = {}) =>
    saveEvent(db, {
      organizationId: org,
      eventId: created.eventId,
      input: { ...FORM, title, ...patch },
      submit: false,
      now: NOW + 1,
    });
  assert.equal((await edit('Renamed')).status, 'published');
  await assert.rejects(edit('Hijack', 'org_2'), (e) => codeOf(e) === 'not_found');
  d1.sqlite.exec("UPDATE organizations SET review_every_event = 1 WHERE id = 'org_1'");
  assert.equal((await edit('Reworded')).status, 'published', 'wording alone never goes back to review');
  assert.equal(
    (await edit('Reworded', 'org_1', { startTime: '19:00' })).status,
    'published',
    'a new time waits for review but the event stays published',
  );
  assert.equal((await getOrganizerEvent(db, 'org_1', created.eventId, NOW + 100))?.values.title, 'Reworded');
  assert.equal(await getOrganizerEvent(db, 'org_2', created.eventId, NOW + 100), null);
});

test('past dates cannot be submitted, suspended organizations cannot save, canceled events cannot be edited', async () => {
  const { d1, db } = await database();
  await assert.rejects(
    saveEvent(db, {
      organizationId: 'org_1',
      input: { ...FORM, date: '2026-01-05' },
      submit: true,
      now: NOW,
    }),
    (e) => codeOf(e) === 'invalid:date',
  );
  const draft = await saveEvent(db, {
    organizationId: 'org_1',
    input: { ...FORM, date: '2026-01-05' },
    submit: false,
    now: NOW,
  });
  await assert.rejects(
    submitEvent(db, { organizationId: 'org_1', eventId: draft.eventId, now: NOW }),
    (e) => codeOf(e) === 'status_locked',
  );
  d1.sqlite.exec("UPDATE organizations SET first_event_approved_at = 1 WHERE id = 'org_1'");
  const ok = await saveEvent(db, { organizationId: 'org_1', input: FORM, submit: true, now: NOW });
  await cancelEvent(db, { organizationId: 'org_1', eventId: ok.eventId, now: NOW });
  await assert.rejects(
    saveEvent(db, { organizationId: 'org_1', eventId: ok.eventId, input: FORM, submit: false, now: NOW }),
    (e) => codeOf(e) === 'status_locked',
  );
  d1.sqlite.exec("UPDATE organizations SET status = 'suspended' WHERE id = 'org_1'");
  await assert.rejects(
    saveEvent(db, { organizationId: 'org_1', input: FORM, submit: false, now: NOW }),
    (e) => codeOf(e) === 'suspended',
  );
});

test('once people register, dates lock and capacity cannot drop below the seats taken', async () => {
  const { d1, db } = await database();
  d1.sqlite.exec("UPDATE organizations SET first_event_approved_at = 1 WHERE id = 'org_1'");
  const created = await saveEvent(db, { organizationId: 'org_1', input: FORM, submit: true, now: NOW });
  const occ = (await getOrganizerEvent(db, 'org_1', created.eventId, NOW + 100))!.occurrences[0];
  const reg = await startRegistration(db, ENV, {
    occurrenceId: occ.id,
    name: 'Sam',
    email: 'sam@example.org',
    partySize: 3,
    termsVersion: 'v1',
    now: NOW,
  });
  await confirmRegistration(db, ENV, { registrationId: reg.registrationId, code: reg.code, now: NOW + 5 });
  const edit = (patch: Partial<EventFormValues>) =>
    saveEvent(db, {
      organizationId: 'org_1',
      eventId: created.eventId,
      input: { ...FORM, ...patch },
      submit: false,
      now: NOW + 10,
    });
  await assert.rejects(edit({ capacity: '2' }), (e) => codeOf(e) === 'invalid:capacity');
  await edit({ date: '2026-12-24', capacity: '20', title: 'Moved?' });
  const after = (await getOrganizerEvent(db, 'org_1', created.eventId, NOW + 100))!;
  assert.equal(after.occurrences[0].id, occ.id, 'the date row (and its registrations) is kept');
  assert.equal(after.values.date, '2026-11-15', 'the date did not change');
  assert.equal(after.values.title, 'Moved?', 'other fields do change');
  assert.equal(after.capacity, 20);
  assert.equal(after.registrationsLocked, true);
  void d1;
});

test('canceling an event cancels every registration, frees the seats and lists who to tell', async () => {
  const { d1, db } = await database();
  d1.sqlite.exec("UPDATE organizations SET first_event_approved_at = 1 WHERE id = 'org_1'");
  const created = await saveEvent(db, { organizationId: 'org_1', input: FORM, submit: true, now: NOW });
  const occ = (await getOrganizerEvent(db, 'org_1', created.eventId, NOW + 100))!.occurrences[0];
  for (const [i, party] of [2, 1].entries()) {
    const reg = await startRegistration(db, ENV, {
      occurrenceId: occ.id,
      name: `Person ${i}`,
      email: `p${i}@example.org`,
      partySize: party,
      termsVersion: 'v1',
      now: NOW,
    });
    if (i === 0)
      await confirmRegistration(db, ENV, {
        registrationId: reg.registrationId,
        code: reg.code,
        now: NOW + 5,
      });
  }
  await assert.rejects(
    cancelEvent(db, { organizationId: 'org_2', eventId: created.eventId, now: NOW }),
    (e) => codeOf(e) === 'not_found',
  );
  const affected = await cancelEvent(db, { organizationId: 'org_1', eventId: created.eventId, now: NOW + 9 });
  assert.deepEqual(
    affected.map((a) => a.email),
    ['p0@example.org'],
    'only confirmed people are told',
  );
  const seats = d1.sqlite.prepare('SELECT seats_taken AS n, status FROM event_occurrences').get() as {
    n: number;
    status: string;
  };
  assert.deepEqual({ ...seats }, { n: 0, status: 'canceled' });
  assert.equal(
    (
      d1.sqlite
        .prepare("SELECT COUNT(*) AS n FROM registrations WHERE status IN ('pending','confirmed')")
        .get() as { n: number }
    ).n,
    0,
  );
  await assert.rejects(
    cancelEvent(db, { organizationId: 'org_1', eventId: created.eventId, now: NOW + 10 }),
    (e) => codeOf(e) === 'status_locked',
  );
});

test('registration lists are scoped to the organization, searchable, and exported without formula injection', async () => {
  const { d1, db } = await database();
  d1.sqlite.exec("UPDATE organizations SET first_event_approved_at = 1 WHERE id = 'org_1'");
  const created = await saveEvent(db, { organizationId: 'org_1', input: FORM, submit: true, now: NOW });
  const occ = (await getOrganizerEvent(db, 'org_1', created.eventId, NOW + 100))!.occurrences[0];
  const reg = await startRegistration(db, ENV, {
    occurrenceId: occ.id,
    name: '=HYPERLINK("http://evil")',
    email: 'x@example.org',
    partySize: 1,
    termsVersion: 'v1',
    now: NOW,
  });
  await confirmRegistration(db, ENV, { registrationId: reg.registrationId, code: reg.code, now: NOW + 5 });
  assert.equal((await listEventRegistrations(db, 'org_1', created.eventId, { now: NOW + 100 })).length, 1);
  assert.equal((await listEventRegistrations(db, 'org_2', created.eventId, { now: NOW + 100 })).length, 0);
  assert.equal(
    (await listEventRegistrations(db, 'org_1', created.eventId, { q: 'nobody', now: NOW + 100 })).length,
    0,
  );
  const csv = registrationsCsv(
    await listEventRegistrations(db, 'org_1', created.eventId, { now: NOW + 100 }),
    'America/Phoenix',
  );
  assert.match(csv, /^Date,Name,Email,People,Status,Checked in,Registered\r\n/);
  assert.ok(
    csv.includes('"\'=HYPERLINK(""http://evil"")"'),
    'a leading = is neutralized and quotes are escaped',
  );
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('a,b'), '"a,b"');
  await assert.rejects(
    cancelRegistrationForOrganizer(db, {
      organizationId: 'org_2',
      registrationId: reg.registrationId,
      now: NOW,
    }),
    (e) => codeOf(e) === 'not_found',
  );
  const view = await cancelRegistrationForOrganizer(db, {
    organizationId: 'org_1',
    registrationId: reg.registrationId,
    now: NOW + 9,
  });
  assert.equal(view.status, 'canceled');
  const [row] = await listOrganizerEvents(db, 'org_1', {}, NOW);
  assert.equal(row.peopleRegistered, 0);
});

test('check-in is only for this organization’s QR-enabled, scheduled dates, and the first scan wins', async () => {
  const { d1, db } = await database();
  d1.sqlite.exec("UPDATE organizations SET first_event_approved_at = 1 WHERE id = 'org_1'");
  const withQr = await saveEvent(db, {
    organizationId: 'org_1',
    input: { ...FORM, qrCheckin: true },
    submit: true,
    now: NOW,
  });
  const withoutQr = await saveEvent(db, {
    organizationId: 'org_1',
    input: { ...FORM, title: 'No QR night' },
    submit: true,
    now: NOW,
  });
  const occ = (await getOrganizerEvent(db, 'org_1', withQr.eventId, NOW + 100))!.occurrences[0];
  const plain = (await getOrganizerEvent(db, 'org_1', withoutQr.eventId, NOW + 100))!.occurrences[0];
  const reg = await startRegistration(db, ENV, {
    occurrenceId: occ.id,
    name: 'Sam',
    email: 'sam@example.org',
    partySize: 2,
    termsVersion: 'v1',
    now: NOW,
  });
  const confirmed = await confirmRegistration(db, ENV, {
    registrationId: reg.registrationId,
    code: reg.code,
    now: NOW + 5,
  });
  const doorOpen = occ.startsAt + 100;
  const door = (organizationId: string, occurrenceId: string, code: string, now = doorOpen) =>
    checkInForOrganizer(db, { organizationId, occurrenceId, code, now });
  assert.equal(await getCheckInOccurrence(db, 'org_2', occ.id), null, 'another organization sees nothing');
  await assert.rejects(door('org_2', occ.id, confirmed.checkinCode!), (e) => codeOf(e) === 'not_found');
  await assert.rejects(
    door('org_1', plain.id, 'ABCDEFGHJK'),
    (e) => codeOf(e) === 'not_found',
    'QR is off for that event',
  );
  assert.deepEqual(await door('org_1', occ.id, confirmed.checkinCode!), {
    ok: true,
    name: 'Sam',
    partySize: 2,
  });
  assert.deepEqual(await door('org_1', occ.id, confirmed.checkinCode!, occ.startsAt + 200), {
    ok: false,
    reason: 'already_admitted',
    name: 'Sam',
    checkedInAt: doorOpen,
  });
  assert.deepEqual(
    await door('org_1', occ.id, confirmed.checkinCode!, occ.startsAt - 4 * 3600),
    { ok: false, reason: 'outside_window' },
    'not before the doors open (3 hours ahead)',
  );
  assert.deepEqual(
    await door('org_1', occ.id, confirmed.checkinCode!, occ.startsAt + 13 * 3600),
    { ok: false, reason: 'outside_window' },
    'not the next day',
  );
  assert.equal(
    normalizeCheckinCode(' gl1.ab-cd 0o1i '),
    'ABCD0011',
    'typed look-alikes and the QR prefix are read',
  );
  assert.equal((await getCheckInOccurrence(db, 'org_1', occ.id))?.checkedInPeople, 2);
  await cancelEvent(db, { organizationId: 'org_1', eventId: withQr.eventId, now: NOW + 300 });
  await assert.rejects(
    door('org_1', occ.id, confirmed.checkinCode!),
    (e) => codeOf(e) === 'not_found',
    'canceled dates do not check in',
  );
});

test('a form that omits the locked fields still saves once people have registered', async () => {
  const { d1, db } = await database();
  d1.sqlite.exec("UPDATE organizations SET first_event_approved_at = 1 WHERE id = 'org_1'");
  const created = await saveEvent(db, { organizationId: 'org_1', input: FORM, submit: true, now: NOW });
  const occ = (await getOrganizerEvent(db, 'org_1', created.eventId, NOW + 100))!.occurrences[0];
  const reg = await startRegistration(db, ENV, {
    occurrenceId: occ.id,
    name: 'Sam',
    email: 'sam@example.org',
    partySize: 1,
    termsVersion: 'v1',
    now: NOW,
  });
  await confirmRegistration(db, ENV, { registrationId: reg.registrationId, code: reg.code, now: NOW + 5 });
  // Disabled inputs are not posted: the browser sends empty strings for everything locked.
  const saved = await saveEvent(db, {
    organizationId: 'org_1',
    eventId: created.eventId,
    input: {
      ...FORM,
      description: 'A new description that is long enough to be accepted by the form.',
      timezone: '',
      schedule: '',
      date: '',
      startTime: '',
      endTime: '',
      until: '',
      admission: '',
      externalUrl: '',
      qrCheckin: false,
    },
    submit: false,
    now: NOW + 10,
  });
  assert.equal(saved.status, 'published');
  const after = (await getOrganizerEvent(db, 'org_1', created.eventId, NOW + 100))!;
  assert.equal(after.values.date, '2026-11-15');
  assert.equal(after.values.startTime, '18:30');
  assert.equal(after.admission, 'free_registration');
  assert.match(after.values.description, /new description/);
});

test('a never-published event cannot be canceled, only deleted, and a canceled draft is never public', async () => {
  const { d1, db } = await database();
  const draft = await saveEvent(db, { organizationId: 'org_1', input: FORM, submit: false, now: NOW });
  await assert.rejects(
    cancelEvent(db, { organizationId: 'org_1', eventId: draft.eventId, now: NOW }),
    (e) => codeOf(e) === 'status_locked',
  );
  await assert.rejects(
    deleteUnpublishedEvent(db, { organizationId: 'org_2', eventId: draft.eventId }),
    (e) => codeOf(e) === 'status_locked',
  );
  await deleteUnpublishedEvent(db, { organizationId: 'org_1', eventId: draft.eventId });
  assert.equal(await getOrganizerEvent(db, 'org_1', draft.eventId, NOW + 100), null);
  assert.equal(
    (d1.sqlite.prepare('SELECT COUNT(*) AS n FROM event_occurrences').get() as { n: number }).n,
    0,
    'its dates go with it',
  );
  d1.sqlite.exec("UPDATE organizations SET first_event_approved_at = 1 WHERE id = 'org_1'");
  const live = await saveEvent(db, { organizationId: 'org_1', input: FORM, submit: true, now: NOW });
  await assert.rejects(
    deleteUnpublishedEvent(db, { organizationId: 'org_1', eventId: live.eventId }),
    (e) => codeOf(e) === 'status_locked',
    'a published event is canceled, not deleted',
  );
});

test('overnight events end the next day; equal start and end are refused', () => {
  const v = validateEvent({ ...FORM, startTime: '21:00', endTime: '02:00' });
  const [o] = expandOccurrences(v);
  assert.equal(o.endsAt! - o.startsAt, 5 * 3600);
  assert.throws(() => validateEvent({ ...FORM, startTime: '21:00', endTime: '21:00' }));
});

test('a venue address belongs to the event, so another organization at the same venue name keeps its own', async () => {
  const { db } = await database();
  const a = await saveEvent(db, { organizationId: 'org_1', input: FORM, submit: false, now: NOW });
  const b = await saveEvent(db, {
    organizationId: 'org_2',
    input: { ...FORM, address: '999 Other Rd', venueName: '  Grace   Fellowship ' },
    submit: false,
    now: NOW,
  });
  assert.equal((await getOrganizerEvent(db, 'org_1', a.eventId, NOW + 100))!.values.address, '100 Main St');
  assert.equal((await getOrganizerEvent(db, 'org_2', b.eventId, NOW + 100))!.values.address, '999 Other Rd');
  await saveEvent(db, {
    organizationId: 'org_1',
    eventId: a.eventId,
    input: { ...FORM, address: '100 Main Street' },
    submit: false,
    now: NOW + 1,
  });
  assert.equal(
    (await getOrganizerEvent(db, 'org_1', a.eventId, NOW + 100))!.values.address,
    '100 Main Street',
    'a typo in the address can be fixed',
  );
});

test('one date of a series can be canceled without touching the others', async () => {
  const { d1, db } = await database();
  d1.sqlite.exec("UPDATE organizations SET first_event_approved_at = 1 WHERE id = 'org_1'");
  const created = await saveEvent(db, {
    organizationId: 'org_1',
    input: { ...FORM, schedule: 'weekly', until: '2026-11-29' },
    submit: true,
    now: NOW,
  });
  const detail = (await getOrganizerEvent(db, 'org_1', created.eventId, NOW + 100))!;
  assert.equal(detail.occurrences.length, 3);
  const [first, second] = detail.occurrences;
  const reg = await startRegistration(db, ENV, {
    occurrenceId: second.id,
    name: 'Sam',
    email: 'sam@example.org',
    partySize: 2,
    termsVersion: 'v1',
    now: NOW,
  });
  await confirmRegistration(db, ENV, { registrationId: reg.registrationId, code: reg.code, now: NOW + 5 });
  const told = await cancelOccurrence(db, {
    organizationId: 'org_1',
    eventId: created.eventId,
    occurrenceId: second.id,
    now: NOW + 9,
  });
  assert.deepEqual(
    told.map((x) => x.email),
    ['sam@example.org'],
  );
  const after = (await getOrganizerEvent(db, 'org_1', created.eventId, NOW + 100))!;
  assert.equal(after.status, 'published');
  assert.deepEqual(
    after.occurrences.map((o) => o.canceled),
    [false, true, false],
  );
  await assert.rejects(
    cancelOccurrence(db, {
      organizationId: 'org_1',
      eventId: created.eventId,
      occurrenceId: second.id,
      now: NOW + 10,
    }),
    (e) => codeOf(e) === 'status_locked',
  );
  await assert.rejects(
    cancelOccurrence(db, {
      organizationId: 'org_2',
      eventId: created.eventId,
      occurrenceId: first.id,
      now: NOW + 10,
    }),
    (e) => codeOf(e) === 'not_found',
  );
  for (const o of [first, after.occurrences[2]])
    await cancelOccurrence(db, {
      organizationId: 'org_1',
      eventId: created.eventId,
      occurrenceId: o.id,
      now: NOW + 11,
    });
  assert.equal(
    (await getOrganizerEvent(db, 'org_1', created.eventId, NOW + 100))!.status,
    'canceled',
    'the last date ends the event',
  );
});

test('a hold that ran out neither counts as taken seats, nor locks the event, nor shows as waiting', async () => {
  const { d1, db } = await database();
  d1.sqlite.exec("UPDATE organizations SET first_event_approved_at = 1 WHERE id = 'org_1'");
  const created = await saveEvent(db, { organizationId: 'org_1', input: FORM, submit: true, now: NOW });
  const occ = (await getOrganizerEvent(db, 'org_1', created.eventId, NOW))!.occurrences[0];
  await startRegistration(db, ENV, {
    occurrenceId: occ.id,
    name: 'Sam',
    email: 'sam@example.org',
    partySize: 3,
    termsVersion: 'v1',
    now: NOW,
  });
  const during = (await getOrganizerEvent(db, 'org_1', created.eventId, NOW + 60))!;
  assert.equal(during.occurrences[0].seatsTaken, 3);
  assert.equal(during.registrationsLocked, true);
  const later = NOW + 20 * 60;
  const after = (await getOrganizerEvent(db, 'org_1', created.eventId, later))!;
  assert.equal(after.occurrences[0].seatsTaken, 0, 'the seats are free again before any cleanup ran');
  assert.equal(after.registrationsLocked, false, 'an abandoned hold does not lock the schedule');
  const rows = await listEventRegistrations(db, 'org_1', created.eventId, { now: later });
  assert.equal(rows[0].status, 'expired');
  await releaseExpiredHolds(db, later);
  const stored = d1.sqlite.prepare('SELECT seats_taken AS n FROM event_occurrences').get() as { n: number };
  assert.equal(stored.n, 0);
  assert.equal(
    (d1.sqlite.prepare('SELECT status FROM registrations').get() as { status: string }).status,
    'expired',
  );
});

test('a material change to a published event waits for review while the live version stays visible', async () => {
  const { d1, db } = await database();
  d1.sqlite.exec(
    "UPDATE organizations SET first_event_approved_at = 1, review_every_event = 1 WHERE id = 'org_1'",
  );
  // Published through admin approval first (the rule asks for review of every event).
  const created = await saveEvent(db, { organizationId: 'org_1', input: FORM, submit: true, now: NOW });
  assert.equal(created.status, 'pending_review');
  await reviewLiveEvent(db, { eventId: created.eventId, decision: 'approved', now: NOW + 1 });
  const edit = (patch: Partial<EventFormValues>) =>
    saveEvent(db, {
      organizationId: 'org_1',
      eventId: created.eventId,
      input: { ...FORM, ...patch },
      submit: false,
      now: NOW + 10,
    });
  const res = await edit({ startTime: '19:30', venueName: 'New Hall', title: 'Retitled' });
  assert.equal(res.status, 'published');
  const org = (await getOrganizerEvent(db, 'org_1', created.eventId, NOW + 20))!;
  assert.equal(org.changeWaiting, true);
  assert.equal(org.liveValues.startTime, '18:30', 'the public version keeps the old time');
  assert.equal(org.liveValues.venueName, 'Grace Fellowship');
  assert.equal(org.liveValues.title, 'Retitled', 'wording is not held back');
  assert.equal(org.values.startTime, '19:30', 'the editor shows the proposal');
  assert.equal(org.values.venueName, 'New Hall');
  const queue = await listPendingEvents(db);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].isChange, true);
  assert.equal(queue[0].venue, 'New Hall');
  assert.equal(queue[0].current?.venue, 'Grace Fellowship');
  // Asking for changes discards the proposal and leaves the event as it was.
  await assert.rejects(
    reviewLiveEvent(db, { eventId: created.eventId, decision: 'rejected', now: NOW + 30 }),
    /note_required/,
  );
  await reviewLiveEvent(db, {
    eventId: created.eventId,
    decision: 'changes_requested',
    note: 'Keep the old hall.',
    now: NOW + 30,
  });
  const after = (await getOrganizerEvent(db, 'org_1', created.eventId, NOW + 40))!;
  assert.equal(after.status, 'published');
  assert.equal(after.changeWaiting, false);
  assert.equal(after.values.startTime, '18:30');
  // A second proposal, this time approved, replaces the live version.
  await edit({ startTime: '19:45', venueName: 'New Hall' });
  await reviewLiveEvent(db, { eventId: created.eventId, decision: 'approved', now: NOW + 50 });
  const done = (await getOrganizerEvent(db, 'org_1', created.eventId, NOW + 60))!;
  assert.equal(done.changeWaiting, false);
  assert.equal(done.liveValues.startTime, '19:45');
  assert.equal(done.liveValues.venueName, 'New Hall');
  assert.equal(done.status, 'published');
  // Editing back to the live version withdraws a waiting proposal.
  await edit({ startTime: '19:15' });
  assert.equal((await getOrganizerEvent(db, 'org_1', created.eventId, NOW + 70))!.changeWaiting, true);
  await edit({ startTime: '19:45', venueName: 'New Hall' });
  assert.equal((await getOrganizerEvent(db, 'org_1', created.eventId, NOW + 80))!.changeWaiting, false);
});

test('events that send people to another site for tickets are always reviewed, even for an approved organization', async () => {
  const { d1, db } = await database();
  d1.sqlite.exec("UPDATE organizations SET first_event_approved_at = 1 WHERE id = 'org_1'");
  const external = await saveEvent(db, {
    organizationId: 'org_1',
    input: {
      ...FORM,
      admission: 'external_tickets',
      externalUrl: 'https://tickets.example.org/e/1',
      capacity: '',
    },
    submit: true,
    now: NOW,
  });
  assert.equal(external.status, 'pending_review');
  const draft = await saveEvent(db, {
    organizationId: 'org_1',
    input: {
      ...FORM,
      admission: 'external_tickets',
      externalUrl: 'https://tickets.example.org/e/2',
      capacity: '',
    },
    submit: false,
    now: NOW,
  });
  assert.equal(
    await submitEvent(db, { organizationId: 'org_1', eventId: draft.eventId, now: NOW }),
    'pending_review',
  );
  const free = await saveEvent(db, { organizationId: 'org_1', input: FORM, submit: true, now: NOW });
  assert.equal(free.status, 'published', 'free events still publish directly');
});

test('a decision on content that changed since the admin read it is refused as stale', async () => {
  const { db } = await database();
  const created = await saveEvent(db, { organizationId: 'org_1', input: FORM, submit: true, now: NOW });
  const [waiting] = await listPendingEvents(db);
  await saveEvent(db, {
    organizationId: 'org_1',
    eventId: created.eventId,
    input: { ...FORM, description: 'A different description that the admin has not read yet at all.' },
    submit: true,
    now: NOW + 50,
  });
  await assert.rejects(
    reviewLiveEvent(db, {
      eventId: created.eventId,
      decision: 'approved',
      now: NOW + 60,
      seenAt: waiting.submittedAt,
    }),
    /stale/,
  );
  const [fresh] = await listPendingEvents(db);
  await reviewLiveEvent(db, {
    eventId: created.eventId,
    decision: 'approved',
    now: NOW + 70,
    seenAt: fresh.submittedAt,
  });
});

test('Gamo can hide a published event with a note and restore it; both are recorded', async () => {
  const { d1, db } = await database();
  d1.sqlite.exec("UPDATE organizations SET first_event_approved_at = 1 WHERE id = 'org_1'");
  const live = await saveEvent(db, { organizationId: 'org_1', input: FORM, submit: true, now: NOW });
  assert.equal((await listPublishedOrganizerEvents(db))[0].status, 'published');
  await assert.rejects(
    setOrganizerEventHidden(db, { eventId: live.eventId, hidden: true, now: NOW + 1 }),
    /note_required/,
  );
  await setOrganizerEventHidden(db, {
    eventId: live.eventId,
    hidden: true,
    note: 'Reported as not a Christian event.',
    now: NOW + 2,
  });
  assert.equal((await listPublishedOrganizerEvents(db))[0].status, 'hidden');
  assert.equal((await getOrganizerEvent(db, 'org_1', live.eventId, NOW + 3))!.status, 'hidden');
  await assert.rejects(
    setOrganizerEventHidden(db, { eventId: live.eventId, hidden: true, note: 'again', now: NOW + 4 }),
    /conflict/,
  );
  await setOrganizerEventHidden(db, { eventId: live.eventId, hidden: false, now: NOW + 5 });
  assert.equal((await getOrganizerEvent(db, 'org_1', live.eventId, NOW + 6))!.status, 'published');
  const log = d1.sqlite
    .prepare('SELECT decision FROM review_decisions WHERE subject_id = ? ORDER BY rowid')
    .all(live.eventId) as Array<{ decision: string }>;
  assert.deepEqual(
    log.map((x) => x.decision),
    ['hidden', 'restored'],
  );
});

test('an organization cannot create more than 100 events', async () => {
  const { d1, db } = await database();
  d1.sqlite.exec(
    "INSERT INTO venues (id, name, city, state, timezone) VALUES ('ven_q', 'Quota Hall', 'Phoenix', 'AZ', 'America/Phoenix')",
  );
  for (let i = 0; i < 100; i++)
    d1.sqlite.exec(
      `INSERT INTO events (id, organization_id, origin, slug, title, category, venue_id, timezone, admission, status)
       VALUES ('evt_q${i}', 'org_1', 'organizer', 'q${i}', 'Quota ${i}', 'worship', 'ven_q', 'America/Phoenix', 'free_open', 'draft')`,
    );
  await assert.rejects(
    saveEvent(db, { organizationId: 'org_1', input: FORM, submit: false, now: NOW }),
    (e) => codeOf(e) === 'quota',
  );
});

test('check-in opens N hours before by the event setting, or whenever the organizer opens it, and ends 12 hours after the start', async () => {
  const { d1, db } = await database();
  d1.sqlite.exec("UPDATE organizations SET first_event_approved_at = 1 WHERE id = 'org_1'");
  const created = await saveEvent(db, {
    organizationId: 'org_1',
    input: { ...FORM, qrCheckin: true, checkinOpensHours: '24' },
    submit: true,
    now: NOW,
  });
  const detail = (await getOrganizerEvent(db, 'org_1', created.eventId, NOW + 1))!;
  assert.equal(detail.values.checkinOpensHours, '24');
  const occ = detail.occurrences[0];
  await assert.rejects(
    saveEvent(db, {
      organizationId: 'org_1',
      eventId: created.eventId,
      input: { ...FORM, qrCheckin: true, checkinOpensHours: '5' },
      submit: false,
      now: NOW + 2,
    }),
    (e) => codeOf(e) === 'invalid:checkinOpensHours',
  );
  const stored = (await getCheckInOccurrence(db, 'org_1', occ.id))!;
  assert.equal(checkInWindow(stored, occ.startsAt - 25 * 3600).open, false, 'earlier than the 24 hours');
  assert.equal(checkInWindow(stored, occ.startsAt - 23 * 3600).open, true);
  assert.equal(checkInWindow(stored, occ.startsAt + 13 * 3600).open, false, 'closed 12 hours after');
  // Opened by hand: open now although the date is weeks away, and closing it returns to the schedule.
  await assert.rejects(
    setCheckInOpen(db, { organizationId: 'org_2', occurrenceId: occ.id, open: true, now: NOW }),
    (e) => codeOf(e) === 'not_found',
  );
  await setCheckInOpen(db, { organizationId: 'org_1', occurrenceId: occ.id, open: true, now: NOW + 10 });
  const opened = (await getCheckInOccurrence(db, 'org_1', occ.id))!;
  assert.equal(checkInWindow(opened, NOW + 20).open, true);
  assert.equal(checkInWindow(opened, NOW + 20).manual, true);
  assert.equal(checkInWindow(opened, occ.startsAt + 13 * 3600).open, false, 'a manual opening still ends');
  await setCheckInOpen(db, { organizationId: 'org_1', occurrenceId: occ.id, open: false, now: NOW + 30 });
  assert.equal(checkInWindow((await getCheckInOccurrence(db, 'org_1', occ.id))!, NOW + 40).open, false);
});

test('the organization schedule lists the dates of public and in-review events only, with their people', async () => {
  const { d1, db } = await database();
  d1.sqlite.exec("UPDATE organizations SET first_event_approved_at = 1 WHERE id = 'org_1'");
  const live = await saveEvent(db, {
    organizationId: 'org_1',
    input: { ...FORM, schedule: 'weekly', until: '2026-11-29' },
    submit: true,
    now: NOW,
  });
  await saveEvent(db, {
    organizationId: 'org_1',
    input: { ...FORM, title: 'Just a draft' },
    submit: false,
    now: NOW,
  });
  await saveEvent(db, {
    organizationId: 'org_2',
    input: { ...FORM, title: 'Someone else' },
    submit: true,
    now: NOW,
  });
  const occ = (await getOrganizerEvent(db, 'org_1', live.eventId, NOW + 1))!.occurrences[1];
  const reg = await startRegistration(db, ENV, {
    occurrenceId: occ.id,
    name: 'Sam',
    email: 'sam@example.org',
    partySize: 2,
    termsVersion: 'v1',
    now: NOW,
  });
  await confirmRegistration(db, ENV, { registrationId: reg.registrationId, code: reg.code, now: NOW + 5 });
  await cancelOccurrence(db, {
    organizationId: 'org_1',
    eventId: live.eventId,
    occurrenceId: occ.id,
    now: NOW + 9,
  });
  const schedule = await listOrganizationSchedule(db, 'org_1');
  assert.equal(
    schedule.length,
    3,
    'the three dates of the series, not the draft and not the other organization',
  );
  assert.ok(schedule.every((d) => d.title === 'Sunday Worship Night'));
  assert.deepEqual(
    schedule.map((d) => d.canceled),
    [false, true, false],
  );
  assert.ok(schedule[0].startsAt < schedule[1].startsAt);
  assert.equal(schedule[0].timeZone, 'America/Phoenix');
});

// --- Paid events (docs/LIVE_REQUIREMENTS.md §8 items 1, 6, 7, 17) -------------------------------------------------

const PAID_FORM: EventFormValues = {
  ...FORM,
  admission: 'paid_tickets',
  capacity: '',
  maxPartySize: '',
  qrCheckin: false,
};

async function paidDatabase(options: SeedPaidEventOptions = {}) {
  const { d1, db } = await paidTestDatabase();
  // Payments ready by default (Mode A, a ready account), so only what a test changes stands in the way of selling.
  const seeded = seedPaidEvent(d1, { flow: 'organizer_account', ...options });
  return { d1, db: db as never, seeded };
}

/** A raw order row on the seeded paid event (the orders module is separate; this is just enough for the rules). */
function insertOrder(
  d1: { sqlite: { exec(sql: string): void } },
  o: {
    id: string;
    status: string;
    occurrenceId?: string;
    channel?: 'online' | 'door';
    method?: string;
    preview?: boolean;
    codeId?: string | null;
    session?: string | null;
    email?: string | null;
    items?: Array<{ type: string; qty: number; people?: number }>;
  },
) {
  const channel = o.channel ?? 'online';
  const method = o.method ?? (channel === 'door' ? 'cash' : 'card_online');
  const flow = method === 'cash' || method === 'comp' || method === 'free' ? 'NULL' : "'gamo_collects'";
  const items = o.items ?? [{ type: 'tty_general_1', qty: 1 }];
  const subtotal = items.reduce((sum, i) => sum + i.qty * (i.type === 'tty_vip_1' ? 5000 : 2000), 0);
  d1.sqlite.exec(`
    INSERT INTO orders (id, reference, event_id, occurrence_id, organization_id, channel, payment_method, status, is_preview,
                        funds_flow, seller, buyer_name, buyer_email, subtotal_cents, total_cents, code_id, policy_snapshot,
                        fee_snapshot, hold_expires_at, checkout_session_id, created_at)
      VALUES ('${o.id}', 'GL-${o.id}', 'evt_1', '${o.occurrenceId ?? 'occ_1'}', 'org_1', '${channel}', '${method}', '${o.status}',
              ${o.preview ? 1 : 0}, ${flow}, 'gamo', 'Buyer ${o.id}', ${o.email === null ? 'NULL' : `'${o.email ?? `${o.id}@example.org`}'`},
              ${subtotal}, ${subtotal}, ${o.codeId ? `'${o.codeId}'` : 'NULL'}, '{}', '{}', ${PAID_NOW + 1800},
              ${o.session ? `'${o.session}'` : 'NULL'}, ${PAID_NOW});
  `);
  for (const [n, i] of items.entries())
    d1.sqlite.exec(`
      INSERT INTO order_items (id, order_id, ticket_type_id, name, unit_price_cents, quantity, people_per_ticket, line_total_cents)
        VALUES ('oit_${o.id}_${n}', '${o.id}', '${i.type}', 'Ticket', ${i.type === 'tty_vip_1' ? 5000 : 2000}, ${i.qty}, ${i.people ?? 1},
                ${i.qty * (i.type === 'tty_vip_1' ? 5000 : 2000)});
    `);
}

test('paid tickets need no external link or price text, keep an optional capacity, and always use QR check-in', () => {
  const v = validateEvent({ ...PAID_FORM, capacity: '250' });
  assert.equal(v.admission, 'paid_tickets');
  assert.equal(v.externalUrl, null);
  assert.equal(v.capacity, 250, 'the event-wide cap in people per date');
  assert.equal(v.qrCheckin, true, 'QR check-in is always on for paid tickets');
  assert.equal(validateEvent(PAID_FORM).capacity, null, 'the cap is optional');
  assert.equal(
    invalid({ admission: 'external_tickets', qrCheckin: true, externalUrl: 'https://x.example.org' }),
    'invalid:qrCheckin',
  );
});

test('the first paid event is reviewed even after the first free event was approved; later ones follow the rule', async () => {
  const { d1, db } = await paidDatabase();
  d1.sqlite.exec("UPDATE organizations SET first_paid_event_approved_at = NULL WHERE id = 'org_1'");
  const free = await saveEvent(db, { organizationId: 'org_1', input: FORM, submit: true, now: PAID_NOW });
  assert.equal(free.status, 'published', 'free events of an approved organization still publish at once');
  const paid = await saveEvent(db, {
    organizationId: 'org_1',
    input: PAID_FORM,
    submit: true,
    now: PAID_NOW,
  });
  assert.equal(paid.status, 'pending_review', 'the first paid event waits for Gamo');
  const draft = await saveEvent(db, {
    organizationId: 'org_1',
    input: PAID_FORM,
    submit: false,
    now: PAID_NOW,
  });
  assert.equal(
    await submitEvent(db, { organizationId: 'org_1', eventId: draft.eventId, now: PAID_NOW }),
    'pending_review',
  );
  const decided = await reviewLiveEvent(db, {
    eventId: paid.eventId,
    decision: 'approved',
    now: PAID_NOW + 5,
  });
  assert.equal(decided.firstPaidApproval, true);
  assert.equal(
    (
      d1.sqlite
        .prepare("SELECT first_paid_event_approved_at AS t FROM organizations WHERE id = 'org_1'")
        .get() as { t: number }
    ).t,
    PAID_NOW + 5,
  );
  const next = await saveEvent(db, {
    organizationId: 'org_1',
    input: PAID_FORM,
    submit: true,
    now: PAID_NOW + 10,
  });
  assert.equal(next.status, 'published', 'after one approved paid event, the normal rule applies');
  d1.sqlite.exec("UPDATE organizations SET review_every_event = 1 WHERE id = 'org_1'");
  const reviewed = await saveEvent(db, {
    organizationId: 'org_1',
    input: PAID_FORM,
    submit: true,
    now: PAID_NOW + 10,
  });
  assert.equal(reviewed.status, 'pending_review');
});

test('only a verified organization can submit a paid event; drafts can be saved before', async () => {
  const { db } = await paidDatabase({ verified: false });
  const draft = await saveEvent(db, {
    organizationId: 'org_1',
    input: PAID_FORM,
    submit: false,
    now: PAID_NOW,
  });
  assert.equal(draft.status, 'draft');
  await assert.rejects(
    saveEvent(db, { organizationId: 'org_1', input: PAID_FORM, submit: true, now: PAID_NOW }),
    (e) => e instanceof PaidError && e.code === 'not_verified',
  );
  await assert.rejects(
    submitEvent(db, { organizationId: 'org_1', eventId: draft.eventId, now: PAID_NOW }),
    (e) => e instanceof PaidError && e.code === 'not_verified',
  );
  const free = await saveEvent(db, { organizationId: 'org_1', input: FORM, submit: true, now: PAID_NOW });
  assert.equal(free.status, 'published', 'free events are unchanged');
});

test('a verified organization still needs payments ready and the organizer terms accepted to submit a paid event', async () => {
  const submitPaid = (db: never) =>
    saveEvent(db, { organizationId: 'org_1', input: PAID_FORM, submit: true, now: PAID_NOW });
  const refusedWith = (code: string) => (e: unknown) => e instanceof PaidError && e.code === code;
  const notChosen = await paidDatabase({ flow: undefined });
  notChosen.d1.sqlite.exec(
    "UPDATE payment_settings SET funds_flow_default = 'not_chosen'; DELETE FROM organization_payments",
  );
  await assert.rejects(submitPaid(notChosen.db), refusedWith('mode_not_chosen'));
  const notReady = await paidDatabase({ accountReady: false });
  await assert.rejects(submitPaid(notReady.db), refusedWith('account_not_ready'));
  const noTerms = await paidDatabase();
  noTerms.d1.sqlite.exec('DELETE FROM terms_acceptances');
  await assert.rejects(submitPaid(noTerms.db), refusedWith('terms_not_accepted'));
  const ready = await paidDatabase();
  assert.notEqual((await submitPaid(ready.db)).status, 'draft');
});

test('saving a paid event creates the inventory rows for each date and ticket type; the cap follows the event', async () => {
  const { d1, db } = await paidDatabase();
  const created = await saveEvent(db, {
    organizationId: 'org_1',
    input: { ...PAID_FORM, schedule: 'weekly', until: '2026-11-29', capacity: '80' },
    submit: true,
    now: PAID_NOW,
  });
  const caps = d1.sqlite
    .prepare(
      `SELECT i.capacity FROM occurrence_inventory i JOIN event_occurrences o ON o.id = i.occurrence_id WHERE o.event_id = ?`,
    )
    .all(created.eventId) as Array<{ capacity: number }>;
  assert.deepEqual(
    caps.map((c) => c.capacity),
    [80, 80, 80],
  );
  d1.sqlite.exec(
    `INSERT INTO ticket_types (id, event_id, name, price_cents, capacity) VALUES ('tty_new', '${created.eventId}', 'General', 1500, 40)`,
  );
  await saveEvent(db, {
    organizationId: 'org_1',
    eventId: created.eventId,
    input: { ...PAID_FORM, schedule: 'weekly', until: '2026-11-29', capacity: '90', title: 'Renamed night' },
    submit: false,
    now: PAID_NOW + 1,
  });
  const rows = d1.sqlite
    .prepare(
      `SELECT (SELECT COUNT(*) FROM ticket_inventory WHERE ticket_type_id = 'tty_new') AS types,
              (SELECT MIN(capacity) FROM occurrence_inventory i JOIN event_occurrences o ON o.id = i.occurrence_id WHERE o.event_id = ?) AS cap`,
    )
    .get(created.eventId) as { types: number; cap: number };
  assert.deepEqual({ ...rows }, { types: 3, cap: 90 });
});

test('once an order exists the schedule and admission lock like registrations, and the cap cannot drop below people taken', async () => {
  const { d1, db } = await paidDatabase();
  const form = { ...PAID_FORM, date: '2026-12-01', startTime: '19:00', endTime: '22:00' };
  const before = (await getOrganizerEvent(db, 'org_1', 'evt_1', PAID_NOW))!;
  assert.equal(before.registrationsLocked, false, 'no sale yet');
  insertOrder(d1, { id: 'ord_a', status: 'pending', items: [{ type: 'tty_general_1', qty: 2 }] });
  d1.sqlite.exec("UPDATE occurrence_inventory SET people_taken = 2 WHERE occurrence_id = 'occ_1'");
  const locked = (await getOrganizerEvent(db, 'org_1', 'evt_1', PAID_NOW))!;
  assert.equal(locked.registrationsLocked, true);
  assert.equal(locked.ordersLocked, true);
  await saveEvent(db, {
    organizationId: 'org_1',
    eventId: 'evt_1',
    input: { ...form, date: '2026-12-24', admission: 'free_open', title: 'Moved?' },
    submit: false,
    now: PAID_NOW + 10,
  });
  const after = (await getOrganizerEvent(db, 'org_1', 'evt_1', PAID_NOW + 10))!;
  assert.deepEqual(
    after.occurrences.map((o) => o.id),
    ['occ_1'],
    'the date row the order points at is kept',
  );
  assert.equal(after.admission, 'paid_tickets', 'admission is locked');
  assert.equal(after.liveValues.title, 'Moved?', 'other fields still change');
  await assert.rejects(
    saveEvent(db, {
      organizationId: 'org_1',
      eventId: 'evt_1',
      input: { ...form, capacity: '1' },
      submit: false,
      now: PAID_NOW + 20,
    }),
    (e) => codeOf(e) === 'invalid:capacity',
  );
});

test('canceling a paid event cancels pending orders, frees their seats and code uses, and returns paid orders to refund', async () => {
  const { d1, db } = await paidDatabase();
  d1.sqlite.exec(
    `INSERT INTO event_codes (id, event_id, code, kind, discount_kind, percent_off, uses) VALUES ('cod_1', 'evt_1', 'SAVE10', 'promo', 'percent', 10, 1)`,
  );
  // Pending online order: 2 general (1 person each) with a code and an open Checkout Session.
  insertOrder(d1, {
    id: 'ord_p1',
    status: 'pending',
    codeId: 'cod_1',
    session: 'cs_test_1',
    items: [{ type: 'tty_general_1', qty: 2 }],
  });
  // Pending door order: 1 VIP pack for 2 people.
  insertOrder(d1, {
    id: 'ord_p2',
    status: 'pending',
    channel: 'door',
    items: [{ type: 'tty_vip_1', qty: 1, people: 2 }],
  });
  // Paid orders: one online, one preview (never refunded, only voided).
  insertOrder(d1, { id: 'ord_paid', status: 'paid', items: [{ type: 'tty_general_1', qty: 3 }] });
  insertOrder(d1, {
    id: 'ord_prev',
    status: 'paid',
    preview: true,
    items: [{ type: 'tty_general_1', qty: 1 }],
  });
  d1.sqlite.exec(`
    UPDATE ticket_inventory SET online_taken = 6 WHERE ticket_type_id = 'tty_general_1';
    UPDATE ticket_inventory SET door_taken = 1 WHERE ticket_type_id = 'tty_vip_1';
    UPDATE occurrence_inventory SET people_taken = 8 WHERE occurrence_id = 'occ_1';
  `);
  const result = await cancelEvent(db, { organizationId: 'org_1', eventId: 'evt_1', now: PAID_NOW + 60 });
  assert.deepEqual(
    result.ordersToRefund.map((o) => [o.orderId, o.buyerEmail]),
    [['ord_paid', 'ord_paid@example.org']],
  );
  assert.deepEqual(
    result.checkoutsToExpire.map((c) => [c.orderId, c.checkoutSessionId]),
    [['ord_p1', 'cs_test_1']],
  );
  assert.deepEqual([...result], [], 'no free registrants on a paid event');
  const status = (id: string) =>
    (d1.sqlite.prepare('SELECT status FROM orders WHERE id = ?').get(id) as { status: string }).status;
  assert.equal(status('ord_p1'), 'canceled');
  assert.equal(status('ord_p2'), 'canceled');
  assert.equal(status('ord_paid'), 'paid', 'paid orders are refunded by the refunds module, not here');
  const inv = d1.sqlite
    .prepare(
      "SELECT ticket_type_id AS t, online_taken AS o, door_taken AS d FROM ticket_inventory WHERE occurrence_id = 'occ_1' ORDER BY t",
    )
    .all() as Array<{ t: string; o: number; d: number }>;
  assert.deepEqual(
    inv.map((r) => [r.t, r.o, r.d]),
    [
      ['tty_general_1', 4, 0],
      ['tty_vip_1', 0, 0],
    ],
    'only the pending holds are given back (3 paid + 1 preview stay counted)',
  );
  assert.equal(
    (
      d1.sqlite
        .prepare("SELECT people_taken AS n FROM occurrence_inventory WHERE occurrence_id = 'occ_1'")
        .get() as { n: number }
    ).n,
    4,
  );
  assert.equal(
    (d1.sqlite.prepare("SELECT uses AS n FROM event_codes WHERE id = 'cod_1'").get() as { n: number }).n,
    0,
  );
});

test('canceling one date of a paid event touches only that date’s orders', async () => {
  const { d1, db } = await paidDatabase();
  d1.sqlite.exec(`
    INSERT INTO event_occurrences (id, event_id, starts_at) VALUES ('occ_2', 'evt_1', ${PAID_NOW + 40 * 86_400});
    INSERT INTO ticket_inventory (ticket_type_id, occurrence_id, capacity, online_taken) VALUES ('tty_general_1', 'occ_2', 100, 1);
    INSERT INTO occurrence_inventory (occurrence_id, people_taken) VALUES ('occ_2', 1);
    UPDATE ticket_inventory SET online_taken = 1 WHERE ticket_type_id = 'tty_general_1' AND occurrence_id = 'occ_1';
    UPDATE occurrence_inventory SET people_taken = 1 WHERE occurrence_id = 'occ_1';
  `);
  insertOrder(d1, { id: 'ord_1', status: 'pending', occurrenceId: 'occ_1' });
  insertOrder(d1, { id: 'ord_2', status: 'pending', occurrenceId: 'occ_2' });
  insertOrder(d1, { id: 'ord_3', status: 'paid', occurrenceId: 'occ_2', email: null, channel: 'door' });
  const result = await cancelOccurrence(db, {
    organizationId: 'org_1',
    eventId: 'evt_1',
    occurrenceId: 'occ_2',
    now: PAID_NOW + 60,
  });
  assert.deepEqual(
    result.ordersToRefund.map((o) => [o.orderId, o.buyerEmail, o.paymentMethod]),
    [['ord_3', null, 'cash']],
  );
  const statuses = d1.sqlite.prepare('SELECT id, status FROM orders ORDER BY id').all() as Array<{
    id: string;
    status: string;
  }>;
  assert.deepEqual(
    statuses.map((r) => [r.id, r.status]),
    [
      ['ord_1', 'pending'],
      ['ord_2', 'canceled'],
      ['ord_3', 'paid'],
    ],
  );
  const taken = d1.sqlite
    .prepare(
      "SELECT occurrence_id AS o, online_taken AS n FROM ticket_inventory WHERE ticket_type_id = 'tty_general_1' ORDER BY o",
    )
    .all() as Array<{ o: string; n: number }>;
  assert.deepEqual(
    taken.map((r) => [r.o, r.n]),
    [
      ['occ_1', 1],
      ['occ_2', 0],
    ],
  );
});

test('approving a paid event needs a verified organization; the review card reads the paid details', async () => {
  const { d1, db } = await paidDatabase();
  d1.sqlite.exec("UPDATE organizations SET first_paid_event_approved_at = NULL WHERE id = 'org_1'");
  const paid = await saveEvent(db, {
    organizationId: 'org_1',
    input: PAID_FORM,
    submit: true,
    now: PAID_NOW,
  });
  const pending = (await listPendingEvents(db)).find((e) => e.id === paid.eventId);
  assert.equal(pending?.reason, 'first_paid_event');
  d1.sqlite.exec(
    "UPDATE organizations SET verified_at = NULL, verification_status = 'none' WHERE id = 'org_1'",
  );
  await assert.rejects(
    reviewLiveEvent(db, { eventId: paid.eventId, decision: 'approved', now: PAID_NOW + 1 }),
    (e) => e instanceof LiveAdminError && e.code === 'not_verified',
  );
  const details = await paidEventReviewDetails(db, 'evt_1');
  assert.equal(details?.feePayer, 'buyer');
  assert.equal(details?.doorSalesEnabled, true);
  assert.equal(details?.giftsEnabled, false);
  assert.equal(details?.policies?.refundPolicy, 'until_hours_before');
  assert.deepEqual(
    details?.ticketTypes.map((t) => [t.name, t.priceCents, t.capacity, t.doorAllocation]),
    [
      ['General', 2000, 100, 0],
      ['VIP', 5000, 10, 2],
    ],
  );
  assert.equal(await paidEventReviewDetails(db, paid.eventId), null, 'nothing set up yet');
});
