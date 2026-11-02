/**
 * Reads an HMAC secret from the Worker environment, failing closed.
 *
 * - Set and ≥ 32 characters → returned.
 * - Missing/short with `ENVIRONMENT=local` → a fixed, clearly-named development key (so local forms and
 *   links work without setup) and one name-only warning per variable and isolate.
 * - Missing/short anywhere else → `SecretNotConfiguredError(name)` (callers answer 503).
 *
 * The local key is public by construction (it is in this file); it must never protect real data, which is
 * why it is refused outside `ENVIRONMENT=local`.
 */
import { isUsableSecret, SecretNotConfiguredError } from './crypto.ts';

const warned = new Set<string>();

/** The fixed development-only key used for `name` when `ENVIRONMENT=local` and the variable is unset. */
export function localDevelopmentSecret(name: string): string {
  return `local-development-only:${name}:not-a-secret:gamo`;
}

export function isLocalEnvironment(env: { ENVIRONMENT?: unknown } | null | undefined): boolean {
  return env?.ENVIRONMENT === 'local';
}

export function resolveEnvSecret(
  env: ({ ENVIRONMENT?: unknown } & Record<string, unknown>) | null | undefined,
  name: string,
): string {
  const value = env?.[name];
  if (isUsableSecret(value)) return value;
  if (!isLocalEnvironment(env)) throw new SecretNotConfiguredError(name);
  if (!warned.has(name)) {
    warned.add(name);
    console.warn(
      `[config] ${name} is not set; using a fixed local-development key (ENVIRONMENT=local only).`,
    );
  }
  return localDevelopmentSecret(name);
}
