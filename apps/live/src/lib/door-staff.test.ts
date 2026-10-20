import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEventStaffLink, revokeStaffLink } from '@gamo/domain';
import {
  DOOR_COOKIE_PREFIX,
  doorCookieHeader,
  doorCookieName,
  organizerDoorAccess,
  staffDoorAccess,
  staffEntry,
  submitPin,
} from './door-access';
import { handleStaffLink, staffDoorFor } from './door-staff';
import { NOW, PAID_ENV, doorFixture } from './door-testing';

async function withLink(permissions: string[] = ['check_in', 'sell']) {
  const fx = await doorFixture();
  const link = await createEventStaffLink(fx.db, PAID_ENV, {
    organizationId: fx.seed.organizationId,
    eventId: fx.seed.eventId,
    label: 'North door',
    permissions,
    createdBy: fx.seed.organizerId,
    now: NOW,
  });
  return { fx, link };
}

const wrongPin = (pin: string) => (pin === '000000' ? '111111' : '000000');

test('organizer access: only dates of the active organization', async () => {
  const fx = await doorFixture();
  assert.equal(fx.organizer.actor.kind, 'organizer');
  assert.equal(fx.organizer.organizer, true);
  assert.equal(
    await organizerDoorAccess(fx.db, {
      organizerId: 'usr_x',
      organizationId: 'org_other',
      occurrenceId: fx.seed.occurrenceId,
    }),
    null,
  );
});

test('device cookie: HttpOnly, SameSite=Strict, path /door/, Secure only on https; name hides the token', async () => {
  const name = await doorCookieName('tok');
  assert.ok(name.startsWith(DOOR_COOKIE_PREFIX));
  assert.ok(!name.includes('tok'));
  assert.equal(name, await doorCookieName('tok'));
  assert.notEqual(name, await doorCookieName('tok2'));
  assert.equal(
    doorCookieHeader('n', 'v', 60, true),
    'n=v; Path=/door/; HttpOnly; SameSite=Strict; Max-Age=60; Secure',
  );
  assert.equal(doorCookieHeader('n', '', 0, false), 'n=; Path=/door/; HttpOnly; SameSite=Strict; Max-Age=0');
});

