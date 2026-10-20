import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createSqliteD1 } from '@gamo/db/testing';
import { createOrganization, resolveOrganizerSession, startOrganizerSession } from './organizers.ts';
import {
  endOtherSessions,
  exportOrganizerData,
  listOrganizerSessions,
  updateOrganizerSettings,
  validateSettings,
} from './settings.ts';

const MIGRATIONS = new URL('../../../db/live/migrations/', import.meta.url);
const NOW = 1_900_000_000;

async function database() {
  const d1 = createSqliteD1();
  for (const name of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await d1.exec(readFileSync(new URL(name, MIGRATIONS), 'utf8'));
  return d1 as never;
}

const signIn = (db: never, displayName: string | null, now = NOW) =>
  startOrganizerSession(db, { clerkUserId: 'user_ana', email: 'ana@example.org', displayName, now });

test('validateSettings cleans the name and accepts only known time zones', () => {
  const ok = validateSettings({ displayName: '  Ana \n  Reyes\u0007 ', timezone: 'America/Denver' });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.values.displayName, 'Ana Reyes');
  assert.equal(validateSettings({ displayName: 'Ana', timezone: '' }).errors.timezone, undefined);
  assert.ok(validateSettings({ displayName: '   ', timezone: '' }).errors.displayName);
  assert.ok(validateSettings({ displayName: 'x'.repeat(81), timezone: '' }).errors.displayName);
  assert.ok(validateSettings({ displayName: 'Ana', timezone: 'Mars/Olympus' }).errors.timezone);
});

test('a name saved in settings survives the next sign-in; an untouched name still follows the sign-in', async () => {
  const db = await database();
  const first = await signIn(db, 'Ana R');
  const again = await signIn(db, 'Ana Reyes', NOW + 10);
  assert.equal(again.organizer.displayName, 'Ana Reyes', 'not edited yet: follows the identity provider');

  await updateOrganizerSettings(db, {
    organizerId: first.organizer.id,
    values: { displayName: 'Pastor Ana', timezone: 'America/Chicago' },
  });
  const third = await signIn(db, 'Ana Reyes', NOW + 20);
  assert.equal(third.organizer.displayName, 'Pastor Ana');
  assert.equal(third.organizer.timezone, 'America/Chicago');
  const viaSession = await resolveOrganizerSession(db, third.token, NOW + 21);
  assert.equal(viaSession?.timezone, 'America/Chicago');

  await updateOrganizerSettings(db, {
    organizerId: first.organizer.id,
    values: { displayName: 'Pastor Ana', timezone: '' },
  });
  assert.equal((await resolveOrganizerSession(db, third.token, NOW + 22))?.timezone, null);
});

test('sessions list marks this device; signing out other devices keeps only this one', async () => {
  const db = await database();
  const phone = await signIn(db, 'Ana', NOW);
  const laptop = await signIn(db, 'Ana', NOW + 60);
  const id = phone.organizer.id;
  const list = await listOrganizerSessions(db, id, laptop.token, NOW + 100);
  assert.equal(list.length, 2);
  assert.deepEqual(
    list.map((s) => s.current),
    [true, false],
    'newest first; only the laptop is current',
  );
  assert.equal(await endOtherSessions(db, id, laptop.token), 1);
  assert.equal(await resolveOrganizerSession(db, phone.token, NOW + 101), null);
  assert.ok(await resolveOrganizerSession(db, laptop.token, NOW + 101));
  assert.equal(await endOtherSessions(db, id, null), 0, 'without a current session nothing is ended');
});

test('another person is never touched', async () => {
  const db = await database();
  const ana = await signIn(db, 'Ana');
  const ben = await startOrganizerSession(db, {
    clerkUserId: 'user_ben',
    email: 'ben@example.org',
    displayName: 'Ben',
    now: NOW,
  });
  assert.equal(await endOtherSessions(db, ana.organizer.id, ana.token), 0);
  assert.ok(await resolveOrganizerSession(db, ben.token, NOW + 1));
  await updateOrganizerSettings(db, {
    organizerId: ana.organizer.id,
    values: { displayName: 'Ana 2', timezone: '' },
  });
  assert.equal((await resolveOrganizerSession(db, ben.token, NOW + 1))?.displayName, 'Ben');
});

test('the data export holds only the person: account, organizations and how many devices', async () => {
  const db = await database();
  const ana = await signIn(db, 'Ana');
  await createOrganization(db, {
    organizerId: ana.organizer.id,
    profile: { name: 'Grace Fellowship', kind: 'church', city: 'Phoenix', state: 'AZ' },
    termsVersion: 'test',
    now: NOW,
  });
  const data = await exportOrganizerData(db, ana.organizer.id, NOW + 5);
  assert.equal(data?.account.email, 'ana@example.org');
  assert.equal(data?.account.name, 'Ana');
  assert.deepEqual(
    data?.organizations.map((o) => [o.name, o.role]),
    [['Grace Fellowship', 'owner']],
  );
  assert.equal(data?.signedInDevices, 1);
  assert.equal(await exportOrganizerData(db, 'usr_missing', NOW), null);
  const text = JSON.stringify(data);
  assert.ok(!/token|clerk|hash/i.test(text), 'no internal identifiers or secrets');
});
