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
  config: { specifier: '@gamo/config', layer: 'foundation' },
  ui: { specifier: '@studio-gamo/ui', layer: 'foundation' },
  auth: { specifier: '@gamo/auth', layer: 'platform' },
  db: { specifier: '@gamo/db', layer: 'platform' },
  integrations: { specifier: '@studio-gamo/integrations', layer: 'platform' },
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
    if (other.layer === 'transitional') {
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
