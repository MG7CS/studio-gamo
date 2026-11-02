/**
 * The layer map used by `pnpm lint:layers` (docs/ARCHITECTURE.md, "Layers"). Imports run downward only:
 * foundation < platform < features < apps. Today only foundation, platform and apps exist as
 * packages; `domain` is transitional (it is split up and deleted by the end of phase 5), so what it
 * imports is reported but never counted as a violation.
 *
 * Plain .mjs because both eslint.layers.config.js and scripts/lint-layers.ts read it.
 */

/** package folder under packages/ -> the specifier other code imports it by */
export const PACKAGES = {
  core: { specifier: '@gamo/core', layer: 'foundation', standalone: true },
  config: { specifier: '@gamo/config', layer: 'foundation' },
  ui: { specifier: '@studio-gamo/ui', layer: 'foundation' },
  db: { specifier: '@gamo/db', layer: 'platform' },
  platform: { specifier: '@gamo/platform', layer: 'platform' },
  site: { specifier: '@gamo/site', layer: 'platform' },
  domain: { specifier: '@gamo/domain', layer: 'transitional' },
};

/** app folder under apps/ -> its workspace package name */
export const APPS = {
  web: 'apps-web',
  worship: 'apps-worship',
  academy: 'apps-academy',
  live: 'apps-live',
  production: 'apps-production',
  admin: 'apps-admin',
};

export const LAYER_ORDER = ['foundation', 'platform', 'transitional'];

/** Rule tags written into the ESLint messages and counted in the report. */
export const KINDS = {
  upward: 'a package imports a package in a higher layer',
  'package-to-app': 'a package imports an app',
  'app-to-app': 'an app imports another app',
  transitional: 'a foundation or platform package imports @gamo/domain (reported, not enforced)',
  standalone: 'a package that imports nothing from the repo (@gamo/core) imports another package',
  'platform-folder': 'a folder of packages/platform imports a sibling folder it may not use',
};

/**
 * Inside packages/platform, which sibling folders each folder may import (every folder may import core and
 * config). `db` imports no other folder; `security` may use `db` for the SqlDatabase type and its helpers.
 */
export const PLATFORM_FOLDERS = {
  db: [],
  security: ['db'],
  terms: ['db', 'security'],
  email: ['security', 'db'],
  identity: ['security'],
};

const specifierGroup = (specifier) => [specifier, `${specifier}/*`];
const appGroup = (folder) => [APPS[folder], `${APPS[folder]}/*`, `**/apps/${folder}`, `**/apps/${folder}/**`];

const layerIndex = (layer) => LAYER_ORDER.indexOf(layer);

/** Restricted-import patterns for the files of one package. */
export function patternsForPackage(folder) {
  const own = PACKAGES[folder];
  const patterns = [
    {
      group: Object.keys(APPS).flatMap(appGroup),
      message: `[package-to-app] packages/${folder} must not import an app`,
    },
  ];
  if (own.layer === 'transitional') return patterns;
  for (const [otherFolder, other] of Object.entries(PACKAGES)) {
    if (otherFolder === folder) continue;
    if (own.standalone) {
      patterns.push({
        group: [
          ...specifierGroup(other.specifier),
          `**/packages/${otherFolder}`,
          `**/packages/${otherFolder}/**`,
        ],
        message: `[standalone] packages/${folder} imports nothing from the repo, not ${other.specifier}`,
      });
    } else if (other.layer === 'transitional') {
      patterns.push({
        group: specifierGroup(other.specifier),
        message: `[transitional] packages/${folder} (${own.layer}) imports ${other.specifier}`,
      });
    } else if (layerIndex(other.layer) > layerIndex(own.layer)) {
      patterns.push({
        group: [
          ...specifierGroup(other.specifier),
          `**/packages/${otherFolder}`,
          `**/packages/${otherFolder}/**`,
        ],
        message: `[upward] packages/${folder} (${own.layer}) imports ${other.specifier} (${other.layer})`,
      });
    }
  }
  return patterns;
}

/** Restricted-import patterns for the files of one packages/platform folder (on top of the package's). */
export function patternsForPlatformFolder(folder) {
  const allowed = PLATFORM_FOLDERS[folder] ?? [];
  return Object.keys(PLATFORM_FOLDERS)
    .filter((other) => other !== folder && !allowed.includes(other))
    .map((other) => ({
      group: [
        `@gamo/platform/${other}`,
        `@gamo/platform/${other}/*`,
        `../${other}`,
        `../${other}/*`,
        `../${other}/**`,
        `**/platform/${other}`,
        `**/platform/${other}/**`,
      ],
      message: `[platform-folder] platform/${folder} may not import platform/${other}`,
    }));
}

/** Restricted-import patterns for the files of one app. */
export function patternsForApp(folder) {
  return [
    {
      group: Object.keys(APPS)
        .filter((other) => other !== folder)
        .flatMap(appGroup),
      message: `[app-to-app] apps/${folder} must not import another app`,
    },
  ];
}
