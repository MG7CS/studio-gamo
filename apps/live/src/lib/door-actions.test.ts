import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FLASH_COOKIE } from '@studio-gamo/ui/lib/flash';
import { handleDoorRequest, runDoorPost } from './door-actions';
import { doorOpenDrawer } from './door-sell';
import { NOW, doorFixture, formOf } from './door-testing';

function astroFor(request: Request, jar: Map<string, string> = new Map()) {
  return {
    request,
    url: new URL(request.url),
    cookies: {
      get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
      set: (name: string, value: string) => void jar.set(name, value),
      delete: (name: string) => void jar.delete(name),
    },
    redirect: (location: string, status = 302) => new Response(null, { status, headers: { location } }),
    jar,
  };
}

const post = (body: BodyInit, headers: Record<string, string>) =>
  new Request('https://live.example/organizer/door/occ_1', { method: 'POST', body, headers });

test('a seller without the permission is refused with plain words, keeping the selection', async () => {
  const fx = await doorFixture();
  const scanner = fx.staff({ checkIn: true });
  const result = await runDoorPost(fx.deps, scanner, {
    form: formOf([
      ['action', 'sell-cash'],
      ['sel', `${fx.seed.generalTypeId}:2`],
      ['received', '40'],
    ]),
    now: NOW,
  });
  assert.deepEqual(result, {
    kind: 'redirect',
    location: `${scanner.basePath}?mode=sell&sel=${encodeURIComponent(`${fx.seed.generalTypeId}:2`)}&pay=cash`,
    flash: 'door-e-forbidden.sell',
  });
});

test('a cash sale redirects to its result; a bad email is named', async () => {
  const fx = await doorFixture();
  await doorOpenDrawer(fx.deps, fx.organizer, { float: '20', now: NOW });
  const bad = await runDoorPost(fx.deps, fx.organizer, {
    form: formOf([
      ['action', 'sell-cash'],
      ['sel', `${fx.seed.generalTypeId}:1`],
      ['received', '20'],
      ['email', 'not-an-email'],
    ]),
    now: NOW,
  });
  assert.equal(bad.kind === 'redirect' && bad.flash, 'door-e-invalid.email');
  const ok = await runDoorPost(fx.deps, fx.organizer, {
    form: formOf([
      ['action', 'sell-cash'],
      ['sel', `${fx.seed.generalTypeId}:1`],
      ['received', '25'],
    ]),
    now: NOW,
  });
  assert.equal(ok.kind, 'redirect');
  assert.match(ok.kind === 'redirect' ? ok.location : '', /\?mode=sell&sale=ord_/);
  assert.equal(ok.kind === 'redirect' && ok.flash, null);
});

test('opening check-in by hand is for organizers only', async () => {
  const fx = await doorFixture();
  const staff = await runDoorPost(fx.deps, fx.staff({ checkIn: true }), {
    form: formOf([['action', 'open-checkin']]),
    now: NOW,
  });
  assert.equal(staff.kind === 'redirect' && staff.flash, 'door-e-forbidden');
  const org = await runDoorPost(fx.deps, fx.organizer, {
    form: formOf([['action', 'close-checkin']]),
    now: NOW,
  });
  assert.equal(org.kind === 'redirect' && org.flash, 'door-ok-checkin-closed');
});

test('the scanner gets JSON; the typed-code form gets its result to draw', async () => {
  const fx = await doorFixture();
  const json = await runDoorPost(fx.deps, fx.organizer, { json: { code: 'NOPE' }, form: null, now: NOW });
  assert.equal(json.kind, 'json');
  const form = await runDoorPost(fx.deps, fx.organizer, {
    form: formOf([
      ['action', 'checkin'],
      ['code', 'NOPE'],
    ]),
    now: NOW,
  });
  assert.equal(form.kind, 'render');
});

test('handleDoorRequest: cross-origin POST is refused before anything runs', async () => {
  const fx = await doorFixture();
  const astro = astroFor(post(formOf([['action', 'open-checkin']]), { origin: 'https://evil.example' }));
  const outcome = await handleDoorRequest(astro, fx.deps, fx.organizer, NOW);
  assert.equal(outcome.response?.status, 403);
});

test('handleDoorRequest: JSON scan answers JSON; a redirect carries its flash; a GET reads it once', async () => {
  const fx = await doorFixture();
  const scan = await handleDoorRequest(
    astroFor(
      post(JSON.stringify({ code: 'NOPE' }), {
        origin: 'https://live.example',
        'content-type': 'application/json',
      }),
    ),
    fx.deps,
    fx.organizer,
    NOW,
  );
  assert.equal(scan.response?.headers.get('content-type'), 'application/json');
  const body = (await scan.response!.json()) as { ok: boolean; counts: unknown };
  assert.equal(body.ok, false);

  const jar = new Map<string, string>();
  const redirected = await handleDoorRequest(
    astroFor(post(formOf([['action', 'close-checkin']]), { origin: 'https://live.example' }), jar),
    fx.deps,
    fx.organizer,
    NOW,
  );
  assert.equal(redirected.response?.status, 303);
  assert.equal(jar.get(FLASH_COOKIE), 'door-ok-checkin-closed');
  const shown = await handleDoorRequest(
    astroFor(new Request('https://live.example/organizer/door/occ_1'), jar),
    fx.deps,
    fx.organizer,
    NOW,
  );
  assert.deepEqual(shown.response === null && shown.flash, {
    tone: 'success',
    text: 'Check-in is closed. It will open by itself at the scheduled time.',
  });
  assert.equal(jar.has(FLASH_COOKIE), false);
});
