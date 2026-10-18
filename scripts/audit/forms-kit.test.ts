/**
 * Static guarantees of the shared public-form kit (packages/ui/src/components/forms): CSP-safe markup,
 * consent boxes that are never pre-ticked, documented props, and constants that must agree with the
 * server-side guard.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { TURNSTILE_DUMMY_TOKEN } from '../../packages/domain/src/security/turnstile.ts';
import {
  TURNSTILE_RESPONSE_FIELD,
  TURNSTILE_WIDGET_ID,
} from '../../packages/domain/src/api/public-form-guard.ts';
import { TERMS_DOCUMENTS } from '../../packages/domain/src/terms/registry.ts';
import { termsConsentDocuments } from '../../packages/ui/src/lib/terms-links.ts';

const DIR = 'packages/ui/src/components/forms';
const files = readdirSync(DIR).filter((f) => f.endsWith('.astro'));
const source = (name: string) => readFileSync(`${DIR}/${name}`, 'utf8');

test('the kit has every component, each with a props comment block', () => {
  for (const name of [
    'TextField.astro',
    'EmailField.astro',
    'ConfirmEmailField.astro',
    'TermsConsent.astro',
    'MarketingConsent.astro',
    'TurnstileWidget.astro',
    'FormErrorSummary.astro',
    'SubmitButton.astro',
    'OnboardingStepper.astro',
  ]) {
    assert.ok(files.includes(name), name);
    assert.match(source(name), /^---\n\/\*\*[\s\S]*?Props/, `${name} documents its props`);
  }
});

test('CSP: no inline script code and no on*= handlers; the only external script is Turnstile', () => {
  for (const name of files) {
    const text = source(name);
    assert.ok(!/\son[a-z]+=/i.test(text.replace(/---[\s\S]*?---/, '')), `${name}: no on*= handler`);
    for (const m of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>|<script\b([^>]*)\/>/g)) {
      const attrs = m[1] ?? m[3] ?? '';
      const body = (m[2] ?? '').trim();
      if (/\bis:inline\b/.test(attrs)) {
        assert.match(
          attrs,
          /src=\{TURNSTILE_SCRIPT\}/,
          `${name}: inline-marked script must be the Turnstile src`,
        );
        assert.equal(body, '', `${name}: no inline code`);
      } else {
        // Bundled by Astro into an external file: only the shared client module.
        assert.match(
          body,
          /^import \{ initForms \} from '\.\.\/\.\.\/lib\/forms-client';\s*initForms\(\);$/,
          name,
        );
      }
    }
  }
  assert.match(
    source('TurnstileWidget.astro'),
    /'https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js'/,
  );
});

test('consent boxes are never pre-ticked and marketing is optional', () => {
  for (const name of ['TermsConsent.astro', 'MarketingConsent.astro']) {
    const text = source(name);
    assert.ok(
      !/\bchecked\b(?!\s*prop)/.test(text.replace(/\/\*\*[\s\S]*?\*\//, '')),
      `${name}: no checked attribute`,
    );
  }
  const marketing = source('MarketingConsent.astro');
  assert.ok(
    !/\brequired\b/.test(marketing.replace(/\/\*\*[\s\S]*?\*\//, '')),
    'marketing consent is optional',
  );
  assert.match(source('TermsConsent.astro'), /name="terms_slug"[\s\S]*name="terms_version"/);
});

test('constants agree with the server guard', () => {
  const widget = source('TurnstileWidget.astro');
  assert.ok(widget.includes(`'${TURNSTILE_DUMMY_TOKEN}'`), 'dummy token matches @gamo/domain/security');
  assert.ok(widget.includes(`id = '${TURNSTILE_WIDGET_ID}'`), 'default widget id matches the guard');
  assert.ok(widget.includes(`data-response-field-name="${TURNSTILE_RESPONSE_FIELD}"`));
  assert.ok(widget.includes(`name="${TURNSTILE_RESPONSE_FIELD}"`));
});

test('terms links point at gamostudio.org/legal/<slug> with the registry version', () => {
  const docs = termsConsentDocuments(TERMS_DOCUMENTS);
  for (const [i, d] of docs.entries()) {
    assert.equal(d.href, `https://gamostudio.org/legal/${TERMS_DOCUMENTS[i].slug}`);
    assert.equal(d.version, TERMS_DOCUMENTS[i].version);
    assert.equal(d.label, TERMS_DOCUMENTS[i].title);
  }
});
