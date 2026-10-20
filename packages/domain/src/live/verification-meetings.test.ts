import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PaidError } from './paid-types.ts';
import { PAID_NOW, paidTestDatabase, seedPaidEvent } from './paid-testing.ts';
import {
  adminVerificationView,
  cancelVerificationMeeting,
  declineVerification,
  listVerificationQueue,
  markVerificationMeetingHeld,
  organizationVerificationView,
  removeVerification,
  requestVerification,
  rescheduleVerificationMeeting,
  scheduleVerificationMeeting,
  validateMeeting,
  verifyOrganization,
  type MeetingInput,
} from './verification-meetings.ts';
import { meetingScheduledEmail, verificationRequestedEmail } from './verification-mail.ts';

const NOW = PAID_NOW;
/** 10 November 2026, 15:00 in Phoenix (UTC−7) = 22:00 UTC. */
const MEETING: MeetingInput = {
  date: '2026-11-10',
  time: '15:00',
  timeZone: 'America/Phoenix',
  format: 'video',
  location: 'https://meet.example.org/gamo-grace',
  note: 'Bring a short description of your ministry.',
};
const MEETING_AT = Date.UTC(2026, 10, 10, 22) / 1000;

async function setup() {
  const { d1, db: raw } = await paidTestDatabase();
  seedPaidEvent(d1, { verified: false });
  // A second owner and a member who is not an owner.
  d1.sqlite.exec(`
    INSERT INTO organizers (id, clerk_user_id, email, display_name) VALUES ('usr_2', 'clerk_2', 'second@example.org', 'Second'),
                                                                        ('usr_3', 'clerk_3', 'member@example.org', 'Member');
    INSERT INTO memberships (organization_id, organizer_id, role) VALUES ('org_1', 'usr_2', 'owner'), ('org_1', 'usr_3', 'member');
  `);
  const db = raw as never;
  const status = () =>
    (
      d1.sqlite
        .prepare("SELECT verification_status AS s, verified_at AS v FROM organizations WHERE id = 'org_1'")
        .get() as {
        s: string;
        v: number | null;
      }
    ).s;
  return { d1, db, status };
}

const code = (e: unknown) =>
  e instanceof PaidError ? `${e.code}${e.detail ? `:${e.detail}` : ''}` : String(e);

test('the whole path: an owner requests, Gamo schedules, holds the meeting and verifies; owners are emailed each step', async () => {
  const { d1, db, status } = await setup();
  await assert.rejects(
    requestVerification(db, { organizationId: 'org_1', organizerId: 'usr_3', now: NOW }),
    (e) => code(e) === 'forbidden',
    'only owners request',
  );
  const requested = await requestVerification(db, {
    organizationId: 'org_1',
    organizerId: 'usr_1',
    now: NOW,
  });
  assert.equal(status(), 'requested');
  assert.deepEqual(requested.ownerEmails.sort(), ['owner1@example.org', 'second@example.org']);
  assert.equal(requested.emails.length, 2);
  assert.match(requested.emails[0].subject, /Verification requested/);
  await assert.rejects(
    requestVerification(db, { organizationId: 'org_1', organizerId: 'usr_1', now: NOW }),
    (e) => code(e) === 'already_done',
  );

  const scheduled = await scheduleVerificationMeeting(db, {
    organizationId: 'org_1',
    meeting: MEETING,
    now: NOW + 10,
  });
  assert.equal(status(), 'meeting_scheduled');
  assert.equal(scheduled.meeting?.startsAt, MEETING_AT);
  assert.equal(scheduled.meeting?.format, 'video');
  const mail = scheduled.emails[0];
  assert.match(mail.text, /When: Tuesday, November 10, 2026(,| at) 3:00\sPM MST \(America\/Phoenix\)/);
  assert.match(mail.text, /How: Video call/);
  assert.match(mail.text, /Link: https:\/\/meet\.example\.org\/gamo-grace/);

  await assert.rejects(
    markVerificationMeetingHeld(db, { organizationId: 'org_1', now: MEETING_AT - 60 }),
    (e) => code(e) === 'invalid:meeting_not_started',
    'a meeting cannot be held before it starts',
  );
  const held = await markVerificationMeetingHeld(db, { organizationId: 'org_1', now: MEETING_AT + 3600 });
  assert.equal(status(), 'meeting_held');
  assert.equal(held.meeting?.status, 'held');
  assert.match(held.emails[0].subject, /Thank you for meeting/);

  await assert.rejects(
    verifyOrganization(db, { organizationId: 'org_1', note: '  ', now: MEETING_AT + 4000 }),
    (e) => code(e) === 'invalid:note_required',
  );
  const verified = await verifyOrganization(db, {
    organizationId: 'org_1',
    note: 'Met the pastor and the worship team.',
    now: MEETING_AT + 4000,
  });
  assert.equal(status(), 'verified');
  assert.equal(
    (
      d1.sqlite.prepare("SELECT verified_at AS v FROM organizations WHERE id = 'org_1'").get() as {
        v: number;
      }
    ).v,
    MEETING_AT + 4000,
  );
  assert.match(verified.emails[0].text, /Met the pastor/);

  const history = await adminVerificationView(db, 'org_1', MEETING_AT + 5000);
  assert.deepEqual(history.decisions.map((d) => d.decision).reverse(), [
    'verification_requested',
    'meeting_scheduled',
    'meeting_held',
    'verified',
  ]);
  assert.deepEqual(history.actions, ['remove']);
  assert.equal(history.meetings.length, 1);
});

