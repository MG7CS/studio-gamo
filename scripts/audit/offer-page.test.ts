/**
 * The emailed offer page (`apps/web/src/lib/offer-page.ts`): GET is read-only, POST decides once, the token is the only
 * credential and nothing is disclosed for an unknown, withdrawn or expired offer. Real database, real tokens from
 * `sendOffer`; the Astro global is a small fake (request, params, locals, response).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AstroGlobal } from 'astro';
import { loadOfferPage, type OfferPageData } from '../../apps/web/src/lib/offer-page.ts';
import {
  approveApplication,
  createRequestFromSubmission,
  sendOffer,
  withdrawOffer,
} from '../../packages/domain/src/worship/index.ts';
import {
  all,
  ENV,
  fakeResend,
  get,
  musicianBinds,
  newDb,
  NOW,
  requestBinds,
  run,
  seedSubmission,
} from '../../packages/domain/src/worship/test-support.ts';

const ORIGIN = 'https://gamostudio.org';
const staffId = 'staff_1';

async function scenario() {
  const d1 = await newDb();
  const mail = fakeResend();
  const musician = seedSubmission(d1, {
    kind: 'musician_application',
    program: 'worship',
    binds: musicianBinds(),
  });
  const church = seedSubmission(d1, { kind: 'church_request', program: 'worship', binds: requestBinds() });
  const member = await approveApplication(
    d1,
    ENV,
    { submissionId: musician, staffId, now: NOW },
    mail.options,
  );
  const request = await createRequestFromSubmission(d1, { submissionId: church, now: NOW });
  const offer = await sendOffer(
    d1,
    ENV,
    {
      requestId: request.id,
      rosterMemberId: member.id,
      role: 'Drums',
      payCents: 15_050,
      staffId,
      siteOrigin: ORIGIN,
      now: NOW,
    },
    mail.options,
  );
  const token = offer.url.split('/').pop()!;
  // No provider key: a test never calls Resend (the emails of a response are covered by the domain tests).
  const env = { ...ENV, RESEND_API_KEY: undefined, DB: d1 } as never;
  const mailBefore = mail.calls.length;
  return { d1, mail, mailBefore, env, token, offerId: offer.offerId };
}

type Setup = Awaited<ReturnType<typeof scenario>>;

function astroFor(
  s: Setup,
  token: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
) {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = {
    'cf-connecting-ip': '203.0.113.9',
    ...(method === 'POST' ? { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' } : {}),
    ...init.headers,
  };
  const response = { status: 200, headers: new Headers() };
  const locals: Record<string, unknown> = { runtimeEnv: s.env };
  const astro = {
    request: new Request(`${ORIGIN}/worship/offers/${token}`, {
      method,
      headers,
      ...(method === 'POST' ? { body: init.body ?? '' } : {}),
    }),
    params: { token },
    locals,
    response,
  } as unknown as AstroGlobal;
  return { astro, response, locals };
}

const post = (s: Setup, token: string, action: string, headers: Record<string, string> = {}) =>
  astroFor(s, token, { method: 'POST', body: `action=${action}`, headers });

const rows = (s: Setup) => JSON.stringify(all(s.d1, 'SELECT * FROM offers ORDER BY id'));

const view = (page: OfferPageData) => page.view;

test('GET shows the offer and never changes anything, however often a scanner opens it', async () => {
  const s = await scenario();
  const before = rows(s);
  for (let i = 0; i < 3; i++) {
    const { astro, response, locals } = astroFor(s, s.token);
    const page = await loadOfferPage(astro, s.token);
    assert.equal(view(page), 'offer');
    assert.equal(
      (locals.securityRequest as { noReferrer?: boolean }).noReferrer,
      true,
      'Referrer-Policy: no-referrer',
    );
    if (page.view !== 'offer') return;
    assert.equal(page.offerState, 'pending');
    assert.equal(page.details.churchName, 'Grace Community Church');
    assert.equal(page.details.role, 'Drums');
    assert.equal(page.details.payCents, 15_050);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.match(response.headers.get('X-Robots-Tag') ?? '', /noindex/);
  }
  assert.equal(rows(s), before, 'GET wrote nothing');
  assert.equal(s.mail.calls.length, s.mailBefore, 'GET sent nothing');
});

test('POST accept decides once; a repeat shows the answer already on record', async () => {
  const s = await scenario();
  const first = await loadOfferPage(post(s, s.token, 'accept').astro, s.token);
  assert.deepEqual([view(first), first.view === 'result' && first.state], ['result', 'accepted']);
  if (first.view === 'result') assert.equal(first.details?.address, '12 Main St, Phoenix, AZ 85001');
  assert.equal(get(s.d1, 'SELECT status FROM offers WHERE id = ?', s.offerId)!.status, 'accepted');

  const again = await loadOfferPage(post(s, s.token, 'accept').astro, s.token);
  assert.equal(again.view === 'result' && again.state, 'already_accepted');

  const flipped = await loadOfferPage(post(s, s.token, 'decline').astro, s.token);
  assert.equal(
    flipped.view === 'result' && flipped.state,
    'already_accepted',
    'an accepted offer cannot be declined',
  );
  assert.equal(get(s.d1, 'SELECT status FROM offers WHERE id = ?', s.offerId)!.status, 'accepted');

  const shown = await loadOfferPage(astroFor(s, s.token).astro, s.token);
  assert.equal(shown.view === 'offer' && shown.offerState, 'accepted');
});

test('POST decline is recorded and the request goes back to matching', async () => {
  const s = await scenario();
  const out = await loadOfferPage(post(s, s.token, 'decline').astro, s.token);
  assert.equal(out.view === 'result' && out.state, 'declined');
  assert.equal(get(s.d1, 'SELECT status FROM offers WHERE id = ?', s.offerId)!.status, 'declined');
});

test('an unknown or malformed token is a generic 404 that discloses nothing', async () => {
  const s = await scenario();
  for (const token of ['short', 'x'.repeat(43), 'a b', `${s.token}x`]) {
    const { astro, response, locals } = astroFor(s, token);
    const page = await loadOfferPage(astro, token);
    assert.equal(view(page), 'unknown', token);
    assert.equal(response.status, 404);
    assert.equal((locals.securityRequest as { noReferrer?: boolean }).noReferrer, true);
    assert.equal(JSON.stringify(page).includes('Grace'), false);
  }
});

test('a withdrawn or expired offer says it is gone and shows no details', async () => {
  const s = await scenario();
  run(s.d1, "UPDATE offers SET status = 'withdrawn' WHERE id = ?", s.offerId);
  const withdrawn = await loadOfferPage(astroFor(s, s.token).astro, s.token);
  assert.equal(view(withdrawn), 'gone');
  assert.equal(JSON.stringify(withdrawn).includes('Grace'), false);
  const answered = await loadOfferPage(post(s, s.token, 'accept').astro, s.token);
  assert.equal(answered.view === 'result' && answered.state, 'unavailable');

  const t = await scenario();
  run(t.d1, 'UPDATE offers SET expires_at = 1 WHERE id = ?', t.offerId);
  assert.equal(view(await loadOfferPage(astroFor(t, t.token).astro, t.token)), 'gone');
  const late = await loadOfferPage(post(t, t.token, 'accept').astro, t.token);
  assert.equal(late.view === 'result' && late.state, 'unavailable');
  assert.equal(
    get(t.d1, 'SELECT status FROM offers WHERE id = ?', t.offerId)!.status,
    'expired',
    'a late answer is never accepted',
  );
});

test('a withdrawn offer through the real withdraw path is unavailable', async () => {
  const s = await scenario();
  await withdrawOffer(s.d1, { offerId: s.offerId, staffId, now: NOW });
  const out = await loadOfferPage(post(s, s.token, 'accept').astro, s.token);
  assert.equal(out.view === 'result' && out.state, 'unavailable');
});

test('a cross-origin or cross-site POST is refused (403) before the token is looked at', async () => {
  const s = await scenario();
  const before = rows(s);
  for (const headers of [
    { origin: 'https://evil.example' },
    { 'sec-fetch-site': 'cross-site' },
    { origin: 'null', 'sec-fetch-site': 'cross-site' },
    { origin: 'null', 'sec-fetch-site': 'same-site' },
  ]) {
    const { astro, response } = post(s, s.token, 'accept', headers);
    const page = await loadOfferPage(astro, s.token);
    assert.equal(view(page), 'unavailable');
    assert.equal(response.status, 403);
  }
  assert.equal(rows(s), before);
});

test('a no-referrer page gets Origin: null from the browser: that is accepted when the browser says same-origin', async () => {
  const s = await scenario();
  for (const headers of [{ origin: 'null', 'sec-fetch-site': 'same-origin' }, { origin: 'null' }]) {
    const fresh = await scenario();
    const out = await loadOfferPage(post(fresh, fresh.token, 'accept', headers).astro, fresh.token);
    assert.equal(out.view === 'result' && out.state, 'accepted', JSON.stringify(headers));
  }
  assert.equal(get(s.d1, 'SELECT status FROM offers WHERE id = ?', s.offerId)!.status, 'pending');
});

test('an unknown action is a 400 and changes nothing', async () => {
  const s = await scenario();
  const before = rows(s);
  for (const action of ['', 'withdraw', 'ACCEPT']) {
    const { astro, response } = post(s, s.token, action);
    assert.equal(view(await loadOfferPage(astro, s.token)), 'unavailable');
    assert.equal(response.status, 400);
  }
  const { astro, response } = astroFor(s, s.token, { method: 'POST', body: '' });
  assert.equal(view(await loadOfferPage(astro, s.token)), 'unavailable');
  assert.equal(response.status, 400);
  assert.equal(rows(s), before);
});

test('too many posts from one address are answered 429 with Retry-After', async () => {
  const s = await scenario();
  let limited: { status: number; retry: string | null } | null = null;
  for (let i = 0; i < 40 && !limited; i++) {
    const { astro, response } = post(s, s.token, 'nothing', { 'cf-connecting-ip': '198.51.100.77' });
    await loadOfferPage(astro, s.token);
    if (response.status === 429) limited = { status: 429, retry: response.headers.get('Retry-After') };
  }
  assert.ok(limited, 'the per-IP limit answered 429');
  assert.ok(Number(limited.retry) > 0);
});

test('without a database the page says it is unavailable (503) rather than guessing', async () => {
  const s = await scenario();
  const bare = { ...s, env: { ...ENV } as never } as Setup;
  const { astro, response } = astroFor(bare, s.token);
  assert.equal(view(await loadOfferPage(astro, s.token)), 'unavailable');
  assert.equal(response.status, 503);
});
