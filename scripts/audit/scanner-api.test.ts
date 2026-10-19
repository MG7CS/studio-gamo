/**
 * HTTP tests of the door-scanner API routes (Agent C), calling the real route handlers and checking
 * every JSON response against the bundled OpenAPI contract (openapi/bundled/internal.json).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  createFixture,
  issueTickets,
  scannerDevice,
  seedEvent,
  TEST_ENV,
  type Fixture,
} from '../../packages/domain/src/services/ticketing/scanning-test-fixtures.ts';
import { uploadVenueMap } from '../../packages/domain/src/services/ticketing/venue-maps.ts';
import { SCANNER_COOKIE_NAME } from '../../packages/domain/src/services/ticketing/scanner-sessions.ts';
import { withSecurityHeaders } from '../../packages/domain/src/http/security-headers.ts';
import * as scanRoute from '../../apps/live/src/pages/api/scanner/scan.ts';
import * as lookupRoute from '../../apps/live/src/pages/api/scanner/lookup.ts';
import * as overrideRoute from '../../apps/live/src/pages/api/scanner/override.ts';
import * as manifestRoute from '../../apps/live/src/pages/api/scanner/manifest.ts';
import * as syncRoute from '../../apps/live/src/pages/api/scanner/sync.ts';
import * as headcountRoute from '../../apps/live/src/pages/api/scanner/headcount.ts';
import * as venueMapRoute from '../../apps/live/src/pages/api/venue-maps/[id].ts';

const spec = JSON.parse(readFileSync('openapi/bundled/internal.json', 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: 'contract', ...spec });
const ORIGIN = 'https://live.example.test';
const NOW = Math.floor(Date.now() / 1000);

function validate(path: string, method: string, status: number, body: unknown) {
  let declared = spec.paths[path][method].responses[String(status)];
  assert.ok(declared, `${method} ${path} does not declare ${status}`);
  if (declared.$ref)
    declared = declared.$ref
      .split('/')
      .slice(1)
      .reduce((x: Record<string, unknown>, k: string) => x[k] as Record<string, unknown>, spec);
  const schema = declared.content?.['application/json']?.schema;
  if (!schema) return;
  const rewrite = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(rewrite)
      : x && typeof x === 'object'
        ? Object.fromEntries(
            Object.entries(x).map(([k, v]) => [k, k === '$ref' ? `contract${v}` : rewrite(v)]),
          )
        : x;
  const check = ajv.compile(rewrite(schema) as object);
  assert.ok(check(body), `${method} ${path} ${status}: ${JSON.stringify(check.errors)}`);
}

type Route = {
  GET?: (c: never) => Response | Promise<Response>;
  POST?: (c: never) => Response | Promise<Response>;
};

async function call(
  f: Fixture,
  route: Route,
  path: string,
  method: 'GET' | 'POST',
  opts: {
    body?: unknown;
    cookie?: string;
    query?: string;
    headers?: Record<string, string>;
    env?: Record<string, unknown>;
    params?: Record<string, string>;
  } = {},
) {
  const url = `${ORIGIN}${path.replace('{id}', opts.params?.id ?? '')}${opts.query ?? ''}`;
  const request = new Request(url, {
    method,
    headers: {
      ...(method === 'POST' ? { 'content-type': 'application/json', origin: ORIGIN } : {}),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...opts.headers,
    },
    body: method === 'POST' ? JSON.stringify(opts.body ?? {}) : undefined,
  });
  const env = { ...TEST_ENV, DB: f.d1, ...opts.env };
  const handler = route[method]!;
  const response = await handler({
    request,
    url: new URL(url),
    params: opts.params ?? {},
    locals: { runtime: { env } },
  } as never);
  const text = await response.text();
  const json = response.headers.get('content-type')?.startsWith('application/json') ? JSON.parse(text) : text;
  if (response.status !== 304) validate(path, method.toLowerCase(), response.status, json);
  return { status: response.status, json, headers: response.headers };
}

async function setup() {
  const f = await createFixture();
  const eventId = seedEvent(f, {
    eventId: 'evt_api',
    startsAt: NOW + 3600,
    tiers: [{ id: 'tier_ga', capacity: 20, name: 'General' }],
  });
  const other = seedEvent(f, { eventId: 'evt_api_other', startsAt: NOW + 3600 });
  const tickets = await issueTickets(f, {
    eventId,
    categoryId: 'tier_ga',
    quantity: 2,
    holderName: 'Sample Guest',
    email: 'guest@example.org',
    now: NOW,
  });
  const sup = await scannerDevice(f, { eventId, now: NOW, canOverride: true });
  const cookie = `${SCANNER_COOKIE_NAME}=${encodeURIComponent(sup.unlocked.cookieValue)}`;
  return { f, eventId, other, tickets, sup, cookie };
}

describe('scanner API routes', () => {
  test('anonymous callers get 401; an ended scanner cookie says to ask for a new link', async () => {
    const { f, eventId } = await setup();
    for (const [route, path, method] of [
      [scanRoute, '/api/scanner/scan', 'POST'],
      [lookupRoute, '/api/scanner/lookup', 'POST'],
      [overrideRoute, '/api/scanner/override', 'POST'],
      [syncRoute, '/api/scanner/sync', 'POST'],
      [manifestRoute, '/api/scanner/manifest', 'GET'],
      [headcountRoute, '/api/scanner/headcount', 'GET'],
    ] as const) {
      const r = await call(f, route as Route, path, method, {
        query: `?eventId=${eventId}`,
        body: { eventId, code: 'x', direction: 'in' },
        env: { SESSION_SECRET: 'scanner-api-test-session-secret-000000000001' },
      });
      assert.equal(r.status, 401, `${method} ${path}`);
    }
    const ended = await call(f, scanRoute, '/api/scanner/scan', 'POST', {
      cookie: `${SCANNER_COOKIE_NAME}=sdev_nope.123.abc`,
      body: { eventId, code: 'x', direction: 'in' },
    });
    assert.equal(ended.status, 401);
    assert.match(ended.json.error.message, /ask the organizer for a new one/);
  });

  test('scan, repeat, headcount, manifest (ETag/304), lookup, override and sync match the contract', async () => {
    const { f, eventId, tickets, cookie } = await setup();
    const scan = await call(f, scanRoute, '/api/scanner/scan', 'POST', {
      cookie,
      body: { eventId, code: tickets[0].payload, direction: 'in', clientScanId: 'api-1' },
    });
    assert.equal(scan.status, 200);
    assert.equal(scan.json.data.result, 'admitted');
    assert.equal(scan.json.data.ticket.holder, 'Sample G.');
    assert.equal(scan.headers.get('cache-control'), 'private, no-store');
    const again = await call(f, scanRoute, '/api/scanner/scan', 'POST', {
      cookie,
      body: { eventId, code: tickets[0].payload, direction: 'in', clientScanId: 'api-1' },
    });
    assert.equal(again.json.data.repeated, true);

    const count = await call(f, headcountRoute, '/api/scanner/headcount', 'GET', {
      cookie,
      query: `?eventId=${eventId}`,
    });
    assert.equal(count.json.data.insideNow, 1);

    const manifest = await call(f, manifestRoute, '/api/scanner/manifest', 'GET', {
      cookie,
      query: `?eventId=${eventId}`,
    });
    assert.equal(manifest.status, 200);
    assert.ok(!JSON.stringify(manifest.json).includes('@'), 'no emails in the manifest');
    const etag = manifest.headers.get('etag')!;
    const cached = await call(f, manifestRoute, '/api/scanner/manifest', 'GET', {
      cookie,
      query: `?eventId=${eventId}`,
      headers: { 'if-none-match': etag },
    });
    assert.equal(cached.status, 304);

    const lookup = await call(f, lookupRoute, '/api/scanner/lookup', 'POST', {
      cookie,
      body: { eventId, query: 'guest@example.org' },
    });
    assert.equal(lookup.json.data.results.length, 2);
    assert.equal(lookup.json.data.results[0].emailMasked, 'g•••@example.org');

    const override = await call(f, overrideRoute, '/api/scanner/override', 'POST', {
      cookie,
      body: { eventId, ticketId: tickets[1].id, reason: 'Phone battery died' },
    });
    assert.equal(override.json.data.result, 'override_admitted');

    const sync = await call(f, syncRoute, '/api/scanner/sync', 'POST', {
      cookie,
      body: {
        eventId,
        scans: [
          {
            clientScanId: 'off-1',
            code: tickets[0].payload,
            direction: 'out',
            deviceScannedAt: NOW,
            localResult: 'exited',
          },
        ],
      },
    });
    assert.equal(sync.json.data.results[0].result, 'exited');
    assert.equal(sync.json.data.needsReview, 0);

    const bad = await call(f, scanRoute, '/api/scanner/scan', 'POST', {
      cookie,
      body: { eventId, code: 'x', direction: 'sideways' },
    });
    assert.equal(bad.status, 400);
  });

  test('a device is refused on another event (403) and cross-origin POSTs are refused', async () => {
    const { f, other, tickets, cookie } = await setup();
    const cross = await call(f, scanRoute, '/api/scanner/scan', 'POST', {
      cookie,
      body: { eventId: other, code: tickets[0].payload, direction: 'in' },
    });
    assert.equal(cross.status, 403);
    assert.equal(cross.json.error.code, 'NOT_ALLOWED');
    const manifest = await call(f, manifestRoute, '/api/scanner/manifest', 'GET', {
      cookie,
      query: `?eventId=${other}`,
    });
    assert.equal(manifest.status, 403);
    const csrf = await call(f, scanRoute, '/api/scanner/scan', 'POST', {
      cookie,
      headers: { origin: 'https://evil.example' },
      body: { eventId: other, code: 'x', direction: 'in' },
    });
    assert.equal(csrf.status, 403);
    assert.equal(f.q('SELECT count(*) AS n FROM ticket_scan_events').n, 0);
  });

  test('without the QR key outside local, scanning answers 503 and tells staff what to do', async () => {
    const { f, eventId, tickets, cookie } = await setup();
    const r = await call(f, scanRoute, '/api/scanner/scan', 'POST', {
      cookie,
      env: { TICKET_QR_SECRET_GL1: undefined },
      body: { eventId, code: tickets[0].payload, direction: 'in' },
    });
    assert.equal(r.status, 503);
    assert.match(r.json.error.message, /printed guest list/);
  });
});

describe('venue map image route', () => {
  test('serves the blueprint as a sandboxed, nosniff image that keeps its CSP through the header middleware', async () => {
    const f = await createFixture();
    const eventId = seedEvent(f, { startsAt: NOW + 3600 });
    const store = new Map<string, Uint8Array>();
    const bucket = {
      async get(key: string) {
        const v = store.get(key);
        return v ? { arrayBuffer: async () => v.slice().buffer } : null;
      },
      async put(key: string, value: unknown) {
        store.set(key, value as Uint8Array);
      },
      async delete() {},
    };
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5"/></svg>',
    );
    const up = await uploadVenueMap(f.db, bucket, { eventId, bytes: svg, altText: 'Sample hall', now: NOW });
    assert.ok(up.ok);
    const r = await call(f, venueMapRoute, '/api/venue-maps/{id}', 'GET', {
      params: { id: up.map.id },
      env: { MEDIA_BUCKET: bucket },
    });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/svg+xml');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.match(r.headers.get('content-security-policy')!, /^sandbox; default-src 'none'/);
    const wrapped = withSecurityHeaders(new Response('x', { headers: r.headers }), {
      enforceCsp: true,
      https: true,
    });
    assert.match(
      wrapped.headers.get('content-security-policy')!,
      /^sandbox/,
      'middleware keeps the sandbox CSP',
    );
    const missing = await call(f, venueMapRoute, '/api/venue-maps/{id}', 'GET', {
      params: { id: 'vmap_doesnotexist0000000000' },
      env: { MEDIA_BUCKET: bucket },
    });
    assert.equal(missing.status, 404);
  });
});
