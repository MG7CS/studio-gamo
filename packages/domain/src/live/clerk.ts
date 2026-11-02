/**
 * Clerk for Gamo Live organizers: Live's own Clerk application and its `*_LIVE` variables, on top of the shared
 * verification in `@gamo/platform/identity`. The server verifies the session token there, then starts Live's own
 * organizer session (see `organizers.ts`).
 */
import { clerkConfig, localSignInStandinAllowed, type ClerkConfig } from '@gamo/platform/identity';

type Env = { ENVIRONMENT?: unknown };

export type LiveClerkConfig = ClerkConfig;

/** Live's Clerk settings, or null when Clerk is not (fully) configured. Never throws. */
export function liveClerkConfig(env: Env): LiveClerkConfig | null {
  return clerkConfig(env, 'LIVE');
}

/** The local sign-in stand-in for the organizer area (see `localSignInStandinAllowed`). */
export function localSimulatedSignInAllowed(env: Env, hostname?: string): boolean {
  return localSignInStandinAllowed(env, liveClerkConfig(env), hostname);
}
