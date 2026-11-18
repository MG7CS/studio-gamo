/**
 * Static guarantees of the shared public-form kit (packages/ui/src/components/forms): CSP-safe markup,
 * consent boxes that are never pre-ticked, documented props, and constants that must agree with the
 * server-side guard.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
/** Source without the props comment block and frontmatter comments, for markup assertions. */
const markup = (name: string) => source(name).replace(/\/\*\*[\s\S]*?\*\//g, '');

/** Primitives behind the dynamic form renderer (Google-Forms question types) and registration forms. */
const FIELD_PRIMITIVES = [
  'TextareaField.astro',
  'SelectField.astro',
  'DateField.astro',
  'TimeField.astro',
  'FileField.astro',
];
const GROUP_PRIMITIVES = ['CheckboxGroup.astro', 'RadioGroup.astro', 'ScaleField.astro'];
const PRIMITIVES = [
  'RequiredMark.astro',
  'FieldError.astro',
  'FieldShell.astro',
  'Fieldset.astro',
  'ChoiceItem.astro',
  'Checkbox.astro',
  'ChoiceCard.astro',
  'FormComingSoon.astro',
  ...FIELD_PRIMITIVES,
  ...GROUP_PRIMITIVES,
];

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
    ...PRIMITIVES,
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

test('labelled fields: visible label, hint and error bound with aria-describedby, aria-invalid on error', () => {
  const shell = markup('FieldShell.astro');
  assert.match(shell, /<label for=\{id\}/, 'FieldShell renders a visible <label for>');
  assert.match(shell, /<RequiredMark/, 'required is marked in text');
  assert.match(shell, /id=\{ids\.hintId\}/);
  assert.match(shell, /<FieldError id=\{ids\.errorId\}/);
  for (const name of FIELD_PRIMITIVES) {
    const text = markup(name);
    assert.match(text, /<FieldShell\b/, `${name} uses FieldShell (label, hint, error)`);
    assert.match(text, /aria-describedby=\{ids\.describedBy\}/, `${name} binds hint + error`);
    assert.match(text, /aria-invalid=\{error \? 'true' : undefined\}/, `${name} marks errors`);
    assert.match(text, /required=\{required\}/, `${name} passes native required`);
  }
  const error = markup('FieldError.astro');
  assert.match(error, /data-error-text/, 'forms-client can update the error text');
  assert.match(error, /<span class="sr-only">Error: <\/span>/);
  assert.match(markup('RequiredMark.astro'), /<span class="sr-only">\(required\)<\/span>/);
});

test('groups use fieldset/legend with hint and error described, and an optional labelled "Other"', () => {
  const fieldset = markup('Fieldset.astro');
  assert.match(fieldset, /<fieldset\b/);
  assert.match(fieldset, /<legend\b/);
  assert.match(fieldset, /<slot name="legend">/, 'legend can be a slot');
  assert.match(fieldset, /aria-describedby=/);
  assert.match(fieldset, /<RequiredMark/);
  assert.match(fieldset, /<FieldError\b/);
  for (const name of GROUP_PRIMITIVES) {
    assert.match(markup(name), /<Fieldset\b/, `${name} is a fieldset`);
  }
  for (const name of ['CheckboxGroup.astro', 'RadioGroup.astro']) {
    const text = markup(name);
    assert.match(text, /OTHER_VALUE/, `${name} offers "Other"`);
    assert.match(text, /<label for=\{otherTextId\}/, `${name}: the "Other" text input has a label`);
  }
  assert.match(markup('CheckboxGroup.astro'), /rangeHint\(/, 'min/max stated as a hint');
  assert.match(markup('ScaleField.astro'), /role="radiogroup"/);
  assert.match(markup('RadioGroup.astro'), /role="radiogroup"/);
});

test('choices have 44 px hit areas and are never pre-ticked by default', () => {
  const item = markup('ChoiceItem.astro');
  assert.match(
    item,
    /<label\b[^>]*for=\{id\}[^>]*class:list=\{\[\s*'[^']*min-h-11/,
    'the whole row is the label',
  );
  assert.match(item, /type=\{type\}/);
  for (const name of ['Checkbox.astro', 'ChoiceItem.astro', 'ChoiceCard.astro']) {
    assert.match(source(name), /checked = false/, `${name}: unchecked unless the server re-renders a choice`);
  }
  assert.match(markup('Checkbox.astro'), /<ChoiceItem\b/);
  assert.match(markup('ChoiceCard.astro'), /min-h-11/);
  assert.match(markup('ScaleField.astro'), /size-11/, 'scale points are 44 × 44');
  // The 24 px audit finding: no bare 24 px checkbox without a 44 px label around it.
  for (const name of files) {
    assert.ok(!/type="checkbox"[^>]*h-6 w-6/.test(markup(name)), `${name}: use ChoiceItem for checkboxes`);
  }
  // Consent rows: the whole row is the label (≥ 44 px), with the checkbox inside it.
  for (const name of ['TermsConsent.astro', 'MarketingConsent.astro']) {
    const text = markup(name);
    assert.match(
      text,
      /<label\b[^>]*for=\{id\}[^>]*min-h-11[\s\S]*?<input\b[\s\S]*?<\/label>/,
      `${name}: row label`,
    );
  }
});

test('Academy uses the shared TermsConsent (its TermsCheckbox recipe is gone)', () => {
  assert.ok(!existsSync('apps/academy/src/components/registration/TermsCheckbox.astro'));
  const consents = readFileSync('apps/academy/src/components/registration/ConsentFields.astro', 'utf8');
  assert.match(consents, /from '@studio-gamo\/ui\/components\/forms\/TermsConsent\.astro'/);
  const names = [...consents.matchAll(/<TermsConsent\b[^>]*?name="([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(names, ['terms_accept', 'guardian_consent', 'child_safety_consent']);
});

test('form error red is one token everywhere (text-danger / border-danger)', () => {
  for (const name of files) {
    const text = markup(name);
    assert.ok(!/terracotta-deep|crimson/.test(text), `${name}: use the danger role for errors`);
  }
  assert.match(markup('ScaleField.astro'), /border-danger/, 'scale points show the invalid state');
});

test('file inputs state the allowed types and size before picking', () => {
  const text = markup('FileField.astro');
  assert.match(text, /type="file"/);
  assert.match(text, /accept=\{accept\}/);
  assert.match(text, /multiple=\{multiple\}/);
  assert.match(source('FileField.astro'), /requirementsText/, 'requirements text is built from props');
  assert.ok(
    text.indexOf('requirementsText') < text.indexOf('type="file"'),
    'requirements are rendered before the input',
  );
});

test('every form component uses semantic tokens only: no base palette names, arbitrary values or inline styles', () => {
  const base =
    /\b(?:bg|text|border|outline|ring|accent|fill|from|to|placeholder|file:bg|file:text)-(?:terracotta|ink|cream|sand|tan|line|muted|ivory|night|charcoal|gold|white|black|stone|crimson|forest)\b/;
  for (const name of files) {
    const text = markup(name);
    assert.ok(!base.test(text), `${name}: ${text.match(base)?.[0]} is a base token`);
    assert.ok(!/\w-\[[^\]]+\]/.test(text), `${name}: no arbitrary values`);
    assert.ok(!/\sstyle=/.test(text), `${name}: no inline style`);
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(text), `${name}: no hex colours`);
  }
});

test('FormComingSoon is shared (no app copies); the old apply and request pages redirect to the main-site forms', () => {
  for (const app of ['worship', 'production']) {
    assert.ok(!existsSync(`apps/${app}/src/components/FormComingSoon.astro`), `${app} copy removed`);
    for (const page of ['apply', 'request']) {
      const text = readFileSync(`apps/${app}/src/pages/${page}.astro`, 'utf8');
      assert.match(
        text,
        new RegExp(`Astro\\.redirect\\(siteUrl\\('web', '/${app}/${page}'\\)`),
        `${app}/${page} redirects to the form on the main site`,
      );
    }
  }
  const text = markup('FormComingSoon.astro');
  assert.ok(
    !/gamostudio|Worship|Production|Academy/.test(text),
    'no app or contact copy in the shared piece',
  );
  assert.match(source('FormComingSoon.astro'), /titleAs: TitleTag = 'h1'/, 'owns the page h1 by default');
  assert.match(text, /<TitleTag\b/, 'heading level from titleAs');
  assert.match(text, /encodeURIComponent\(subject\)/);
});

const UI = 'packages/ui/src/components';
const ui = (path: string) => readFileSync(`${UI}/${path}`, 'utf8').replace(/\/\*\*[\s\S]*?\*\//g, '');

test('BaseLayout states noindex in a robots meta tag', () => {
  assert.match(ui('BaseLayout.astro'), /noindex && <meta name="robots" content="noindex, nofollow" \/>/);
  assert.ok(
    !/name="robots"/.test(readFileSync('apps/web/src/pages/preview/catalog.astro', 'utf8')),
    'the catalog no longer needs its own robots meta',
  );
});

test('PageHero takes titleAs (h1 by default)', () => {
  assert.match(readFileSync(`${UI}/content/PageHero.astro`, 'utf8'), /titleAs: TitleTag = 'h1'/);
  assert.match(ui('content/PageHero.astro'), /<TitleTag\b/);
});

test('NumberedSteps never leaves an empty cell for 5 or 6 steps', () => {
  const text = ui('content/NumberedSteps.astro');
  assert.match(text, /data-cols=\{cols\}/);
  assert.match(text, /:last-child/, 'a short last row is centred or stretched');
});

test('Badge can wrap and documents the {undefined} child pitfall', () => {
  const text = readFileSync(`${UI}/content/Badge.astro`, 'utf8');
  assert.match(text, /wrap\?: boolean/);
  assert.match(text, /\{undefined\}/, 'JSDoc warns about the {undefined} child');
});

test('StatusPill always has a text label or an aria-label', () => {
  const text = readFileSync(`${UI}/StatusPill.astro`, 'utf8');
  assert.match(text, /\{ label: string; ariaLabel\?: never \}/);
  assert.match(text, /\{ ariaLabel: string; label\?: never \}/);
  assert.ok(!/<slot\s*\/>/.test(text), 'no slot: the label is a prop');
});

test('editorial pieces and ButtonLink use semantic tokens, not base palette names', () => {
  const base =
    /\b(?:bg|text|border|ring|divide|from|to)-(?:terracotta|ink|ink-soft|cream|sand|ivory|night|charcoal|gold|white|black|stone)\b/;
  for (const name of [
    'EditorialHeading.astro',
    'EditorialFeatureCard.astro',
    'FaqAccordion.astro',
    'ButtonLink.astro',
  ]) {
    const text = ui(name);
    assert.ok(!base.test(text), `${name}: ${text.match(base)?.[0]} is a base token`);
    assert.ok(!/\w-\[[^\]]+\]/.test(text), `${name}: no arbitrary values`);
  }
  assert.match(readFileSync(`${UI}/EditorialFeatureCard.astro`, 'utf8'), /'raised' \| 'inset' \| 'dark'/);
});
