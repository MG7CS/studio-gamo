import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLASH_COOKIE,
  FLASH_MAX_AGE_SECONDS,
  flashRedirect,
  isFlashKey,
  readFlash,
  setFlash,
  takeFlash,
  type FlashCookies,
  type FlashRedirectContext,
} from './flash.ts';

interface SetCall {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

function jar(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const sets: SetCall[] = [];
  const deletes: string[] = [];
  const cookies: FlashCookies = {
    get: (name) => (store.has(name) ? { value: store.get(name) as string } : undefined),
    set: (name, value, options) => {
      store.set(name, value);
      sets.push({ name, value, options: options as Record<string, unknown> });
    },
    delete: (name) => {
      store.delete(name);
      deletes.push(name);
    },
  };
  return { cookies, store, sets, deletes };
}

const MESSAGES = { 'event-saved': 'Event saved.', 'event-cancelled': 'Event cancelled.' };

test('setFlash writes a short-lived HttpOnly SameSite=Lax cookie', () => {
  const { cookies, sets } = jar();
  setFlash(cookies, 'event-saved');
  assert.equal(sets.length, 1);
  assert.equal(sets[0]?.name, FLASH_COOKIE);
  assert.equal(sets[0]?.value, 'event-saved');
  assert.equal(sets[0]?.options?.httpOnly, true);
  assert.equal(sets[0]?.options?.sameSite, 'lax');
  assert.equal(sets[0]?.options?.maxAge, FLASH_MAX_AGE_SECONDS);
  assert.equal(sets[0]?.options?.path, '/');
  assert.equal(sets[0]?.options?.secure, true);
});

test('setFlash refuses keys that are not plain message keys', () => {
  const { cookies } = jar();
  for (const bad of ['', 'Has Space', '<script>', 'a;b=c', 'x'.repeat(65), 'UPPER']) {
    assert.equal(isFlashKey(bad), false, bad);
    assert.throws(() => setFlash(cookies, bad), RangeError, bad);
  }
});

test('takeFlash returns the allow-listed message once and clears the cookie', () => {
  const { cookies, deletes } = jar({ [FLASH_COOKIE]: 'event-saved' });
  assert.equal(takeFlash(cookies, MESSAGES), 'Event saved.');
  assert.deepEqual(deletes, [FLASH_COOKIE]);
  assert.equal(takeFlash(cookies, MESSAGES), null);
});

test('takeFlash never turns a forged cookie into page text', () => {
  const forged = jar({ [FLASH_COOKIE]: 'Your account is closed, call 555-0100' });
  assert.equal(takeFlash(forged.cookies, MESSAGES), null);
  assert.deepEqual(forged.deletes, [FLASH_COOKIE]);

  const unknown = jar({ [FLASH_COOKIE]: 'not-in-the-list' });
  assert.equal(takeFlash(unknown.cookies, MESSAGES), null);

  const proto = jar({ [FLASH_COOKIE]: 'constructor' });
  assert.equal(takeFlash(proto.cookies, MESSAGES), null);
  const proto2 = jar({ [FLASH_COOKIE]: 'toString' });
  assert.equal(takeFlash(proto2.cookies, MESSAGES), null);
});

test('takeFlash with no cookie does nothing', () => {
  const { cookies, deletes } = jar();
  assert.equal(takeFlash(cookies, MESSAGES), null);
  assert.deepEqual(deletes, []);
});

test('flashRedirect sets the cookie and redirects with 303', () => {
  const { cookies, store } = jar();
  const redirects: Array<[string, number | undefined]> = [];
  const ctx: FlashRedirectContext = {
    cookies,
    url: new URL('https://live.example.test/organizer'),
    redirect: (path, status) => {
      redirects.push([path, status]);
      return new Response(null, { status: status ?? 302, headers: { location: path } });
    },
  };
  const res = flashRedirect(ctx, '/organizer/events/abc', 'event-saved');
  assert.equal(res.status, 303);
  assert.deepEqual(redirects, [['/organizer/events/abc', 303]]);
  assert.equal(store.get(FLASH_COOKIE), 'event-saved');
});

test('flashRedirect does not set Secure on plain-http local development', () => {
  const { cookies, sets } = jar();
  const ctx: FlashRedirectContext = {
    cookies,
    url: new URL('http://localhost:4324/organizer'),
    redirect: (path, status) => new Response(null, { status: status ?? 302, headers: { location: path } }),
  };
  flashRedirect(ctx, '/organizer', 'event-saved');
  assert.equal(sets[0]?.options?.secure, false);
});

test('flashRedirect only redirects to same-site paths', () => {
  const { cookies } = jar();
  const ctx: FlashRedirectContext = {
    cookies,
    redirect: (path) => new Response(null, { status: 303, headers: { location: path } }),
  };
  for (const bad of ['https://evil.test/', '//evil.test', 'organizer', '/\\evil.test']) {
    assert.throws(() => flashRedirect(ctx, bad, 'event-saved'), RangeError, bad);
  }
});

test('readFlash reads through a page context and clears the cookie', () => {
  const { cookies, store } = jar({ [FLASH_COOKIE]: 'event-cancelled' });
  assert.equal(
    readFlash({ cookies, url: new URL('https://live.example.test/') }, MESSAGES),
    'Event cancelled.',
  );
  assert.equal(store.has(FLASH_COOKIE), false);
});
