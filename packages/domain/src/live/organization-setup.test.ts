import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  orderedSetupErrors,
  readSetupStep,
  readSetupValues,
  stepOfSetupError,
  validateSetupAll,
  validateSetupStep,
} from './organization-setup.ts';

const form = (o: Record<string, string>) => new Map(Object.entries(o));
const GOOD = {
  name: 'Grace Fellowship',
  kind: 'church',
  city: 'Phoenix',
  state: 'az',
  description: 'A church that hosts worship nights and youth concerts.',
  website: 'gracefellowship.org',
  contactEmail: '',
  terms: 'yes',
};

test('values are trimmed, the state is upper-cased and the kind defaults to church', () => {
  const v = readSetupValues(form({ ...GOOD, name: '  Grace Fellowship ', kind: '' }));
  assert.equal(v.name, 'Grace Fellowship');
  assert.equal(v.state, 'AZ');
  assert.equal(v.kind, 'church');
  assert.equal(v.terms, true);
});

test('step 1 needs a name, a kind, a city and a two-letter state, all reported at once', () => {
  const bad = validateSetupStep(
    1,
    readSetupValues(form({ name: 'x', kind: 'nope', city: '', state: 'Arizona' })),
  );
  assert.deepEqual(Object.keys(bad).sort(), ['city', 'kind', 'name', 'state']);
  assert.deepEqual(validateSetupStep(1, readSetupValues(form(GOOD))), {});
});

test('step 2 needs a real description and a website or a public contact email', () => {
  const v = (o: Record<string, string>) => readSetupValues(form({ ...GOOD, ...o }));
  assert.ok(validateSetupStep(2, v({ description: 'short' })).description);
  assert.deepEqual(validateSetupStep(2, v({})), {}, 'a website alone is enough (the scheme is added)');
  assert.deepEqual(
    validateSetupStep(2, v({ website: '', contactEmail: 'hello@grace.org' })),
    {},
    'so is an email alone',
  );
  assert.ok(validateSetupStep(2, v({ website: '', contactEmail: '' })).website, 'neither is not enough');
  assert.ok(validateSetupStep(2, v({ website: 'not a url' })).website);
  assert.ok(validateSetupStep(2, v({ contactEmail: 'nope' })).contactEmail);
});

test('step 3 needs the terms; the final check covers steps 1 and 2', () => {
  assert.ok(validateSetupStep(3, readSetupValues(form({ ...GOOD, terms: '' }))).terms);
  assert.deepEqual(validateSetupStep(3, readSetupValues(form(GOOD))), {});
  assert.deepEqual(validateSetupAll(readSetupValues(form(GOOD))), {});
  assert.ok(validateSetupAll(readSetupValues(form({ ...GOOD, city: '' }))).city);
});

test('the step comes from the post, Back skips checking, and the earliest error wins', () => {
  assert.deepEqual(readSetupStep(form({})), { step: 1, back: false });
  assert.deepEqual(readSetupStep(form({ step: '3', nav: 'back' })), { step: 3, back: true });
  assert.deepEqual(readSetupStep(form({ step: '9' })), { step: 1, back: false });
  assert.equal(stepOfSetupError({ description: 'x', city: 'y' }), 1);
  assert.equal(stepOfSetupError({ website: 'x' }), 2);
  assert.equal(stepOfSetupError({ terms: 'x' }), 3);
  assert.deepEqual(
    orderedSetupErrors({ terms: 't', name: 'n', website: 'w' }).map((e) => e.field),
    ['name', 'website', 'terms'],
  );
});