test('verifying is refused without a held meeting', async () => {
  const { db, status } = await setup();
  const verify = () =>
    verifyOrganization(db, { organizationId: 'org_1', note: 'Looks fine.', now: NOW + 50 });
  await assert.rejects(verify(), (e) => code(e) === 'invalid:meeting_not_held', 'never requested');
  await requestVerification(db, { organizationId: 'org_1', organizerId: 'usr_1', now: NOW });
  await assert.rejects(verify(), (e) => code(e) === 'invalid:meeting_not_held', 'requested only');
  await scheduleVerificationMeeting(db, { organizationId: 'org_1', meeting: MEETING, now: NOW + 10 });
  await assert.rejects(verify(), (e) => code(e) === 'invalid:meeting_not_held', 'scheduled, not held');
  assert.equal(status(), 'meeting_scheduled');
});

test('one scheduled meeting at a time; rescheduling cancels the old one and keeps a single scheduled meeting', async () => {
  const { d1, db } = await setup();
  await requestVerification(db, { organizationId: 'org_1', organizerId: 'usr_1', now: NOW });
  await scheduleVerificationMeeting(db, { organizationId: 'org_1', meeting: MEETING, now: NOW + 10 });
  await assert.rejects(
    scheduleVerificationMeeting(db, { organizationId: 'org_1', meeting: MEETING, now: NOW + 20 }),
    (e) => code(e).startsWith('stale'),
  );
  assert.throws(
    () =>
      d1.sqlite.exec(
        `INSERT INTO verification_meetings (id, subject_type, subject_id, starts_at, timezone, format, location)
         VALUES ('vmt_x', 'organization', 'org_1', ${MEETING_AT}, 'UTC', 'video', 'x')`,
      ),
    /UNIQUE/,
    'the database refuses a second scheduled meeting too',
  );
  const moved = await rescheduleVerificationMeeting(db, {
    organizationId: 'org_1',
    meeting: {
      ...MEETING,
      date: '2026-11-12',
      format: 'in_person',
      location: 'Grace Hall, 1 Main St, Phoenix',
    },
    now: NOW + 30,
  });
  assert.match(moved.emails[0].subject, /rescheduled/);
  assert.match(moved.emails[0].text, /Place: Grace Hall/);
  const meetings = d1.sqlite
    .prepare(
      "SELECT status, format FROM verification_meetings WHERE subject_id = 'org_1' ORDER BY created_at, rowid",
    )
    .all() as Array<{ status: string; format: string }>;
  assert.deepEqual(
    meetings.map((m) => [m.status, m.format]),
    [
      ['canceled', 'video'],
      ['scheduled', 'in_person'],
    ],
  );
});

