import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSqliteD1 } from '@gamo/db/testing';
import {
  cancelRegistration,
  checkIn,
  confirmRegistration,
  getRegistration,
  MAX_CODE_ATTEMPTS,
  recoverRegistration,
  RegistrationError,
  signManageToken,
  startRegistration,
  verifyManageToken,
} from './registration.ts';

const MIGRATION = new URL('../../../db/live/migrations/0001_live_core.sql', import.meta.url);
const ENV = { ENVIRONMENT: 'local' };
const NOW = 1_900_000_000;
const TERMS = 'site-terms-draft-1';

/** A published free-registration event with one occurrence a week away. */
async function setup(opts: { capacity?: number | null; qr?: boolean; startsAt?: number } = {}) {
  const d1 = createSqliteD1();
  await d1.exec(readFileSync(MIGRATION, 'utf8'));
  const db = d1 as never;
  d1.sqlite.exec(`
    INSERT INTO organizations (id, name, slug, kind) VALUES ('org_1', 'Sample Church', 'sample-church', 'church');
    INSERT INTO venues (id, name, city, state, timezone) VALUES ('ven_1', 'Sample Hall', 'Phoenix', 'AZ', 'America/Phoenix');
    INSERT INTO events (id, organization_id, origin, slug, title, category, venue_id, timezone, admission, capacity, qr_checkin, status)
      VALUES ('evt_1', 'org_1', 'organizer', 'sample', 'Sample night', 'worship', 'ven_1', 'America/Phoenix',
              'free_registration', ${opts.capacity === undefined ? 10 : (opts.capacity ?? 'NULL')}, ${opts.qr ? 1 : 0}, 'published');
    INSERT INTO event_occurrences (id, event_id, starts_at) VALUES ('occ_1', 'evt_1', ${opts.startsAt ?? NOW + 7 * 86400});
  `);
  const seats = () =>
    (
      d1.sqlite.prepare("SELECT seats_taken AS n FROM event_occurrences WHERE id = 'occ_1'").get() as {
        n: number;
      }
    ).n;
  const register = (email: string, partySize = 1, now = NOW) =>
    startRegistration(db, ENV, {
      occurrenceId: 'occ_1',
      name: 'Sample Person',
      email,
      partySize,
      termsVersion: TERMS,
      now,
    });
  return { d1, db, seats, register };
}

const codeOf = (error: unknown) => (error instanceof RegistrationError ? error.code : String(error));

test('a registration holds seats until confirmed, then is confirmed with the emailed code', async () => {
  const { db, seats, register } = await setup();
  const r = await register('a@example.org', 2);
  assert.equal(seats(), 2);
  assert.match(r.code, /^\d{6}$/);
  const confirmed = await confirmRegistration(db, ENV, {
    registrationId: r.registrationId,
    code: r.code,
    now: NOW + 60,
  });
  assert.equal(confirmed.checkinCode, null, 'no QR code unless the event turned it on');
  assert.equal((await getRegistration(db, r.registrationId))?.status, 'confirmed');
  assert.equal(await verifyManageToken(ENV, confirmed.manageToken, NOW + 60), r.registrationId);
});

test('capacity is never oversold, including under concurrent sign-ups', async () => {
  const { seats, register } = await setup({ capacity: 3 });
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, (_, i) => register(`p${i}@example.org`, 1)),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 3);
  assert.ok(
    results
      .filter((r) => r.status === 'rejected')
      .every((r) => codeOf((r as PromiseRejectedResult).reason) === 'full'),
  );
  assert.equal(seats(), 3);
  await assert.rejects(register('late@example.org', 1), (e) => codeOf(e) === 'full');
});

test('a party larger than the remaining seats is refused and takes none', async () => {
  const { seats, register } = await setup({ capacity: 4 });
  await register('a@example.org', 3);
  await assert.rejects(register('b@example.org', 2), (e) => codeOf(e) === 'full');
  assert.equal(seats(), 3);
});

test('the same person cannot register twice for an occurrence and the failed attempt reserves nothing', async () => {
  const { seats, register } = await setup();
  await register('dup@example.org', 2);
  await assert.rejects(register('DUP@example.org', 3), (e) => codeOf(e) === 'duplicate');
  assert.equal(seats(), 2);
});

test('expired holds give their seats back to the next person', async () => {
  const { seats, register } = await setup({ capacity: 2 });
  await register('a@example.org', 2);
  await assert.rejects(register('b@example.org', 1, NOW + 60), (e) => codeOf(e) === 'full');
  await register('b@example.org', 1, NOW + 16 * 60);
  assert.equal(seats(), 1);
});

test('five wrong codes lock the registration; the right code afterwards does not work', async () => {
  const { db, register } = await setup();
  const r = await register('a@example.org');
  const wrong = r.code === '000000' ? '111111' : '000000';
  for (let i = 1; i <= MAX_CODE_ATTEMPTS; i++) {
    await assert.rejects(
      confirmRegistration(db, ENV, { registrationId: r.registrationId, code: wrong, now: NOW + i }),
      (e) =>
        e instanceof RegistrationError && e.code === 'wrong_code' && e.attemptsLeft === MAX_CODE_ATTEMPTS - i,
    );
  }
  await assert.rejects(
    confirmRegistration(db, ENV, { registrationId: r.registrationId, code: r.code, now: NOW + 10 }),
    (e) => codeOf(e) === 'locked',
  );
});

