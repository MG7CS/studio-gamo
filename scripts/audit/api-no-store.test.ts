/** Every /api/* answer carries Cache-Control: no-store unless the handler set its own (D-123). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryD1 } from '../../packages/db/testing.ts';
import { applicationPages } from '../../packages/domain/src/api/page-middleware.ts';

test('API responses without Cache-Control get no-store; a handler-set value is kept; pages are unaffected', async () => {
  const middleware = applicationPages('web');
  const ctx = (path: string) => {
    const url = new URL(`https://web.example.test${path}`);
    return {
      request: new Request(url),
      url,
      locals: {
        runtime: {
          env: {
            ENVIRONMENT: 'production',
            DB: createInMemoryD1(),
            SESSION_SECRET: 'api-no-store-session-secret-0123456789abcdef',
          },
        },
      } as Record<string, unknown>,
      redirect: () => new Response(null, { status: 303 }),
    };
  };
  const bare = await middleware(
    ctx('/api/anything') as never,
    async () => new Response('{}', { status: 200 }),
  );
  assert.equal(bare.headers.get('cache-control'), 'no-store');
  assert.equal(await bare.text(), '{}');
  const custom = await middleware(
    ctx('/api/anything') as never,
    async () => new Response('x', { status: 202, headers: { 'Cache-Control': 'private, max-age=5' } }),
  );
  assert.equal(custom.headers.get('cache-control'), 'private, max-age=5');
  const err = await middleware(ctx('/api/anything') as never, async () =>
    Response.json({ error: 1 }, { status: 503 }),
  );
  assert.equal(err.status, 503);
  assert.equal(err.headers.get('cache-control'), 'no-store');
});
