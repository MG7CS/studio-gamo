import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createSqliteD1 } from '@gamo/db/testing';
import {
  cancelEvent,
  cancelRegistrationForOrganizer,
  checkInForOrganizer,
  getCheckInOccurrence,
  csvCell,
  expandOccurrences,
  getOrganizerEvent,
  listEventRegistrations,
  listOrganizerEvents,
  registrationsCsv,
  reviewRuleFor,
  saveEvent,
  submitEvent,
  validateEvent,
  type EventFormValues,
} from './events.ts';
import { OrganizerError } from './organizers.ts';
import { confirmRegistration, startRegistration } from './registration.ts';

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
  assert.equal(invalid({ endTime: '17:00' }), 'invalid:endTime');
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

test('editing a published event goes back to review when the rule asks for it; other organizations cannot touch it', async () => {
  const { d1, db } = await database();
  d1.sqlite.exec("UPDATE organizations SET first_event_approved_at = 1 WHERE id = 'org_1'");
  const created = await saveEvent(db, { organizationId: 'org_1', input: FORM, submit: true, now: NOW });
  assert.equal(created.status, 'published');
  const edit = (title: string, org = 'org_1') =>
    saveEvent(db, {
      organizationId: org,
      eventId: created.eventId,
      input: { ...FORM, title },
      submit: false,
      now: NOW + 1,
    });
  assert.equal((await edit('Renamed')).status, 'published');
  await assert.rejects(edit('Hijack', 'org_2'), (e) => codeOf(e) === 'not_found');
  d1.sqlite.exec("UPDATE organizations SET review_every_event = 1 WHERE id = 'org_1'");
  assert.equal((await edit('Renamed again')).status, 'pending_review');
  assert.equal((await getOrganizerEvent(db, 'org_1', created.eventId))?.values.title, 'Renamed again');
  assert.equal(await getOrganizerEvent(db, 'org_2', created.eventId), null);
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
  const ok = await saveEvent(db, { organizationId: 'org_1', input: FORM, submit: false, now: NOW });
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
  const occ = (await getOrganizerEvent(db, 'org_1', created.eventId))!.occurrences[0];
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
  const after = (await getOrganizerEvent(db, 'org_1', created.eventId))!;
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
  const occ = (await getOrganizerEvent(db, 'org_1', created.eventId))!.occurrences[0];
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
  const occ = (await getOrganizerEvent(db, 'org_1', created.eventId))!.occurrences[0];
  const reg = await startRegistration(db, ENV, {
    occurrenceId: occ.id,
    name: '=HYPERLINK("http://evil")',
    email: 'x@example.org',
    partySize: 1,
    termsVersion: 'v1',
    now: NOW,
  });
  await confirmRegistration(db, ENV, { registrationId: reg.registrationId, code: reg.code, now: NOW + 5 });
  assert.equal((await listEventRegistrations(db, 'org_1', created.eventId)).length, 1);
  assert.equal((await listEventRegistrations(db, 'org_2', created.eventId)).length, 0);
  assert.equal((await listEventRegistrations(db, 'org_1', created.eventId, { q: 'nobody' })).length, 0);
  const csv = registrationsCsv(await listEventRegistrations(db, 'org_1', created.eventId), 'America/Phoenix');
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
  const occ = (await getOrganizerEvent(db, 'org_1', withQr.eventId))!.occurrences[0];
  const plain = (await getOrganizerEvent(db, 'org_1', withoutQr.eventId))!.occurrences[0];
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
  const door = (organizationId: string, occurrenceId: string, code: string, now = NOW + 100) =>
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
  assert.deepEqual(await door('org_1', occ.id, confirmed.checkinCode!, NOW + 200), {
    ok: false,
    reason: 'already_admitted',
    name: 'Sam',
    checkedInAt: NOW + 100,
  });
  assert.equal((await getCheckInOccurrence(db, 'org_1', occ.id))?.checkedInPeople, 2);
  await cancelEvent(db, { organizationId: 'org_1', eventId: withQr.eventId, now: NOW + 300 });
  await assert.rejects(
    door('org_1', occ.id, confirmed.checkinCode!),
    (e) => codeOf(e) === 'not_found',
    'canceled dates do not check in',
  );
});
