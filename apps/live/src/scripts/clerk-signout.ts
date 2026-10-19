/** Ends the Clerk session after the Gamo Live session was ended, so the next sign-in starts clean. */
import { loadClerk } from './clerk-client';

const el = document.querySelector<HTMLElement>('[data-clerk-signout]');
if (el?.dataset.frontendApi && el.dataset.publishableKey) {
  loadClerk(el.dataset.frontendApi, el.dataset.publishableKey)
    .then((clerk) => (clerk.session ? clerk.signOut() : undefined))
    .catch(() => undefined);
}
