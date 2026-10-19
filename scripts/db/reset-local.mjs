// Deletes the LOCAL D1 state of every app (apps/<app>/.wrangler/state/v3/d1) and the state shared by web, live and
// admin (.wrangler/shared-state/v3/d1). Local development
// data only; never touches preview or production. Run via `pnpm db:reset:local`, which re-applies
// all migrations afterwards.
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const shared = join('.wrangler', 'shared-state', 'v3', 'd1');
if (existsSync(shared)) {
  rmSync(shared, { recursive: true, force: true });
  console.log(`removed ${shared}`);
}

const apps = ['web', 'worship', 'academy', 'live', 'production', 'admin'];
for (const app of apps) {
  const dir = join('apps', app, '.wrangler', 'state', 'v3', 'd1');
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    console.log(`removed ${dir}`);
  }
}
