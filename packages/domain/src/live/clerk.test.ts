import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedParties,
  clearJwksCache,
  ClerkUnavailableError,
  ClerkVerificationError,
  fetchClerkUserProfile,
  frontendApiFromPublishableKey,
  liveClerkConfig,
  localSimulatedSignInAllowed,
  verifyClerkSessionToken,
  type LiveClerkConfig,
} from './clerk.ts';

const FRONTEND = 'https://clerk.live.example.test';
const publishable = `pk_test_${Buffer.from('clerk.live.example.test$').toString('base64')}`;
const NOW = 1_900_000_000;
const ORIGIN = 'http://127.0.0.1:4324';

const b64url = (data: Uint8Array | string) =>
  Buffer.from(typeof data === 'string' ? data : data).toString('base64url');

async function keyPair() {
  clearJwksCache();
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const jwk = {
    ...(await crypto.subtle.exportKey('jwk', pair.publicKey)),
    kid: 'ins_1',
    alg: 'RS256',
    use: 'sig',
  };
  return { pair, jwk };
}

async function token(
  pair: CryptoKeyPair,
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'RS256', kid: 'ins_1', typ: 'JWT' },
) {
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    pair.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}

const config = (extra: Partial<LiveClerkConfig> = {}): LiveClerkConfig => ({
  publishableKey: publishable,
  frontendApi: FRONTEND,
  secretKey: 'sk_test_example',
  authorizedParties: [],
  ...extra,
});
const good = {
  sub: 'user_abc123',
  sid: 'sess_1',
  iss: FRONTEND,
  exp: NOW + 60,
  nbf: NOW - 5,
  azp: 'http://127.0.0.1:4324',
};

function jwksFetch(jwk: unknown, calls: { n: number } = { n: 0 }): typeof fetch {
  return (async () => {
    calls.n++;
    return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
  }) as typeof fetch;
}

test('a valid session token verifies against the Frontend API keys', async () => {
  const { pair, jwk } = await keyPair();
  const claims = await verifyClerkSessionToken(
    await token(pair, good),
    config(),
    NOW,
    jwksFetch(jwk),
    ORIGIN,
  );
  assert.deepEqual(claims, { userId: 'user_abc123', sessionId: 'sess_1' });
});

test('expired, early, wrong-issuer, wrong-party and unsigned tokens are refused', async () => {
  const { pair, jwk } = await keyPair();
  const other = await keyPair();
  const verify = (t: string, c = config()) => verifyClerkSessionToken(t, c, NOW, jwksFetch(jwk), ORIGIN);
  const reason = async (p: Promise<unknown>) => {
    try {
      await p;
      return 'accepted';
    } catch (e) {
      return e instanceof ClerkVerificationError ? e.reason : String(e);
    }
  };
  assert.equal(await reason(verify(await token(pair, { ...good, exp: NOW - 60 }))), 'expired');
  assert.equal(await reason(verify(await token(pair, { ...good, nbf: NOW + 600 }))), 'not_yet_valid');
  assert.equal(await reason(verify(await token(pair, { ...good, iss: 'https://evil.example' }))), 'issuer');
  assert.equal(
    await reason(
      verify(await token(pair, good), config({ authorizedParties: ['https://live.example.test'] })),
    ),
    'party',
  );
  assert.equal(await reason(verify(await token(other.pair, good))), 'signature');
  assert.equal(await reason(verify(await token(pair, good, { alg: 'none', kid: 'ins_1' }))), 'algorithm');
  assert.equal(await reason(verify(await token(pair, { ...good, sub: 'not-a-user' }))), 'subject');
  assert.equal(await reason(verify('a.b')), 'malformed');
  assert.equal(
    await reason(verify(await token(pair, good, { alg: 'RS256', kid: 'ins_other' }))),
    'unknown_key',
  );
});

test('without a configured parties list the token must come from the request’s own origin', async () => {
  const { pair, jwk } = await keyPair();
  const verify = (azp: string | undefined, origin: string | undefined, c = config()) =>
    token(pair, { ...good, azp }).then((t) => verifyClerkSessionToken(t, c, NOW, jwksFetch(jwk), origin));
  await verify(good.azp, ORIGIN); // same origin
  await verify(good.azp, `${ORIGIN}/account/session`); // a URL is reduced to its origin
  await assert.rejects(
    verify('https://evil.example', ORIGIN),
    (e) => e instanceof ClerkVerificationError && e.reason === 'party',
  );
  await assert.rejects(
    verify(good.azp, 'https://live.example.test'),
    (e) => e instanceof ClerkVerificationError && e.reason === 'party',
  );
  // No list and no origin to compare: refused, never skipped.
  await assert.rejects(
    verify(good.azp, undefined),
    (e) => e instanceof ClerkVerificationError && e.reason === 'party',
  );
  // A configured list still decides, whatever the request origin is.
  await verify(good.azp, 'https://elsewhere.example', config({ authorizedParties: [good.azp] }));
  assert.deepEqual(allowedParties(config(), 'https://live.example.test/x'), ['https://live.example.test']);
  assert.deepEqual(allowedParties(config(), 'not a url'), []);
});

test('a token signed by a different key is refused even with a matching key id', async () => {
  const { jwk } = await keyPair();
  const attacker = await keyPair();
  await assert.rejects(
    verifyClerkSessionToken(await token(attacker.pair, good), config(), NOW, jwksFetch(jwk), ORIGIN),
    (e) => e instanceof ClerkVerificationError && e.reason === 'signature',
  );
});

test('an unreachable key set is unavailable, not "signed out"', async () => {
  const { pair } = await keyPair();
  const down = (async () => new Response('', { status: 500 })) as typeof fetch;
  await assert.rejects(
    verifyClerkSessionToken(await token(pair, good), config(), NOW, down, ORIGIN),
    (e) => e instanceof ClerkUnavailableError,
  );
});

test('the publishable key names the Frontend API, and Clerk needs both keys to be on', () => {
  assert.equal(frontendApiFromPublishableKey(publishable), FRONTEND);
  assert.equal(frontendApiFromPublishableKey('pk_test_not-base64!'), null);
  assert.equal(frontendApiFromPublishableKey(undefined), null);
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

test('the user profile uses a verified email (primary first) and refuses unverified ones', async () => {
  const user = (emails: unknown[], primary: string | null = null) =>
    (async () =>
      new Response(
        JSON.stringify({
          first_name: 'Ana',
          last_name: 'Reyes',
          primary_email_address_id: primary,
          email_addresses: emails,
        }),
        {
          status: 200,
        },
      )) as typeof fetch;
  const verified = (id: string, email: string) => ({
    id,
    email_address: email,
    verification: { status: 'verified' },
  });
  const unverified = (id: string, email: string) => ({
    id,
    email_address: email,
    verification: { status: 'unverified' },
  });
  const profile = await fetchClerkUserProfile(
    'user_1',
    config(),
    user([verified('e1', 'First@Example.org'), verified('e2', 'second@example.org')], 'e2'),
  );
  assert.deepEqual(profile, { email: 'second@example.org', displayName: 'Ana Reyes' });
  await assert.rejects(
    fetchClerkUserProfile('user_1', config(), user([unverified('e1', 'a@example.org')], 'e1')),
    (e) => e instanceof ClerkVerificationError && e.reason === 'no_verified_email',
  );
  const down = (async () => new Response('', { status: 502 })) as typeof fetch;
  await assert.rejects(
    fetchClerkUserProfile('user_1', config(), down),
    (e) => e instanceof ClerkUnavailableError,
  );
});