test('PIN outcomes: malformed, wrong with tries left, locked after five, then right PIN signs in', async () => {
  const { fx, link } = await withLink();
  const base = { token: link.token, now: NOW };
  assert.deepEqual(await submitPin(fx.db, PAID_ENV, { ...base, pin: '12' }), {
    ok: false,
    message: 'Enter the 6-digit PIN you were given with the link.',
  });
  const first = await submitPin(fx.db, PAID_ENV, { ...base, pin: wrongPin(link.pin) });
  assert.equal(first.ok, false);
  assert.match(!first.ok ? first.message : '', /4 tries left/);
  for (let i = 0; i < 3; i++) await submitPin(fx.db, PAID_ENV, { ...base, pin: wrongPin(link.pin) });
  const fifth = await submitPin(fx.db, PAID_ENV, { ...base, pin: wrongPin(link.pin) });
  assert.match(!fifth.ok ? fifth.message : '', /locked/);
  const locked = await submitPin(fx.db, PAID_ENV, { ...base, pin: link.pin });
  assert.match(!locked.ok ? locked.message : '', /locked for about 15 minutes \(until /);
  const entry = await staffEntry(fx.db, PAID_ENV, { token: link.token, cookieValue: null, now: NOW });
  assert.equal(entry.kind, 'pin');
  assert.match(entry.kind === 'pin' ? (entry.lockedMessage ?? '') : '', /locked/);

  const later = await submitPin(fx.db, PAID_ENV, { token: link.token, pin: link.pin, now: NOW + 16 * 60 });
  assert.equal(later.ok, true);
  assert.equal(later.ok && later.cookieName, await doorCookieName(link.token));
});

test('revoked and unknown links explain themselves', async () => {
  const { fx, link } = await withLink();
  assert.deepEqual(await staffEntry(fx.db, PAID_ENV, { token: 'nope', cookieValue: null, now: NOW }), {
    kind: 'invalid',
  });
  await revokeStaffLink(fx.db, { organizationId: fx.seed.organizationId, linkId: link.linkId, now: NOW });
  const entry = await staffEntry(fx.db, PAID_ENV, { token: link.token, cookieValue: null, now: NOW });
  assert.deepEqual(entry, { kind: 'closed', reason: 'revoked', label: 'North door' });
  const pin = await submitPin(fx.db, PAID_ENV, { token: link.token, pin: link.pin, now: NOW });
  assert.match(!pin.ok ? pin.message : '', /turned off/);
});

test('signed in: the only date opens directly; the device acts with the link’s permissions on its event only', async () => {
  const { fx, link } = await withLink();
  const signed = await submitPin(fx.db, PAID_ENV, { token: link.token, pin: link.pin, now: NOW });
  assert.ok(signed.ok);
  const cookieValue = signed.ok ? signed.cookieValue : null;
  const entry = await staffEntry(fx.db, PAID_ENV, { token: link.token, cookieValue, now: NOW });
  assert.equal(entry.kind, 'ready');
  assert.equal(
    entry.kind === 'ready' && entry.redirect,
    `/door/${encodeURIComponent(link.token)}/${fx.seed.occurrenceId}`,
  );
  const access = await staffDoorAccess(fx.db, PAID_ENV, {
    token: link.token,
    cookieValue,
    occurrenceId: fx.seed.occurrenceId,
    now: NOW,
  });
  assert.equal(access?.actor.kind, 'staff');
  assert.deepEqual(access?.actor.kind === 'staff' && access.actor.permissions, {
    checkIn: true,
    sell: true,
    comp: false,
  });
  assert.equal(access?.organizer, false);
  assert.equal(
    await staffDoorAccess(fx.db, PAID_ENV, {
      token: link.token,
      cookieValue: 'forged',
      occurrenceId: fx.seed.occurrenceId,
      now: NOW,
    }),
    null,
  );
  assert.equal(
    await staffDoorAccess(fx.db, PAID_ENV, {
      token: link.token,
      cookieValue,
      occurrenceId: 'occ_other',
      now: NOW,
    }),
    null,
  );
  // Revoking the link signs the device out at once.
  await revokeStaffLink(fx.db, { organizationId: fx.seed.organizationId, linkId: link.linkId, now: NOW });
  assert.equal(
    await staffDoorAccess(fx.db, PAID_ENV, {
      token: link.token,
      cookieValue,
      occurrenceId: fx.seed.occurrenceId,
      now: NOW,
    }),
    null,
  );
});

const linkRequest = (token: string, init: RequestInit = {}) => {
  const request = new Request(`https://live.example/door/${encodeURIComponent(token)}`, init);
  return { request, url: new URL(request.url) };
};

test('the link page: a right PIN sets the device cookie and reloads; Leave clears it; cross-origin is refused', async () => {
  const { fx, link } = await withLink();
  const live = { db: fx.db, env: PAID_ENV };
  const form = (pairs: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(pairs)) f.set(k, v);
    return f;
  };
  const forged = await handleStaffLink(
    linkRequest(link.token, {
      method: 'POST',
      body: form({ pin: link.pin }),
      headers: { origin: 'https://evil.example' },
    }),
    live,
    { token: link.token, now: NOW },
  );
  assert.equal(forged.response?.status, 403);

  const wrong = await handleStaffLink(
    linkRequest(link.token, {
      method: 'POST',
      body: form({ pin: wrongPin(link.pin) }),
      headers: { origin: 'https://live.example' },
    }),
    live,
    { token: link.token, now: NOW },
  );
  assert.equal(wrong.response, null);
  assert.equal(wrong.response === null && wrong.status, 400);
  assert.match(wrong.response === null ? (wrong.pinError ?? '') : '', /tries left/);

  const ok = await handleStaffLink(
    linkRequest(link.token, {
      method: 'POST',
      body: form({ pin: link.pin }),
      headers: { origin: 'https://live.example' },
    }),
    live,
    { token: link.token, now: NOW },
  );
  assert.equal(ok.response?.status, 303);
  const setCookie = ok.response?.headers.get('set-cookie') ?? '';
  assert.match(setCookie, /Path=\/door\/; HttpOnly; SameSite=Strict; Max-Age=\d+; Secure/);
  assert.ok(!setCookie.includes(link.pin));
  const cookie = setCookie.split(';')[0];

  const page = await handleStaffLink(linkRequest(link.token, { headers: { cookie } }), live, {
    token: link.token,
    now: NOW,
  });
  assert.equal(page.response?.status, 303);
  assert.equal(
    page.response?.headers.get('location'),
    `/door/${encodeURIComponent(link.token)}/${fx.seed.occurrenceId}`,
  );
  const door = await staffDoorFor(linkRequest(link.token, { headers: { cookie } }), live, {
    token: link.token,
    occurrenceId: fx.seed.occurrenceId,
    now: NOW,
  });
  assert.ok('access' in door);

  const left = await handleStaffLink(
    linkRequest(link.token, {
      method: 'POST',
      body: form({ action: 'leave' }),
      headers: { origin: 'https://live.example', cookie },
    }),
    live,
    { token: link.token, now: NOW },
  );
  assert.match(left.response?.headers.get('set-cookie') ?? '', /Max-Age=0/);
  const after = await staffDoorFor(linkRequest(link.token, { headers: { cookie } }), live, {
    token: link.token,
    occurrenceId: fx.seed.occurrenceId,
    now: NOW,
  });
  assert.equal(
    'response' in after && after.response.headers.get('location'),
    `/door/${encodeURIComponent(link.token)}`,
  );
});