test('a code does not confirm after the hold expired', async () => {
  const { db, register } = await setup();
  const r = await register('a@example.org');
  await assert.rejects(
    confirmRegistration(db, ENV, { registrationId: r.registrationId, code: r.code, now: NOW + 16 * 60 }),
    (e) => codeOf(e) === 'expired',
  );
});

test('past occurrences, draft events and unsuspended-only rules close registration on the server', async () => {
  const past = await setup({ startsAt: NOW - 60 });
  await assert.rejects(past.register('a@example.org'), (e) => codeOf(e) === 'closed_past');
  const draft = await setup();
  draft.d1.sqlite.exec("UPDATE events SET status = 'draft'");
  await assert.rejects(draft.register('a@example.org'), (e) => codeOf(e) === 'not_found');
  const suspended = await setup();
  suspended.d1.sqlite.exec("UPDATE organizations SET status = 'suspended'");
  await assert.rejects(suspended.register('a@example.org'), (e) => codeOf(e) === 'not_found');
  const big = await setup();
  await assert.rejects(big.register('a@example.org', 99), (e) => codeOf(e) === 'invalid');
});

test('cancelling returns the seats once and a second cancel is refused', async () => {
  const { db, seats, register } = await setup();
  const r = await register('a@example.org', 3);
  assert.equal(seats(), 3);
  await cancelRegistration(db, r.registrationId, NOW + 5);
  assert.equal(seats(), 0);
  await assert.rejects(
    cancelRegistration(db, r.registrationId, NOW + 6),
    (e) => codeOf(e) === 'already_canceled',
  );
  assert.equal(seats(), 0);
});

test('manage links are signed, expire and cannot be altered', async () => {
  const token = await signManageToken(ENV, 'reg_' + 'a'.repeat(26), NOW + 100);
  assert.equal(await verifyManageToken(ENV, token, NOW), 'reg_' + 'a'.repeat(26));
  assert.equal(await verifyManageToken(ENV, token, NOW + 100), null, 'expired');
  assert.equal(await verifyManageToken(ENV, token.replace('aaaa', 'aaab'), NOW), null, 'tampered');
  assert.equal(await verifyManageToken(ENV, 'not-a-token', NOW), null);
});

test('QR events: confirmation derives a check-in code and the first scan wins', async () => {
  const { db, register } = await setup({ qr: true });
  const r = await register('a@example.org', 2);
  const c = await confirmRegistration(db, ENV, {
    registrationId: r.registrationId,
    code: r.code,
    now: NOW + 1,
  });
  assert.match(c.checkinCode ?? '', /^[0-9A-Z]{10}$/);
  const first = await checkIn(db, {
    occurrenceId: 'occ_1',
    code: c.checkinCode!.toLowerCase(),
    now: NOW + 100,
  });
  assert.deepEqual(first, { ok: true, name: 'Sample Person', partySize: 2 });
  const again = await checkIn(db, { occurrenceId: 'occ_1', code: `GL1.${c.checkinCode}`, now: NOW + 200 });
  assert.deepEqual(again, {
    ok: false,
    reason: 'already_admitted',
    name: 'Sample Person',
    checkedInAt: NOW + 100,
  });
  assert.deepEqual(await checkIn(db, { occurrenceId: 'occ_1', code: 'ZZZZZZZZZZ', now: NOW }), {
    ok: false,
    reason: 'unknown_code',
  });
});

test('a cancelled registration cannot be checked in', async () => {
  const { db, register } = await setup({ qr: true });
  const r = await register('a@example.org');
  const c = await confirmRegistration(db, ENV, {
    registrationId: r.registrationId,
    code: r.code,
    now: NOW + 1,
  });
  await cancelRegistration(db, r.registrationId, NOW + 2);
  const res = await checkIn(db, { occurrenceId: 'occ_1', code: c.checkinCode!, now: NOW + 3 });
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.reason, 'canceled');
});

test('a repeated sign-up can recover the manage link of a confirmed registration, rate limited, and nothing for strangers', async () => {
  const { db, register } = await setup({ qr: true });
  const r = await register('Lost@Example.org', 2);
  await confirmRegistration(db, ENV, { registrationId: r.registrationId, code: r.code, now: NOW + 60 });
  const found = await recoverRegistration(db, ENV, {
    occurrenceId: 'occ_1',
    email: ' lost@example.org ',
    now: NOW + 120,
  });
  assert.equal(found?.registrationId, r.registrationId);
  assert.equal(await verifyManageToken(ENV, found!.manageToken, NOW + 120), r.registrationId);
  assert.match(found!.checkinCode ?? '', /^[0-9A-Z]{10}$/);
  assert.equal(
    await recoverRegistration(db, ENV, { occurrenceId: 'occ_1', email: 'nobody@example.org', now: NOW }),
    null,
  );
  for (let i = 0; i < 3; i++)
    await recoverRegistration(db, ENV, {
      occurrenceId: 'occ_1',
      email: 'lost@example.org',
      now: NOW + 130 + i,
    });
  assert.equal(
    await recoverRegistration(db, ENV, { occurrenceId: 'occ_1', email: 'lost@example.org', now: NOW + 200 }),
    null,
    'at most three links an hour per email',
  );
});
