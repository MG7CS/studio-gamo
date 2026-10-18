import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeNextPath } from './auth-redirect.ts';

const ORIGIN = 'https://worship.gamostudio.org';

test('returns to the page the visitor asked for, query string included', () => {
  assert.equal(safeNextPath('/musician/profile', ORIGIN), '/musician/profile');
  assert.equal(safeNextPath('/church/events?tab=past&x=1', ORIGIN), '/church/events?tab=past&x=1');
  assert.equal(safeNextPath('/church/events#section', ORIGIN), '/church/events');
});

test('falls back to /account when there is nothing to return to', () => {
  assert.equal(safeNextPath(null, ORIGIN), '/account');
  assert.equal(safeNextPath('', ORIGIN), '/account');
});

test('never leaves this site or reaches an API route', () => {
  for (const hostile of [
    'https://evil.example/',
    '//evil.example/path',
    '/\\evil.example',
    '\\\\evil.example',
    '/\\/evil.example',
    'javascript:alert(1)',
    'data:text/html,hi',
    'evil.example',
    '/api/auth/session',
    '/%2F%2Fevil.example',
  ]) {
    const target = safeNextPath(hostile, ORIGIN);
    assert.ok(target.startsWith('/') && !target.startsWith('//'), `${hostile} -> ${target}`);
    assert.ok(!target.includes('evil.example') || target.startsWith('/%2F'), `${hostile} -> ${target}`);
    assert.ok(!target.startsWith('/api/'), `${hostile} -> ${target}`);
  }
  assert.equal(safeNextPath('https://evil.example/', ORIGIN), '/account');
  assert.equal(safeNextPath('//evil.example/path', ORIGIN), '/account');
  assert.equal(safeNextPath('/api/auth/session', ORIGIN), '/account');
});
