/**
 * Browser-side Clerk helpers shared by pages that are not the sign-in screen itself.
 *
 * Clerk keeps its own session at its Frontend API, separate from the `__session` cookie this site
 * reads. Clearing only our cookie would let the next page that loads Clerk mint it again, so signing
 * out must end the Clerk session too. A product without Clerk configured never loads any of this.
 */
interface ClerkSignOutLike {
  load(): Promise<void>;
  signOut(): Promise<void>;
}
type ClerkCtor = new (publishableKey: string) => ClerkSignOutLike;

export function isUsablePublishableKey(key: string | null | undefined): key is string {
  const value = (key ?? '').trim();
  return (
    (value.startsWith('pk_test_') || value.startsWith('pk_live_')) &&
    !value.includes('REPLACE_WITH') &&
    !value.includes('YOUR_') &&
    !value.includes('placeholder')
  );
}

/** Ends the Clerk session when Clerk is configured for this product; does nothing otherwise. */
export async function signOutOfClerk(publishableKey: string | null | undefined): Promise<void> {
  if (!isUsablePublishableKey(publishableKey)) return;
  const w = window as unknown as { Clerk?: ClerkSignOutLike };
  if (!w.Clerk) {
    const mod = (await import('@clerk/clerk-js')) as unknown as { Clerk?: ClerkCtor; default?: ClerkCtor };
    const Ctor = mod.Clerk ?? mod.default;
    if (!Ctor) throw new Error('Clerk SDK failed to load.');
    w.Clerk = new Ctor(publishableKey.trim());
  }
  await w.Clerk.load();
  await w.Clerk.signOut();
}
