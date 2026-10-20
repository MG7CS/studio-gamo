import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paidTestDatabase, PAID_ENV, PAID_NOW, seedPaidEvent } from './paid-testing.ts';
import { PaidError } from './paid-types.ts';
import {
  createStaffLink,
  endStaffDevice,
  enterPin,
  hasPermission,
  listStaffLinks,
  previewStaffLink,
  requirePermission,
  requireScope,
  resolveStaffDevice,
  revokeStaffLink,
  STAFF_LINK_GRACE_SECONDS,
  StaffPinError,
  staffPermissionsOf,
} from './staff-links.ts';

const IP = 'a'.repeat(64);

async function setup(permissions: string[] = ['check_in', 'sell']) {
  const { d1, db } = await paidTestDatabase();
  const seed = seedPaidEvent(d1);
  const scopeEndsAt = PAID_NOW + 30 * 86_400 + 3 * 3600;
  const link = await createStaffLink(db, PAID_ENV, {
    organizationId: seed.organizationId,
    scopeId: seed.eventId,
    scopeEndsAt,
    label: 'North door',
    permissions,
    createdBy: seed.organizerId,
    now: PAID_NOW,
  });
  return { d1, db, seed, link, scopeEndsAt };
}

const wrongPin = (pin: string) => String((Number(pin) + 1) % 1_000_000).padStart(6, '0');

async function rejects(p: Promise<unknown>, code: string): Promise<PaidError> {
  try {
    await p;
  } catch (error) {
    assert.ok(error instanceof PaidError, `expected PaidError, got ${String(error)}`);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail(`expected ${code}`);
}

test('permissions: comp needs sell, at least check in or sell, unknown names refused', () => {
  assert.deepEqual(staffPermissionsOf(['check_in']), { checkIn: true, sell: false, comp: false });
  assert.deepEqual(staffPermissionsOf(['sell', 'comp']), { checkIn: false, sell: true, comp: true });
  assert.throws(() => staffPermissionsOf(['comp']), PaidError);
  assert.throws(() => staffPermissionsOf(['check_in', 'comp']), PaidError);
  assert.throws(() => staffPermissionsOf([]), PaidError);
  assert.throws(() => staffPermissionsOf(['admin']), PaidError);
});

test('created link stores no secret in plain text and expires 12 hours after the last date', async () => {
  const { d1, link, scopeEndsAt } = await setup();
  assert.match(link.token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(link.pin, /^\d{6}$/);
  assert.equal(link.expiresAt, scopeEndsAt + STAFF_LINK_GRACE_SECONDS);
  const row = d1.sqlite.prepare('SELECT * FROM staff_links WHERE id = ?').get(link.linkId) as Record<
    string,
    unknown
  >;
  const text = JSON.stringify(row);
  assert.ok(!text.includes(link.token));
  assert.ok(!String(row.pin_hash).includes(link.pin));
  assert.notEqual(row.pin_salt, link.pin);
});

test('a link for a scope that already ended is refused', async () => {
  const { d1, db } = await paidTestDatabase();
  const seed = seedPaidEvent(d1);
  await rejects(
    createStaffLink(db, PAID_ENV, {
      organizationId: seed.organizationId,
      scopeId: seed.eventId,
      scopeEndsAt: PAID_NOW - STAFF_LINK_GRACE_SECONDS - 1,
      label: 'Late',
      permissions: ['check_in'],
      createdBy: null,
      now: PAID_NOW,
    }),
    'expired',
  );
});

test('the right PIN signs a device in; the device resolves with the link permissions', async () => {
  const { d1, db, seed, link } = await setup(['check_in', 'sell', 'comp']);
  const entered = await enterPin(db, PAID_ENV, {
    token: link.token,
    pin: link.pin,
    ipHash: IP,
    now: PAID_NOW,
  });
  assert.ok(entered.expiresAt <= PAID_NOW + 12 * 3600);
  const device = await resolveStaffDevice(db, { cookieValue: entered.cookieValue, now: PAID_NOW + 60 });
  assert.ok(device);
  assert.equal(device.scopeId, seed.eventId);
  assert.deepEqual(device.permissions, { checkIn: true, sell: true, comp: true });
  // The cookie is stored only as a hash.
  const rows = d1.sqlite.prepare('SELECT id FROM staff_devices').all() as Array<{ id: string }>;
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].id, entered.cookieValue);
  // After the device lifetime it no longer resolves.
  assert.equal(
    await resolveStaffDevice(db, { cookieValue: entered.cookieValue, now: entered.expiresAt }),
    null,
  );
  await endStaffDevice(db, { cookieValue: entered.cookieValue });
  assert.equal(await resolveStaffDevice(db, { cookieValue: entered.cookieValue, now: PAID_NOW + 60 }), null);
});

test('five wrong PINs lock the link for 15 minutes; it unlocks after and counts again from zero', async () => {
  const { db, link } = await setup();
  const bad = wrongPin(link.pin);
  for (let i = 1; i <= 4; i++) {
    const error = await rejects(
      enterPin(db, PAID_ENV, { token: link.token, pin: bad, ipHash: IP, now: PAID_NOW + i }),
      'wrong_pin',
    );
    assert.ok(error instanceof StaffPinError);
    assert.equal(error.attemptsLeft, 5 - i);
  }
  const locked = await rejects(
    enterPin(db, PAID_ENV, { token: link.token, pin: bad, ipHash: IP, now: PAID_NOW + 5 }),
    'locked',
  );
  assert.equal(locked.retryAfterSeconds, 15 * 60);
  // Even the right PIN is refused while locked.
  await rejects(
    enterPin(db, PAID_ENV, { token: link.token, pin: link.pin, ipHash: IP, now: PAID_NOW + 6 }),
    'locked',
  );
  const preview = await previewStaffLink(db, PAID_ENV, { token: link.token, now: PAID_NOW + 6 });
  assert.equal(preview?.state, 'locked');
  // After the lock: a wrong PIN counts as the first again.
  const after = PAID_NOW + 5 + 15 * 60;
  const again = await rejects(
    enterPin(db, PAID_ENV, { token: link.token, pin: bad, ipHash: IP, now: after }),
    'wrong_pin',
  );
  assert.equal((again as StaffPinError).attemptsLeft, 4);
  const ok = await enterPin(db, PAID_ENV, { token: link.token, pin: link.pin, ipHash: IP, now: after + 1 });
  assert.ok(ok.cookieValue);
});

