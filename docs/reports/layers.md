# Layer report

Written by `pnpm lint:layers` (`scripts/lint-layers.ts`, rules in `scripts/layers/layer-map.mjs`). Report-only: nothing fails on it yet.

## Layer map today

| Layer | Packages |
| --- | --- |
| foundation | `@gamo/config` (packages/config), `@studio-gamo/ui` (packages/ui) |
| platform | `@gamo/auth` (packages/auth), `@gamo/db` (packages/db), `@studio-gamo/integrations` (packages/integrations) |
| transitional (reported, not enforced) | `@gamo/domain` (packages/domain) |
| apps | `apps/web`, `apps/worship`, `apps/academy`, `apps/live`, `apps/production`, `apps/admin` |

Rules: no upward import, no app importing another app, no package importing an app.

## Result

Files checked: 693 (every .ts and .astro file under apps/ and packages/).

| Kind | What | Count |
| --- | --- | --- |
| `upward` | a package imports a package in a higher layer | 0 |
| `package-to-app` | a package imports an app | 0 |
| `app-to-app` | an app imports another app | 0 |
| `transitional` | a foundation or platform package imports @gamo/domain (reported, not enforced) | 0 |

No import breaks the layer map.

## What this check does not cover

- Type references that are not imports: `packages/ui/tsconfig.json` includes `packages/auth/app-locals.d.ts` so `BaseLayout.astro` can read `locals.product` (a foundation package depending on a platform type).
- Dynamic `import()` calls and `require`.
- Imports between packages of the same layer (for example `auth` and `db`); the sibling rules are written when `platform` is created.
- `scripts/` and `tests/`, which are not layers. Several `scripts/audit/*.test.ts` import app code by relative path.
- Relative imports that reach another app without `apps/` in the path.
