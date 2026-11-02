import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveClerkConfig, localSimulatedSignInAllowed } from './clerk.ts';

const FRONTEND = 'https://clerk.live.example.test';
const publishable = `pk_test_${Buffer.from('clerk.live.example.test$').toString('base64')}`;

test('Live reads its own *_LIVE Clerk variables and needs both keys to be on', () => {
  assert.equal(liveClerkConfig({ PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE: publishable } as never), null);
  assert.equal(liveClerkConfig({ CLERK_SECRET_KEY_LIVE: 'sk_test_x' } as never), null);
  assert.equal(
    liveClerkConfig({
      PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE: 'pk_test_YOUR_KEY',
      CLERK_SECRET_KEY_LIVE: 'sk_test_x',
    } as never),
    null,
    'template values do not count',
  );
  const on = liveClerkConfig({
    PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE: publishable,
    CLERK_SECRET_KEY_LIVE: 'sk_test_x',
    CLERK_AUTHORIZED_PARTIES_LIVE: 'http://a.test, http://b.test',
  } as never);
  assert.equal(on?.frontendApi, FRONTEND);
  assert.deepEqual(on?.authorizedParties, ['http://a.test', 'http://b.test']);
});

test('local sign-in without Clerk exists only for a local build with the flag and no Clerk keys', () => {
  const flags = { ENVIRONMENT: 'local', ALLOW_AUTH_SIMULATION: 'true' };
  assert.equal(localSimulatedSignInAllowed(flags as never), true);
  assert.equal(localSimulatedSignInAllowed({ ...flags, ENVIRONMENT: 'preview' } as never), false);
  assert.equal(localSimulatedSignInAllowed({ ENVIRONMENT: 'local' } as never), false);
  assert.equal(
    localSimulatedSignInAllowed({
      ...flags,
      PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE: publishable,
      CLERK_SECRET_KEY_LIVE: 'sk_test_x',
    } as never),
    false,
    'with Clerk configured the stand-in is off',
  );
});

test('the local sign-in stand-in works only from this computer, never from a LAN address or .local name', () => {
  const flags = { ENVIRONMENT: 'local', ALLOW_AUTH_SIMULATION: 'true' } as never;
  for (const host of ['localhost', '127.0.0.1', '[::1]', '::1', 'LOCALHOST'])
    assert.equal(localSimulatedSignInAllowed(flags, host), true, host);
  for (const host of [
    '192.168.1.20',
    '10.0.0.5',
    '172.16.0.9',
    'my-mac.local',
    'gamostudio.org',
    '127.0.0.1.evil.test',
    '',
  ])
    assert.equal(localSimulatedSignInAllowed(flags, host), false, host);
});
