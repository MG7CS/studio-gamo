import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// These Gamo Live pages carry a secret in the URL (manage link, registration id, invitation token), so every
// response must send `Referrer-Policy: same-origin` (the page middleware turns the request into the header).
const PAGES = [
  'apps/live/src/pages/registrations/[token].astro',
  'apps/live/src/pages/events/[id]/register/confirm.astro',
  'apps/live/src/pages/organizer/invite/[token].astro',
];

for (const page of PAGES) {
  test(`${page} asks for Referrer-Policy: same-origin`, () => {
    const source = readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
    const frontmatter = source.split('---')[1] ?? '';
    assert.match(frontmatter, /requestSecurityHeaders\(Astro\.locals,\s*\{\s*noReferrer:\s*true\s*\}\)/);
    // It must run before any early `return`, so redirects and 404s carry it too.
    assert.ok(
      frontmatter.indexOf('requestSecurityHeaders(Astro.locals') < frontmatter.indexOf('return '),
      'requestSecurityHeaders must come before the first return',
    );
  });
}
