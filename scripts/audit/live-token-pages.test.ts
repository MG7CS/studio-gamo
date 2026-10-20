import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// These Gamo Live pages carry a secret in the URL (manage link, registration id, invitation token), so every
// response must send `Referrer-Policy: same-origin` (the page middleware turns the request into the header).
const PAGES = [
  'apps/live/src/pages/registrations/[token].astro',
  'apps/live/src/pages/events/[slug]/register/confirm.astro',
  'apps/live/src/pages/organizer/invite/[token].astro',
  // Paid tickets: the signed order link and the door staff link.
  'apps/live/src/pages/orders/[token].astro',
  'apps/live/src/pages/orders/return/[token].astro',
  'apps/live/src/pages/orders/[token]/transfer/[ticketId].astro',
  'apps/live/src/pages/orders/[token]/refund.astro',
  'apps/live/src/pages/door/[token]/index.astro',
  'apps/live/src/pages/door/[token]/[occurrenceId].astro',
];

for (const page of PAGES) {
  test(`${page} asks for Referrer-Policy: same-origin`, () => {
    const source = readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
    const frontmatter = source.split('---')[1] ?? '';
    assert.match(
      frontmatter,
      /requestSecurityHeaders\(Astro\.locals,\s*\{[^}]*\bnoReferrer:\s*true\b[^}]*\}\)/,
    );
    // It must run before any early `return`, so redirects and 404s carry it too.
    assert.ok(
      frontmatter.indexOf('requestSecurityHeaders(Astro.locals') < frontmatter.indexOf('return '),
      'requestSecurityHeaders must come before the first return',
    );
  });
}
