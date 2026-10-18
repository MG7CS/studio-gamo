/**
 * The one naming scheme for Clerk variables, and a check that reports what is missing.
 *
 * Every public product has its own Clerk application, so every deployed variable carries the
 * product suffix (`<NAME>_WEB`, `_WORSHIP`, `_ACADEMY`, `_LIVE`, `_PRODUCTION`). The un-suffixed
 * names (`CLERK_SECRET_KEY`, …) that Clerk's own tools print are accepted only on a developer
 * machine, where `env-loader.ts` aliases them to the suffixed names; a deployed Worker ignores
 * them so one product can never pick up another product's key by accident.
 *
 * Pure functions, no imports: `env-validation.ts`, `packages/auth/clerk.ts` and the tests share it.
 * Variables are reported by NAME only, never by value.
 */

/** Gamo Live's Clerk application. It belongs to Live alone; any other product using it is refused. */
export const GAMO_LIVE_CLERK_APP_ID = 'app_3KlWyOBL2xL2YzhJuvgk8QdrWIt';

export const CLERK_PRODUCTS = ['web', 'worship', 'academy', 'live', 'production'] as const;
export type ClerkProductName = (typeof CLERK_PRODUCTS)[number];

/** Un-suffixed names: local development only. */
export const CLERK_LEGACY_NAMES = [
  'PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'CLERK_JWT_KEY',
  'CLERK_ISSUER',
  'CLERK_APP_ID',
  'CLERK_AUTHORIZED_PARTIES',
] as const;

export function clerkVariableNames(product: ClerkProductName) {
  const suffix = product.toUpperCase();
  return {
    appId: `CLERK_APP_ID_${suffix}`,
    publishableKey: `PUBLIC_CLERK_PUBLISHABLE_KEY_${suffix}`,
    secretKey: `CLERK_SECRET_KEY_${suffix}`,
    jwtKey: `CLERK_JWT_KEY_${suffix}`,
    issuer: `CLERK_ISSUER_${suffix}`,
    authorizedParties: `CLERK_AUTHORIZED_PARTIES_${suffix}`,
  } as const;
}

/** Secrets to set with `wrangler secret put` (the app id and authorized parties are plain vars in wrangler.toml). */
export function clerkSecretNames(product: ClerkProductName): string[] {
  const n = clerkVariableNames(product);
  return [n.publishableKey, n.secretKey, n.jwtKey, n.issuer];
}

/** A value that is really there: not empty and not one of the template placeholders. */
export function isRealClerkValue(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    !value.includes('placeholder') &&
    !value.includes('REPLACE_WITH') &&
    !value.includes('YOUR_') &&
    !value.startsWith('pending_clerk_app_')
  );
}

export interface ClerkEnvDiagnosis {
  /** off: nothing set. ready: enough to run. partial: some set, not enough (Clerk stays off). */
  state: 'off' | 'ready' | 'partial';
  /** Names that stop Clerk from running. */
  missing: string[];
  /** Names that are not needed to run but should be set (verification without a network call; CSP origin). */
  recommended: string[];
  /** Un-suffixed names present; ignored on a deployed Worker. */
  legacy: string[];
  /** Development keys (`pk_test_` / `sk_test_`) found where `ENVIRONMENT=production`. */
  developmentKeysInProduction: string[];
}

export function diagnoseClerkEnv(
  product: ClerkProductName,
  env: Record<string, unknown> | undefined,
): ClerkEnvDiagnosis {
  const names = clerkVariableNames(product);
  const get = (name: string) => (isRealClerkValue(env?.[name]) ? (env?.[name] as string).trim() : undefined);
  const publishableKey = get(names.publishableKey);
  const secretKey = get(names.secretKey);
  const jwtKey = get(names.jwtKey);
  const issuer = get(names.issuer);

  const anySet = Boolean(publishableKey || secretKey || jwtKey || issuer);
  const missing: string[] = [];
  if (anySet) {
    if (!publishableKey) missing.push(names.publishableKey);
    if (!secretKey && !jwtKey) missing.push(names.secretKey, names.jwtKey);
  }
  const ready = Boolean(publishableKey && (secretKey || jwtKey));
  const recommended: string[] = [];
  if (ready) {
    if (!jwtKey) recommended.push(names.jwtKey);
    if (!secretKey) recommended.push(names.secretKey);
    if (!issuer) recommended.push(names.issuer);
  }

  const deployed = env?.ENVIRONMENT === 'preview' || env?.ENVIRONMENT === 'production';
  const legacy = deployed ? CLERK_LEGACY_NAMES.filter((name) => isRealClerkValue(env?.[name])) : [];

  const developmentKeysInProduction: string[] = [];
  if (env?.ENVIRONMENT === 'production') {
    if (publishableKey?.startsWith('pk_test_')) developmentKeysInProduction.push(names.publishableKey);
    if (secretKey?.startsWith('sk_test_')) developmentKeysInProduction.push(names.secretKey);
  }

  return {
    state: ready ? 'ready' : anySet ? 'partial' : 'off',
    missing,
    recommended,
    legacy: [...legacy],
    developmentKeysInProduction,
  };
}

/** The `-----BEGIN PUBLIC KEY-----` text with real line breaks, whichever way it was stored. */
export function normalizePemValue(value: string): string {
  const trimmed = value.trim().replace(/^(["'])([\s\S]*)\1$/, '$2');
  return trimmed
    .replace(/\\r\\n|\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .trim();
}

/**
 * Decodes the Frontend API domain embedded inside a Clerk Publishable Key (`pk_test_<base64>` or `pk_live_<base64>`).
 * Clerk publishable keys encode `<frontend-api-domain>$` in Base64 after the prefix.
 */
export function deriveFrontendApiFromPublishableKey(publishableKey?: string): string | null {
  if (!publishableKey) return null;
  const trimmed = publishableKey.trim();
  const match = /^pk_(?:test|live)_([A-Za-z0-9+/=_-]+)$/.exec(trimmed);
  if (!match) return null;
  try {
    const b64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const decoded = atob(padded);
    if (!decoded.endsWith('$')) return null;
    const host = decoded.slice(0, -1).trim().toLowerCase();
    if (!host || !host.includes('.')) return null;
    return `https://${host}`;
  } catch {
    return null;
  }
}