test('per-IP limit: 20 PIN tries per 15 minutes', async () => {
  const { db, link } = await setup();
  const bad = wrongPin(link.pin);
  // Spread over links is not needed: the IP bucket counts every try, locked or not.
  for (let i = 0; i < 20; i++) {
    try {
      await enterPin(db, PAID_ENV, { token: link.token, pin: bad, ipHash: IP, now: PAID_NOW });
    } catch (error) {
      assert.ok(error instanceof PaidError && error.code !== 'rate_limited');
    }
  }
  await rejects(
    enterPin(db, PAID_ENV, { token: link.token, pin: link.pin, ipHash: IP, now: PAID_NOW }),
    'rate_limited',
  );
});

test('unknown and malformed tokens answer not_found', async () => {
  const { db } = await setup();
  await rejects(enterPin(db, PAID_ENV, { token: 'A'.repeat(43), pin: '123456', now: PAID_NOW }), 'not_found');
  await rejects(enterPin(db, PAID_ENV, { token: 'nope', pin: '123456', now: PAID_NOW }), 'not_found');
  assert.equal(await previewStaffLink(db, PAID_ENV, { token: 'nope', now: PAID_NOW }), null);
});

test('revoked and expired links are refused, and a device of a revoked link stops working', async () => {
  const { db, seed, link } = await setup();
  const entered = await enterPin(db, PAID_ENV, { token: link.token, pin: link.pin, now: PAID_NOW });
  assert.ok(await resolveStaffDevice(db, { cookieValue: entered.cookieValue, now: PAID_NOW + 1 }));

  // Expired: the right PIN after expiry.
  await rejects(enterPin(db, PAID_ENV, { token: link.token, pin: link.pin, now: link.expiresAt }), 'expired');
  assert.equal(await resolveStaffDevice(db, { cookieValue: entered.cookieValue, now: link.expiresAt }), null);

  // Another organization cannot revoke it.
  await rejects(
    revokeStaffLink(db, { organizationId: 'org_other', linkId: link.linkId, now: PAID_NOW }),
    'not_found',
  );
  assert.deepEqual(
    await revokeStaffLink(db, {
      organizationId: seed.organizationId,
      linkId: link.linkId,
      now: PAID_NOW + 2,
    }),
    {
      revoked: true,
    },
  );
  assert.deepEqual(
    await revokeStaffLink(db, {
      organizationId: seed.organizationId,
      linkId: link.linkId,
      now: PAID_NOW + 3,
    }),
    {
      revoked: false,
    },
  );
  assert.equal(await resolveStaffDevice(db, { cookieValue: entered.cookieValue, now: PAID_NOW + 3 }), null);
  const revoked = await rejects(
    enterPin(db, PAID_ENV, { token: link.token, pin: link.pin, now: PAID_NOW + 4 }),
    'forbidden',
  );
  assert.equal(revoked.detail, 'revoked');

  const [row] = await listStaffLinks(db, {
    organizationId: seed.organizationId,
    scopeId: seed.eventId,
    now: PAID_NOW + 4,
  });
  assert.equal(row.state, 'revoked');
  assert.equal(row.activeDevices, 0);
});

test('a device whose link is revoked directly in the database is refused on the next request', async () => {
  const { d1, db, link } = await setup();
  const entered = await enterPin(db, PAID_ENV, { token: link.token, pin: link.pin, now: PAID_NOW });
  d1.sqlite.exec(`UPDATE staff_links SET revoked_at = ${PAID_NOW + 1}`);
  assert.equal(await resolveStaffDevice(db, { cookieValue: entered.cookieValue, now: PAID_NOW + 2 }), null);
});

test('requirePermission and requireScope', async () => {
  const { db, seed, link } = await setup(['check_in']);
  const entered = await enterPin(db, PAID_ENV, { token: link.token, pin: link.pin, now: PAID_NOW });
  const device = await resolveStaffDevice(db, { cookieValue: entered.cookieValue, now: PAID_NOW });
  assert.ok(device);
  const actor = device.actor;
  assert.equal(hasPermission(actor, 'check_in'), true);
  assert.throws(
    () => requirePermission(actor, 'sell'),
    (e: unknown) => e instanceof PaidError && e.code === 'forbidden',
  );
  assert.throws(() => requirePermission(actor, 'comp'), PaidError);
  requireScope(actor, { organizationId: seed.organizationId, scopeId: seed.eventId });
  assert.throws(
    () => requireScope(actor, { organizationId: seed.organizationId, scopeId: 'evt_other' }),
    PaidError,
  );
  const organizer = {
    kind: 'organizer' as const,
    organizerId: seed.organizerId,
    organizationId: seed.organizationId,
  };
  requirePermission(organizer, 'comp');
  requireScope(organizer, { organizationId: seed.organizationId, scopeId: 'evt_any' });
  assert.throws(() => requireScope(organizer, { organizationId: 'org_2', scopeId: seed.eventId }), PaidError);
});