test('two admin decisions on one verification cannot both win', async () => {
  const { d1, db, status } = await setup();
  await requestVerification(db, { organizationId: 'org_1', organizerId: 'usr_1', now: NOW });
  // Two schedules at once: one meeting.
  const schedules = await Promise.allSettled([
    scheduleVerificationMeeting(db, { organizationId: 'org_1', meeting: MEETING, now: NOW + 10 }),
    scheduleVerificationMeeting(db, {
      organizationId: 'org_1',
      meeting: { ...MEETING, time: '16:00' },
      now: NOW + 10,
    }),
  ]);
  assert.equal(schedules.filter((r) => r.status === 'fulfilled').length, 1);
  const lost = schedules.find((r) => r.status === 'rejected') as PromiseRejectedResult;
  assert.equal(code(lost.reason).split(':')[0], 'stale');
  assert.equal(
    (
      d1.sqlite
        .prepare("SELECT COUNT(*) AS n FROM verification_meetings WHERE subject_id = 'org_1'")
        .get() as { n: number }
    ).n,
    1,
  );
  await markVerificationMeetingHeld(db, { organizationId: 'org_1', now: MEETING_AT + 7200 });
  // Verify and decline at once: exactly one decision is recorded, the other is stale.
  const decisions = await Promise.allSettled([
    verifyOrganization(db, { organizationId: 'org_1', note: 'Verified.', now: MEETING_AT + 8000 }),
    declineVerification(db, { organizationId: 'org_1', note: 'Declined.', now: MEETING_AT + 8000 }),
  ]);
  assert.equal(decisions.filter((r) => r.status === 'fulfilled').length, 1);
  const loser = decisions.find((r) => r.status === 'rejected') as PromiseRejectedResult;
  assert.equal(code(loser.reason), 'stale');
  const recorded = d1.sqlite
    .prepare(
      "SELECT decision FROM review_decisions WHERE subject_id = 'org_1' AND decision IN ('verified', 'declined')",
    )
    .all() as Array<{ decision: string }>;
  assert.equal(recorded.length, 1);
  assert.equal(status(), recorded[0].decision === 'verified' ? 'verified' : 'declined');
});

test('cancel returns to "requested"; decline needs a note and lets the owners ask again; removal goes back to none', async () => {
  const { d1, db, status } = await setup();
  await requestVerification(db, { organizationId: 'org_1', organizerId: 'usr_1', now: NOW });
  await scheduleVerificationMeeting(db, { organizationId: 'org_1', meeting: MEETING, now: NOW + 10 });
  const canceled = await cancelVerificationMeeting(db, {
    organizationId: 'org_1',
    note: 'The pastor is away.',
    now: NOW + 20,
  });
  assert.equal(status(), 'requested');
  assert.equal(canceled.meeting?.status, 'canceled');
  assert.match(canceled.emails[0].text, /request stays open/);
  await assert.rejects(
    declineVerification(db, { organizationId: 'org_1', note: '', now: NOW + 30 }),
    (e) => code(e) === 'invalid:note_required',
  );
  const declined = await declineVerification(db, {
    organizationId: 'org_1',
    note: 'We could not confirm the organization.',
    now: NOW + 30,
  });
  assert.equal(status(), 'declined');
  assert.match(declined.emails[0].text, /could not confirm/);
  const view = await organizationVerificationView(db, 'org_1');
  assert.equal(view.canRequest, true);
  assert.equal(view.declineNote, 'We could not confirm the organization.');
  await requestVerification(db, { organizationId: 'org_1', organizerId: 'usr_2', now: NOW + 40 });
  assert.equal(status(), 'requested');

  d1.sqlite.exec(
    "UPDATE organizations SET verification_status = 'verified', verified_at = 1 WHERE id = 'org_1'",
  );
  await assert.rejects(removeVerification(db, { organizationId: 'org_1', note: '', now: NOW }), (e) =>
    code(e).startsWith('invalid'),
  );
  const removed = await removeVerification(db, {
    organizationId: 'org_1',
    note: 'Leadership changed.',
    now: NOW + 50,
  });
  assert.equal(removed.status, 'none');
  assert.equal(status(), 'none');
  await assert.rejects(
    removeVerification(db, { organizationId: 'org_1', note: 'Again.', now: NOW + 60 }),
    (e) => code(e) === 'stale',
  );
});

test('a suspended organization cannot request verification', async () => {
  const { d1, db } = await setup();
  d1.sqlite.exec("UPDATE organizations SET status = 'suspended' WHERE id = 'org_1'");
  await assert.rejects(
    requestVerification(db, { organizationId: 'org_1', organizerId: 'usr_1', now: NOW }),
    (e) => code(e) === 'forbidden:suspended',
  );
  assert.equal((await organizationVerificationView(db, 'org_1')).canRequest, false);
});

