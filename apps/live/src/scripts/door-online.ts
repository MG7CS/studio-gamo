/**
 * The door screen while offline (docs/LIVE_REQUIREMENTS.md §8.3 item 24): a visible danger notice, and every selling
 * action disabled (`disabled` on buttons, `aria-disabled` on both, links stop navigating). Sales need the server; there
 * is no offline queue. Back online, everything is enabled again.
 */
const notice = document.querySelector<HTMLElement>('[data-door-offline]');

function apply(online: boolean) {
  if (notice) notice.hidden = online;
  document.querySelectorAll<HTMLElement>('[data-door-sell]').forEach((el) => {
    if (online) el.removeAttribute('aria-disabled');
    else el.setAttribute('aria-disabled', 'true');
    if (el instanceof HTMLButtonElement) el.disabled = !online;
    if (el instanceof HTMLAnchorElement) {
      if (online) el.removeAttribute('tabindex');
      else el.setAttribute('tabindex', '-1');
    }
  });
}

document.addEventListener(
  'click',
  (event) => {
    const target = (event.target as Element | null)?.closest('a[data-door-sell][aria-disabled="true"]');
    if (target) event.preventDefault();
  },
  true,
);
document.addEventListener(
  'submit',
  (event) => {
    if (navigator.onLine) return;
    const form = event.target as HTMLFormElement | null;
    if (form?.querySelector('[data-door-sell]')) event.preventDefault();
  },
  true,
);
window.addEventListener('online', () => apply(true));
window.addEventListener('offline', () => apply(false));
apply(navigator.onLine);
