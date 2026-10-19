import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, createSign, generateKeyPairSync } from 'node:crypto';
import { verifyCloudflareAccessJwt } from '../../apps/admin/src/lib/cf-access.ts';
import { ACCESS_AUD, ACCESS_KID, ACCESS_TEAM, mintAccessJwt } from '../e2e/admin-fixture.ts';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const jwks = {
  keys: [
    { ...createPublicKey(publicKey).export({ format: 'jwk' }), kid: ACCESS_KID, alg: 'RS256', use: 'sig' },
  ],
};
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Replaces fetch with one that records its calls and answers with `respond`. */
function stubFetch(respond: () => Response) {
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return respond();
  }) as typeof fetch;
  return calls;
}

// Each test uses a distinct team name: the verifier caches a team's keys for an hour.
const team = (n: number) => `${ACCESS_TEAM}-${n}`;
const tokenFor = (teamName: string, email = 'staff@example.invalid') => {
  const now = Math.floor(Date.now() / 1000);
  const body = mintAccessJwt(privateKey, email, now).split('.');
  const payload = JSON.parse(Buffer.from(body[1], 'base64url').toString());
  payload.iss = `https://${teamName}.cloudflareaccess.com`;
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createSign('RSA-SHA256').update(`${body[0]}.${p}`).sign(privateKey).toString('base64url');
  return `${body[0]}.${p}.${sig}`;
};

test('fetches the Access signing keys with a redirect mode the Workers runtime accepts', async () => {
  // The Workers runtime throws a TypeError for redirect: "error" ("won't be implemented ... at the edge"), which
  // made every assertion fail verification in production and left staff unable to sign in.
  const calls = stubFetch(() => Response.json(jwks));
  const result = await verifyCloudflareAccessJwt(tokenFor(team(1)), ACCESS_AUD, team(1));
  assert.equal(result.valid, true, result.error ?? 'assertion refused');
  assert.equal(result.claims?.email, 'staff@example.invalid');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://${team(1)}.cloudflareaccess.com/cdn-cgi/access/certs`);
  assert.ok(
    ['follow', 'manual'].includes(String(calls[0].init?.redirect)),
    `redirect must be "follow" or "manual", got ${String(calls[0].init?.redirect)}`,
  );
});

test('a redirecting or failing keys endpoint refuses the assertion with a reason, never trusts it', async () => {
  stubFetch(() => new Response(null, { status: 302, headers: { Location: 'https://elsewhere.invalid/' } }));
  const redirected = await verifyCloudflareAccessJwt(tokenFor(team(2)), ACCESS_AUD, team(2));
  assert.deepEqual([redirected.valid, redirected.reason], [false, 'jwks_unavailable']);
  stubFetch(() => new Response('nope', { status: 500 }));
  const failing = await verifyCloudflareAccessJwt(tokenFor(team(3)), ACCESS_AUD, team(3));
  assert.deepEqual([failing.valid, failing.reason], [false, 'jwks_unavailable']);
});

test('refusals carry a fixed reason code', async () => {
  stubFetch(() => Response.json(jwks));
  const ok = tokenFor(team(4));
  assert.equal((await verifyCloudflareAccessJwt(ok, 'another-aud', team(4))).reason, 'audience');
  assert.equal((await verifyCloudflareAccessJwt(ok, ACCESS_AUD, 'another-team')).reason, 'issuer');
  assert.equal(
    (await verifyCloudflareAccessJwt(`${ok.slice(0, -6)}AAAAAA`, ACCESS_AUD, team(4))).reason,
    'bad_signature',
  );
  assert.equal((await verifyCloudflareAccessJwt('not-a-jwt', ACCESS_AUD, team(4))).reason, 'malformed');
  assert.equal((await verifyCloudflareAccessJwt(null, ACCESS_AUD, team(4))).reason, 'missing');
  assert.equal((await verifyCloudflareAccessJwt(ok, undefined, team(4))).reason, 'not_configured');
});
