/**
 * The rebuilt admin (apps/admin-next): access control, navigation honesty and password-change session
 * rotation. Browser behavior (sign-in, shell on unknown routes, errors and empty states, CSP) is in
 * tests/e2e/admin-shell.spec.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createInMemoryD1, applyMigrations, readMigrations } from '../../packages/db/testing.ts';
import { createDb } from '../../packages/db/index.ts';
import { IdentityService } from '../../packages/domain/index.ts';
import { NAV_ITEMS, badgeFor } from '../../apps/admin-next/src/lib/nav.ts';
import { loadQueueCounts, tallyQueueCounts } from '../../apps/admin-next/src/lib/queue-counts.ts';
import { REVIEW_FIXTURE_COUNTS, buildReviewFixtureStatements } from '../e2e/admin-review-fixtures.ts';
import { STAFF_EMAIL } from '../e2e/admin-fixture.ts';

const SECRET = 'admin-rebuild-test-session-secret-0123456789';
const APP = 'apps/admin-next/src';

async function migrated() {
  const d1 = createInMemoryD1();
  await applyMigrations(d1, readMigrations());
  return d1;
}

// ---------------------------------------------------------------------------------------------
// Navigation and counts: only real, computed numbers.
// ---------------------------------------------------------------------------------------------

test('navigation lists exactly the seven v1 areas with working pages', () => {
  assert.deepEqual(
    NAV_ITEMS.map((i) => i.href),
    ['/participation', '/review/churches', '/review/providers', '/review/events', '/legal', '/security'],
  );
  for (const item of NAV_ITEMS) {
    const file =
      item.href === '/participation' || item.href === '/legal' || item.href === '/security'
        ? `${APP}/pages${item.href}.astro`
        : `${APP}/pages${item.href}${item.href.endsWith('providers') ? '/index' : ''}.astro`;
    assert.ok(statSync(file).isFile(), `${item.href} has no page (${file})`);
  }
});

test('a badge appears only for a count that was read and is above zero', () => {
  const participation = NAV_ITEMS.find((i) => i.key === 'participation')!;
  const legal = NAV_ITEMS.find((i) => i.key === 'legal')!;
  const counts = { participation: 3, churches: 0, providers: 1, events: 0 };
  assert.equal(badgeFor(participation, counts), 3);
  assert.equal(
    badgeFor(
      NAV_ITEMS.find((i) => i.key === 'churches')!,
      counts,
    ),
    null,
    'zero shows no badge',
  );
  assert.equal(badgeFor(participation, null), null, 'unavailable counts show no badge');
  assert.equal(badgeFor(participation, undefined), null);
  assert.equal(badgeFor(legal, counts), null, 'items without a queue never show a badge');
  assert.equal(
    badgeFor(participation, { ...counts, participation: Number.NaN }),
    null,
    'a non-integer count is never drawn',
  );
});

test('queue counts equal what the queues list, against the real schema', async () => {
  const d1 = await migrated();
  const staff = await new IdentityService(createDb(d1)).findOrCreateUser(STAFF_EMAIL);
  assert.deepEqual(await loadQueueCounts(d1, staff.id), {
    participation: 0,
    churches: 0,
    providers: 0,
    events: 0,
  });
  for (const statement of buildReviewFixtureStatements()) d1.exec(statement);
  assert.deepEqual(await loadQueueCounts(d1, staff.id), REVIEW_FIXTURE_COUNTS);
  // Not the same user: the staff user's own inquiry now counts as waiting for them to review.
  const other = await new IdentityService(createDb(d1)).findOrCreateUser('someone.else@example.invalid');
  assert.equal((await loadQueueCounts(d1, other.id))!.participation, REVIEW_FIXTURE_COUNTS.participation + 1);
});

test('queue counts are null (no badges), not zero, when the database cannot be read', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(await loadQueueCounts(undefined, 'usr_x'), null);
    assert.equal(
      await loadQueueCounts(
        {
          prepare: () => {
            throw new Error('down');
          },
          batch: async () => [],
        },
        'usr_x',
      ),
      null,
    );
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(
    tallyQueueCounts([
      { k: 'church', n: '2' },
      { k: 'musician', n: 1 },
      { k: 'organizer', n: 9 },
    ]),
    {
      participation: 0,
      churches: 2,
      providers: 1,
      events: 0,
    },
  );
});

// ---------------------------------------------------------------------------------------------
// Access control: nothing is served without Access (outside local) and a staff session.
// ---------------------------------------------------------------------------------------------

function context(url: string, method: string, env: Record<string, unknown>) {
  const origin = new URL(url).origin;
  return {
    request: new Request(url, { method, headers: method === 'GET' ? {} : { origin } }),
    url: new URL(url),
    params: {},
    locals: { runtime: { env } } as Record<string, unknown>,
  };
}

async function run(url: string, method: string, env: Record<string, unknown>) {
  const { onRequest } = await import('../../apps/admin-next/src/middleware.ts');
  const ctx = context(url, method, env);
  const calls: (string | undefined)[] = [];
  const response = (await onRequest(
    ctx as never,
    (async (rewrite?: string) => {
      calls.push(rewrite);
      return new Response('page');
    }) as never,
  )) as Response;
  return { response, calls, locals: ctx.locals };
}

const PROTECTED = [
  '/',
  '/participation',
  '/review/churches',
  '/review/providers/pf_1',
  '/review/events',
  '/legal',
  '/security',
  '/not-a-page',
  '/users',
  '/analytics',
];

test('outside local, every request without a valid Access assertion is refused before any page runs', async () => {
  const d1 = await migrated();
  const env = {
    DB: d1,
    ENVIRONMENT: 'production',
    SESSION_SECRET: SECRET,
    CF_ACCESS_TEAM_NAME: 't',
    CF_ACCESS_AUD: 'a',
  };
  for (const path of [...PROTECTED, '/signin', '/signout', '/api/events/pending', '/api/review/events/e1']) {
    for (const method of ['GET', 'POST']) {
      const { response, calls } = await run(`https://admin.example.test${path}`, method, env);
      assert.equal(calls.length, 0, `${method} ${path} reached a page without Access`);
      assert.equal(response.status, 401, `${method} ${path}`);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.ok(!response.headers.get('set-cookie'));
    }
  }
  // A forged assertion is not an assertion.
  const forged = new Request('https://admin.example.test/participation', {
    headers: { 'cf-access-jwt-assertion': 'a.b.c' },
  });
  const { onRequest } = await import('../../apps/admin-next/src/middleware.ts');
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = (await onRequest(
      { request: forged, url: new URL(forged.url), params: {}, locals: { runtime: { env } } } as never,
      (async () => new Response('page')) as never,
    )) as Response;
    assert.equal(response.status, 401);
  } finally {
    console.error = originalError;
  }
});

test('an unset or unknown ENVIRONMENT is treated as not local', async () => {
  const d1 = await migrated();
  for (const ENVIRONMENT of [undefined, '', 'staging', 'LOCAL']) {
    const { response, calls } = await run('http://127.0.0.1:4326/participation', 'GET', {
      DB: d1,
      ENVIRONMENT,
      SESSION_SECRET: SECRET,
    });
    assert.equal(calls.length, 0, String(ENVIRONMENT));
    assert.ok([401, 403, 503].includes(response.status), `${ENVIRONMENT} answered ${response.status}`);
  }
});

test('locally, with no session, pages are answered by the sign-in page and APIs and writes by 401', async () => {
  const d1 = await migrated();
  const env = { DB: d1, ENVIRONMENT: 'local', SESSION_SECRET: SECRET };
  for (const path of PROTECTED) {
    const { response, calls, locals } = await run(`http://127.0.0.1:4326${path}`, 'GET', env);
    assert.deepEqual(calls, ['/signin'], `${path} must be rewritten to the sign-in page`);
    assert.equal((locals.signIn as { reason: string }).reason, 'required');
    assert.equal(locals.adminAuthSession, undefined);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  for (const path of ['/participation', '/security', '/review/events', '/not-a-page']) {
    const { response, calls } = await run(`http://127.0.0.1:4326${path}`, 'POST', env);
    assert.equal(calls.length, 0, `POST ${path}`);
    assert.equal(response.status, 401);
  }
  for (const path of ['/api/events/pending', '/api/participation/review-queue', '/api/staff/provision']) {
    const { response, calls } = await run(`http://127.0.0.1:4326${path}`, 'GET', env);
    assert.equal(calls.length, 0, path);
    assert.equal(response.status, 401);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    assert.equal(response.headers.get('www-authenticate'), null, 'no emergency Basic/Bearer challenge');
  }
  // The sign-in and sign-out pages themselves stay reachable, as pages (no rewrite).
  for (const path of ['/signin', '/signout']) {
    const { calls } = await run(`http://127.0.0.1:4326${path}`, 'GET', env);
    assert.deepEqual(calls, [undefined]);
  }
});

test('there is no emergency credential: break-glass headers do not open anything', async () => {
  const d1 = await migrated();
  const env = {
    DB: d1,
    ENVIRONMENT: 'local',
    SESSION_SECRET: SECRET,
    ENABLE_BREAK_GLASS_AUTH: 'true',
    ADMIN_ACCESS_TOKEN: 'a-very-long-emergency-token',
    ADMIN_SECRET_KEY: 'a-very-long-emergency-key',
    ADMIN_BASIC_AUTH_USER: 'admin',
    ADMIN_BASIC_AUTH_PASS: 'a-very-long-emergency-pass',
  };
  const { onRequest } = await import('../../apps/admin-next/src/middleware.ts');
  const headersList: Record<string, string>[] = [
    { authorization: 'Bearer a-very-long-emergency-token' },
    { 'x-admin-key': 'a-very-long-emergency-key' },
    { authorization: `Basic ${btoa('admin:a-very-long-emergency-pass')}` },
  ];
  for (const headers of headersList) {
    for (const path of ['/legal', '/security', '/not-a-page']) {
      const request = new Request(`http://127.0.0.1:4326${path}`, { headers });
      const calls: (string | undefined)[] = [];
      await onRequest(
        { request, url: new URL(request.url), params: {}, locals: { runtime: { env } } } as never,
        (async (rewrite?: string) => {
          calls.push(rewrite);
          return new Response('page');
        }) as never,
      );
      assert.deepEqual(calls, ['/signin'], `${path} with ${Object.keys(headers)[0]}`);
    }
  }
  assert.ok(
    !/BREAK_GLASS|ADMIN_ACCESS_TOKEN|ADMIN_SECRET_KEY|ADMIN_BASIC_AUTH/.test(
      sources()
        .map((s) => s.text)
        .join('\n'),
    ),
  );
});

// ---------------------------------------------------------------------------------------------
// Source rules: one shell, no mock data, no literal counts.
// ---------------------------------------------------------------------------------------------

function sources(dir = APP): { path: string; text: string }[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : [{ path, text: readFileSync(path, 'utf8') }];
  });
}

test('every page renders inside the admin layout and none imports the public layout or demo shell', () => {
  const files = sources();
  for (const { path, text } of files) {
    if (path.includes('/pages/') && path.endsWith('.astro') && !path.endsWith('/index.astro')) {
      assert.match(text, /<AdminLayout\b/, `${path} does not render through AdminLayout`);
    }
    assert.ok(
      !/components\/BaseLayout|components\/SiteHeader|components\/SiteFooter|components\/dashboard\/|lib\/dashboard|DEMO_PERSONA|WorkspaceScreen/.test(
        text,
      ),
      `${path} imports the public layout or the demo dashboard shell`,
    );
  }
});

test('no mock data, placeholder text or literal counts in the admin source', () => {
  for (const { path, text } of sources()) {
    assert.ok(
      !/coming soon|lorem ipsum|placeholder|\bTODO\b|\bFIXME\b|\bmock\b|fake data/i.test(text),
      `${path}: placeholder or mock text`,
    );
    assert.ok(!/\bbadge\s*[:=]\s*['"{]?\s*\d/.test(text), `${path}: literal badge value`);
    assert.ok(
      !/\bcount\s*[:=]\s*\d+\b/.test(text.replace(/let counts = null/g, '')),
      `${path}: literal count`,
    );
  }
});