test('meeting forms are checked field by field', () => {
  const bad = (patch: Partial<MeetingInput>, now = NOW) => {
    try {
      validateMeeting({ ...MEETING, ...patch }, now);
      return 'accepted';
    } catch (e) {
      return code(e);
    }
  };
  assert.equal(bad({}), 'accepted');
  assert.equal(bad({ timeZone: 'Mars/Olympus' }), 'invalid:timeZone');
  assert.equal(bad({ date: '2026-11-31' }), 'invalid:date', 'an impossible day is refused');
  assert.equal(bad({ date: '10/11/2026' }), 'invalid:date');
  assert.equal(bad({ time: '25:00' }), 'invalid:time');
  assert.equal(bad({}, MEETING_AT + 1), 'invalid:date', 'a meeting must be in the future');
  assert.equal(bad({ format: 'phone' }), 'invalid:format');
  assert.equal(bad({ location: ' ' }), 'invalid:location');
  assert.equal(bad({ location: 'x'.repeat(301) }), 'invalid:location');
  assert.equal(bad({ note: 'x'.repeat(501) }), 'invalid:note');
  assert.equal(validateMeeting({ ...MEETING, note: '  ' }, NOW).note, null);
});

test('the organizer card and the admin view say what is happening and what can be done', async () => {
  const { db } = await setup();
  let card = await organizationVerificationView(db, 'org_1');
  assert.deepEqual([card.status, card.canRequest, card.meeting], ['none', true, null]);
  await requestVerification(db, { organizationId: 'org_1', organizerId: 'usr_1', now: NOW });
  card = await organizationVerificationView(db, 'org_1');
  assert.deepEqual([card.status, card.canRequest, card.requestedAt], ['requested', false, NOW]);
  assert.deepEqual((await adminVerificationView(db, 'org_1', NOW)).actions, ['schedule', 'decline']);
  await scheduleVerificationMeeting(db, { organizationId: 'org_1', meeting: MEETING, now: NOW + 10 });
  card = await organizationVerificationView(db, 'org_1');
  assert.equal(card.meeting?.location, MEETING.location);
  assert.equal(card.meeting?.formatLabel, 'Video call');
  assert.deepEqual((await adminVerificationView(db, 'org_1', NOW + 20)).actions, [
    'reschedule',
    'cancel_meeting',
    'decline',
  ]);
  assert.deepEqual((await adminVerificationView(db, 'org_1', MEETING_AT)).actions, [
    'mark_held',
    'reschedule',
    'cancel_meeting',
    'decline',
  ]);
});

test('the verification queues list each status, soonest meeting first', async () => {
  const { d1, db } = await setup();
  seedPaidEvent(d1, { verified: false }, 'b');
  seedPaidEvent(d1, { verified: false }, 'c');
  for (const [org, owner] of [
    ['org_1', 'usr_1'],
    ['org_b', 'usr_b'],
    ['org_c', 'usr_c'],
  ])
    await requestVerification(db, { organizationId: org, organizerId: owner, now: NOW });
  await scheduleVerificationMeeting(db, {
    organizationId: 'org_b',
    meeting: { ...MEETING, date: '2026-11-20' },
    now: NOW + 5,
  });
  await scheduleVerificationMeeting(db, { organizationId: 'org_c', meeting: MEETING, now: NOW + 5 });
  await markVerificationMeetingHeld(db, { organizationId: 'org_c', now: MEETING_AT + 10 });
  const ids = async (status: 'requested' | 'meeting_scheduled' | 'meeting_held') =>
    (await listVerificationQueue(db, { status })).map((r) => r.organizationId);
  assert.deepEqual(await ids('requested'), ['org_1']);
  assert.deepEqual(await ids('meeting_scheduled'), ['org_b']);
  assert.deepEqual(await ids('meeting_held'), ['org_c']);
  const held = (await listVerificationQueue(db, { status: 'meeting_held' }))[0];
  assert.equal(held.meeting?.startsAt, MEETING_AT);
});

test('verification emails keep the organization name from carrying a link', () => {
  const email = verificationRequestedEmail('owner@example.org', 'Grace www.evil.com Church');
  assert.doesNotMatch(email.subject + email.text, /www\.evil\.com/);
  const scheduled = meetingScheduledEmail('owner@example.org', 'Grace', {
    startsAt: MEETING_AT,
    timeZone: 'America/New_York',
    format: 'in_person',
    location: 'Fellowship Hall\n2 Main St',
    note: null,
  });
  assert.match(scheduled.text, /5:00\sPM EST \(America\/New_York\)/);
  assert.match(scheduled.text, /Place: Fellowship Hall 2 Main St/);
  assert.match(scheduled.text, /How: In person/);
});
