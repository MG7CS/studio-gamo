import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PaidError, SecretNotConfiguredError } from '@gamo/domain';
import { isFlashKey } from '@studio-gamo/ui/lib/flash';
import { DOOR_FLASH, doorErrorKey, doorErrorMessage, isDoorError } from './door-messages';

test('every door flash key is a valid flash key with words', () => {
  for (const [key, text] of Object.entries(DOOR_FLASH)) {
    assert.ok(isFlashKey(key), key);
    assert.ok(text.length > 5, key);
  }
});

test('errors map to the most specific words, then the code, then a plain fallback', () => {
  assert.equal(doorErrorKey(new PaidError('forbidden', { detail: 'comp' })), 'door-e-forbidden.comp');
  assert.equal(doorErrorKey(new PaidError('forbidden', { detail: 'unheard_of' })), 'door-e-forbidden');
  assert.equal(doorErrorKey(new PaidError('sold_out')), 'door-e-sold_out');
  assert.equal(doorErrorKey(new SecretNotConfiguredError('LIVE_TICKET_SECRET')), 'door-e-unavailable');
  assert.equal(doorErrorKey(new Error('x')), 'door-e-invalid');
  assert.match(
    doorErrorMessage(new PaidError('session_closed', { detail: 'no_open_session' })),
    /Open a cash drawer/,
  );
  for (const e of [new PaidError('reader_unavailable', { detail: 'busy' }), new PaidError('stale')])
    assert.ok(Object.hasOwn(DOOR_FLASH, doorErrorKey(e)));
  assert.equal(isDoorError(new PaidError('stale')), true);
  assert.equal(isDoorError(new TypeError('bug')), false);
});
