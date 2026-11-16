import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAMS, PROGRAM_IDS, programById, programNavItems } from './programs.ts';

test('programs are listed in owner order: Academy, Worship, Production', () => {
  assert.deepEqual(PROGRAM_IDS, ['academy', 'worship', 'production']);
  assert.deepEqual(
    PROGRAMS.map((p) => p.name),
    ['Academy', 'Worship', 'Production'],
  );
  assert.deepEqual(
    PROGRAMS.map((p) => p.fullName),
    ['Gamo Academy', 'Gamo Worship', 'Gamo Production'],
  );
});

test('programNavItems resolves each program through the given resolver, in order', () => {
  const items = programNavItems((id) => `https://${id}.example.test/`);
  assert.deepEqual(items, [
    { key: 'academy', label: 'Academy', href: 'https://academy.example.test/' },
    { key: 'worship', label: 'Worship', href: 'https://worship.example.test/' },
    { key: 'production', label: 'Production', href: 'https://production.example.test/' },
  ]);
});

test('programNavItems can use full names as labels', () => {
  const labels = programNavItems(() => '/', { label: 'fullName' }).map((i) => i.label);
  assert.deepEqual(labels, ['Gamo Academy', 'Gamo Worship', 'Gamo Production']);
});

test('programById finds a program and rejects unknown IDs', () => {
  assert.equal(programById('worship').fullName, 'Gamo Worship');
  assert.throws(() => programById('live' as never), RangeError);
});
