import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SecretNotConfiguredError } from '../../security/crypto.ts';
import { verifySignedValue } from '../../security/signed-value.ts';
import {
  buildScannerCookies,
  createScannerSession,
  findScannerLink,
  listScannerSessions,
  readScannerDevice,
  revokeScannerSession,
  scannerSessionExpiresAt,
  unlockScannerSession,
  SCANNER_COOKIE_NAME,
  SCANNER_LINK_ENDED_MESSAGE,
  ScannerSessionError,
} from './scanner-sessions.ts';
import { createFixture, seedEvent, TEST_ENV } from './scanning-test-fixtures.ts';

const NOW = 1_900_000_000;
const HOUR = 3600;

function cookieRequest(value: string) {
  return new Request('https://live.example.test/api/scanner/scan', {
    headers: { cookie: `other=1; ${SCANNER_COOKIE_NAME}=${encodeURIComponent(value)}` },
  });
}

async function setup(startsAt = NOW + 2 * HOUR) {
  const f = await createFixture();
  const eventId = seedEvent(f, { startsAt, endsAt: startsAt + 3 * HOUR });
  return { f, eventId };
}

describe('scanner sessions (T-09)', () => {
  test('creates a session with the link token and PIN stored only as hashes', async () => {
    const { f, eventId } = await setup();
    const s = await createScannerSession(f.db, TEST_ENV, {
      eventId,
      label: 'Sample Gate A',
      allowedDirections: 'in',
      allowedZones: ['VIP'],
      canOverride: true,
      createdByUserId: 'usr_owner',
      now: NOW,
    });
    assert.match(s.pin, /^[0-9]{6}$/);
    assert.equal(s.token.length, 43);
    assert.ok(s.path.startsWith(`/scan/${eventId}/unlock?k=`));
    const row = f.q('SELECT * FROM scanner_sessions WHERE id = ?', s.id);
    const stored = JSON.stringify(row);
    assert.ok(!stored.includes(s.token), 'token never stored');
    assert.ok(!stored.includes(`"${s.pin}"`), 'PIN never stored');
    assert.equal(String(row.link_token_hash).length, 64);
    assert.match(String(row.pin_hash), /^pbkdf2_sha256\$100000\$/);
    // event end (start + 3 h) + 6 h
    assert.equal(row.expires_at, NOW + 2 * HOUR + 3 * HOUR + 6 * HOUR);
    assert.equal(row.allowed_zones_json, '["VIP"]');
  });

  test('expiry is event end + 6 h but never more than 7 days from creation; ended events are refused', async () => {
    assert.equal(scannerSessionExpiresAt(NOW + 30 * 86400, NOW), NOW + 7 * 86400);
    assert.equal(scannerSessionExpiresAt(NOW + 10, NOW), NOW + 10 + 6 * HOUR);
    const { f, eventId } = await setup(NOW - 20 * HOUR);
    await assert.rejects(
      createScannerSession(f.db, TEST_ENV, {
        eventId,
        label: 'Late gate',
        allowedDirections: 'both',
        createdByUserId: null,
        now: NOW,
      }),
      (e: unknown) => e instanceof ScannerSessionError && e.code === 'EVENT_ENDED',
    );
  });

  test('fails closed without SCANNER_SESSION_SECRET outside local', async () => {
    const { f, eventId } = await setup();
    await assert.rejects(
      createScannerSession(
        f.db,
        { ENVIRONMENT: 'production' },
        {
          eventId,
          label: 'Gate',
          allowedDirections: 'both',
          createdByUserId: null,
          now: NOW,
        },
      ),
      SecretNotConfiguredError,
    );
  });

  test('a correct PIN registers a device and a signed cookie no longer than 12 h or the session', async () => {
    const { f, eventId } = await setup();
    const s = await createScannerSession(f.db, TEST_ENV, {
      eventId,
      label: 'Gate B',
      allowedDirections: 'both',
      createdByUserId: 'usr_owner',
      now: NOW,
    });
    const r = await unlockScannerSession(f.db, TEST_ENV, {
      token: s.token,
      pin: s.pin,
      ipHash: null,
      now: NOW,
    });
    assert.ok(r.ok);
    assert.equal(r.eventId, eventId);
    assert.equal(r.cookieExpiresAt, NOW + 11 * HOUR); // session ends 11 h after NOW, before 12 h
    const verified = await verifySignedValue({
      signed: r.cookieValue,
      now: NOW,
      secret: TEST_ENV.SCANNER_SESSION_SECRET,
      purpose: 'scanner_device',
    });
    assert.equal(verified?.value, r.deviceId);
    const device = await readScannerDevice(f.db, TEST_ENV, cookieRequest(r.cookieValue), NOW + 60);
    assert.equal(device?.sessionId, s.id);
    assert.equal(device?.label, 'Gate B');
    // A forged or other-purpose cookie is ignored.
    assert.equal(
      await readScannerDevice(f.db, TEST_ENV, cookieRequest(`${r.deviceId}.9999999999.forged`), NOW),
      null,
    );
    const cookies = buildScannerCookies(r.cookieValue, r.cookieExpiresAt, NOW, true);
    assert.deepEqual(
      cookies.map((c) => /Path=([^;]+)/.exec(c)?.[1]),
      ['/scan', '/api/scanner'],
    );
    for (const c of cookies) assert.match(c, /HttpOnly; SameSite=Strict; Secure$/);
  });

  test('5 wrong PINs lock the session for 15 minutes, even for the correct PIN; then it unlocks', async () => {
    const { f, eventId } = await setup();
    const s = await createScannerSession(f.db, TEST_ENV, {
      eventId,
      label: 'Gate C',
      allowedDirections: 'in',
      createdByUserId: null,
      now: NOW,
    });
    const wrong = s.pin === '000000' ? '111111' : '000000';
    const left: Array<number | undefined> = [];
    for (let i = 0; i < 5; i++) {
      const r = await unlockScannerSession(f.db, TEST_ENV, {
        token: s.token,
        pin: wrong,
        ipHash: null,
        now: NOW,
      });
      assert.equal(r.ok, false);
      if (!r.ok) left.push(r.attemptsLeft);
    }
    assert.deepEqual(left, [4, 3, 2, 1, 0]);
    const locked = await unlockScannerSession(f.db, TEST_ENV, {
      token: s.token,
      pin: s.pin,
      ipHash: null,
      now: NOW + 60,
    });
    assert.equal(locked.ok, false);
    assert.equal(!locked.ok && locked.reason, 'locked');
    assert.equal((await listScannerSessions(f.db, eventId, NOW + 60))[0].state, 'locked');
    const later = await unlockScannerSession(f.db, TEST_ENV, {
      token: s.token,
      pin: s.pin,
      ipHash: null,
      now: NOW + 15 * 60 + 1,
    });
    assert.ok(later.ok, 'unlocks after the lock window');
    assert.equal(f.q('SELECT failed_pin_attempts AS n FROM scanner_sessions WHERE id = ?', s.id).n, 0);
  });

  test('concurrent wrong guesses cannot exceed the 5-attempt budget', async () => {
    const { f, eventId } = await setup();
    const s = await createScannerSession(f.db, TEST_ENV, {
      eventId,
      label: 'Gate D',
      allowedDirections: 'in',
      createdByUserId: null,
      now: NOW,
    });
    const guesses = Array.from({ length: 12 }, (_, i) => String(100000 + i)).filter((p) => p !== s.pin);
    const results = await Promise.all(
      guesses.map((pin) =>
        unlockScannerSession(f.db, TEST_ENV, { token: s.token, pin, ipHash: null, now: NOW }),
      ),
    );
    const checked = results.filter((r) => !r.ok && (r.reason === 'wrong_pin' || r.attemptsLeft === 0));
    assert.ok(checked.length <= 5, `${checked.length} PIN comparisons were made`);
    assert.ok(results.every((r) => !r.ok));
  });

  test('per-IP limit stops guessing across sessions', async () => {
    const { f, eventId } = await setup();
    const ipHash = 'ab'.repeat(16);
    let limited = false;
    for (let i = 0; i < 25 && !limited; i++) {
      const s = await createScannerSession(f.db, TEST_ENV, {
        eventId,
        label: `Gate ${i}`,
        allowedDirections: 'in',
        createdByUserId: null,
        now: NOW,
      });
      const r = await unlockScannerSession(f.db, TEST_ENV, {
        token: s.token,
        pin: '999999',
        ipHash,
        now: NOW,
      });
      limited = !r.ok && r.reason === 'rate_limited';
    }
    assert.ok(limited);
  });

  test('revoked and expired links read "ended"; revoking also ends unlocked devices', async () => {
    const { f, eventId } = await setup();
    const s = await createScannerSession(f.db, TEST_ENV, {
      eventId,
      label: 'Gate E',
      allowedDirections: 'both',
      createdByUserId: null,
      now: NOW,
    });
    const r = await unlockScannerSession(f.db, TEST_ENV, {
      token: s.token,
      pin: s.pin,
      ipHash: null,
      now: NOW,
    });
    assert.ok(r.ok);
    assert.ok((await findScannerLink(f.db, TEST_ENV, { token: s.token, now: NOW })).ok);
    assert.equal(await revokeScannerSession(f.db, { eventId, sessionId: s.id, now: NOW + 5 }), true);
    assert.equal(await revokeScannerSession(f.db, { eventId, sessionId: s.id, now: NOW + 6 }), false);
    assert.deepEqual(await findScannerLink(f.db, TEST_ENV, { token: s.token, now: NOW + 10 }), {
      ok: false,
      reason: 'ended',
    });
    const again = await unlockScannerSession(f.db, TEST_ENV, {
      token: s.token,
      pin: s.pin,
      ipHash: null,
      now: NOW + 10,
    });
    assert.equal(!again.ok && again.message, SCANNER_LINK_ENDED_MESSAGE);
    assert.equal(await readScannerDevice(f.db, TEST_ENV, cookieRequest(r.cookieValue), NOW + 10), null);

    const t = await createScannerSession(f.db, TEST_ENV, {
      eventId,
      label: 'Gate F',
      allowedDirections: 'both',
      createdByUserId: null,
      now: NOW,
    });
    const u = await unlockScannerSession(f.db, TEST_ENV, {
      token: t.token,
      pin: t.pin,
      ipHash: null,
      now: NOW,
    });
    assert.ok(u.ok);
    const expired = t.expiresAt + 1;
    assert.equal((await findScannerLink(f.db, TEST_ENV, { token: t.token, now: expired })).ok, false);
    assert.equal(await readScannerDevice(f.db, TEST_ENV, cookieRequest(u.cookieValue), expired), null);
    assert.equal(
      (await listScannerSessions(f.db, eventId, expired)).find((x) => x.id === t.id)?.state,
      'expired',
    );
    // An unknown or malformed token is indistinguishable from an ended one.
    assert.equal((await findScannerLink(f.db, TEST_ENV, { token: 'x'.repeat(43), now: NOW })).ok, false);
    assert.equal(
      (await findScannerLink(f.db, TEST_ENV, { token: s.token, eventId: 'evt_other', now: NOW })).ok,
      false,
    );
  });
});
