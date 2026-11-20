import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { instruments } from '../../apps/academy/src/data/instruments.ts';

test('LinkRows names each action link after its row, so Register links are distinct', () => {
  const source = readFileSync('packages/ui/src/components/content/LinkRows.astro', 'utf8');
  assert.match(source, /\{item\.action\.label\}\s*<span class="sr-only"> for \{item\.title\}<\/span>/);
  const names = instruments.map((i) => `Register for ${i.name}`);
  assert.equal(new Set(names).size, instruments.length);
});
