/**
 * Loads clerk-js from this product's own Clerk Frontend API (the one script origin the sign-in pages add to the
 * CSP) and returns the Clerk instance. Only the sign-in, sign-up and signed-out pages call it.
 */
export interface ClerkError {
  errors?: Array<{ code?: string; message?: string; longMessage?: string }>;
}
export interface SignInResource {
  status: string | null;
  createdSessionId: string | null;
  supportedFirstFactors?: Array<{ strategy: string; emailAddressId?: string }> | null;
  create(params: { identifier: string }): Promise<SignInResource>;
  prepareFirstFactor(params: { strategy: 'email_code'; emailAddressId: string }): Promise<SignInResource>;
  attemptFirstFactor(params: { strategy: 'email_code'; code: string }): Promise<SignInResource>;
}
export interface SignUpResource {
  status: string | null;
  createdSessionId: string | null;
  create(params: { emailAddress: string; firstName?: string; lastName?: string }): Promise<SignUpResource>;
  prepareEmailAddressVerification(params: { strategy: 'email_code' }): Promise<SignUpResource>;
  attemptEmailAddressVerification(params: { code: string }): Promise<SignUpResource>;
}
export interface ClerkInstance {
  load(): Promise<void>;
  session?: { getToken(): Promise<string | null> } | null;
  client?: { signIn: SignInResource; signUp: SignUpResource };
  setActive(params: { session: string | null }): Promise<void>;
  signOut(): Promise<void>;
}

declare global {
  interface Window {
    Clerk?: ClerkInstance;
  }
}

export function loadClerk(frontendApi: string, publishableKey: string): Promise<ClerkInstance> {
  return new Promise((resolve, reject) => {
    const ready = () => {
      const clerk = window.Clerk;
      if (!clerk) return reject(new Error('clerk_missing'));
      clerk.load().then(() => resolve(clerk), reject);
    };
    if (window.Clerk) return ready();
    const script = document.createElement('script');
    script.src = `${frontendApi}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.setAttribute('data-clerk-publishable-key', publishableKey);
    script.addEventListener('load', ready);
    script.addEventListener('error', () => reject(new Error('clerk_script')));
    document.head.appendChild(script);
  });
}

/** The first Clerk error code of a rejected call, if any. */
export function clerkErrorCode(error: unknown): string | null {
  return (error as ClerkError)?.errors?.[0]?.code ?? null;
}
