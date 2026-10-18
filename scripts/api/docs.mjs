import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
mkdirSync('docs/api-reference', { recursive: true });
for (const scope of ['public', 'internal'])
  execFileSync(
    'pnpm',
    [
      'exec',
      'redocly',
      'build-docs',
      `openapi/bundled/${scope}.json`,
      '--disableGoogleFont',
      '-o',
      `docs/api-reference/${scope}.html`,
    ],
    { stdio: 'inherit' },
  );
