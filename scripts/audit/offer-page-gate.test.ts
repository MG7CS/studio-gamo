import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const route = 'apps/admin/src/pages/api/requests/[id]/offers.ts';
const page = 'apps/web/src/pages/worship/offers/[token].astro';

test('sending offers stays closed until the public offer page exists, and opens with it', () => {
  const live = /const OFFER_PAGE_LIVE = true;/.test(readFileSync(route, 'utf8'));
  assert.equal(
    live,
    existsSync(page),
    existsSync(page)
      ? 'the offer page exists: set OFFER_PAGE_LIVE = true in the send-offer route'
      : 'the offer page is missing: OFFER_PAGE_LIVE must stay false so no dead links are emailed',
  );
});
