import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { renderReport, toFinding, unmappedPackages } from './lint-layers.ts';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const eslint = new ESLint({ cwd: root, overrideConfigFile: join(root, 'eslint.layers.config.js') });

async function kindsFor(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: join(root, filePath) });
  return result.messages
    .map((m) => toFinding(filePath, m.line, m.message)?.kind)
    .filter((k): k is string => Boolean(k));
}

test('a foundation package importing platform, domain or an app is reported', async () => {
  assert.deepEqual(await kindsFor('packages/ui/src/x.ts', "import { a } from '@gamo/auth';\nvoid a;\n"), [
    'upward',
  ]);
  assert.deepEqual(
    await kindsFor('packages/config/x.ts', "import { a } from '@gamo/db/testing';\nvoid a;\n"),
    ['upward'],
  );
  assert.deepEqual(await kindsFor('packages/ui/src/x.ts', "import { a } from '@gamo/domain';\nvoid a;\n"), [
    'transitional',
  ]);
  assert.deepEqual(
    await kindsFor('packages/ui/src/x.ts', "import { a } from 'apps-live/src/x.ts';\nvoid a;\n"),
    ['package-to-app'],
  );
  assert.deepEqual(
    await kindsFor('packages/db/x.ts', "import { a } from '../../apps/live/src/x.ts';\nvoid a;\n"),
    ['package-to-app'],
  );
});

test('imports that go down, sideways inside a layer, or stay inside the package are fine', async () => {
  assert.deepEqual(
    await kindsFor('packages/ui/src/x.ts', "import { a } from '@gamo/config';\nvoid a;\n"),
    [],
  );
  assert.deepEqual(await kindsFor('packages/auth/x.ts', "import { a } from '@gamo/config';\nvoid a;\n"), []);
  assert.deepEqual(
    await kindsFor('packages/domain/src/x.ts', "import { a } from '@gamo/db';\nvoid a;\n"),
    [],
  );
  assert.deepEqual(await kindsFor('apps/live/src/x.ts', "import { a } from '@gamo/domain';\nvoid a;\n"), []);
});

test('an app importing another app is reported, its own package name is not', async () => {
  assert.deepEqual(
    await kindsFor('apps/live/src/x.ts', "import { a } from 'apps-admin/src/lib/nav.ts';\nvoid a;\n"),
    ['app-to-app'],
  );
  assert.deepEqual(
    await kindsFor('apps/web/src/x.ts', "import { a } from '../../../admin/src/x.ts';\nvoid a;\n"),
    [],
  );
  assert.deepEqual(
    await kindsFor('apps/web/src/x.ts', "import { a } from '../../../apps/admin/src/x.ts';\nvoid a;\n"),
    ['app-to-app'],
  );
  assert.deepEqual(await kindsFor('apps/live/src/x.ts', "import { a } from '../lib/y.ts';\nvoid a;\n"), []);
});

test('toFinding ignores messages that are not layer rules', () => {
  assert.equal(toFinding('a.ts', 1, 'Unexpected console statement'), null);
});

test('the report lists findings by kind and unmapped packages', () => {
  const report = renderReport(
    [{ kind: 'upward', file: 'packages/ui/src/x.ts', line: 3, imported: '@gamo/auth', detail: 'why' }],
    ['newpkg'],
    120,
  );
  assert.match(report, /Files checked: 120/);
  assert.match(report, /\| `upward` \| .* \| 1 \|/);
  assert.match(report, /`packages\/ui\/src\/x\.ts:3` imports `@gamo\/auth`: why/);
  assert.match(report, /`packages\/newpkg`/);
});

test('every package folder with a package.json is in the layer map', () => {
  assert.deepEqual(unmappedPackages(join(root, 'packages')), []);
});
