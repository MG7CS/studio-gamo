/**
 * The basic behaviour every dashboard has, shared by the admin and the Live organizer area. It adds nothing visible:
 *
 *  - Menus (`<details data-menu>`): close on a press anywhere outside, on Escape (focus returns to the button that
 *    opened them), when focus leaves them, and when another menu opens, so only one is ever open.
 *  - Forms: after a form is submitted its submit buttons are disabled, so a double click cannot send it twice. They are
 *    enabled again if the person comes back with the browser's Back button. Opt out with `data-allow-resubmit`.
 *
 * Confirm panels (`ConfirmAction`) are deliberately not menus: pressing elsewhere must never dismiss a decision
 * halfway through. Without JavaScript everything still works; the menus just close by pressing their button again.
 */
const menus = (): HTMLDetailsElement[] =>
  Array.from(document.querySelectorAll<HTMLDetailsElement>('details[data-menu]'));

const closeOutside = (target: EventTarget | null) => {
  for (const menu of menus())
    if (menu.open && !(target instanceof Node && menu.contains(target))) menu.open = false;
};

document.addEventListener('pointerdown', (event) => closeOutside(event.target));
document.addEventListener('focusin', (event) => closeOutside(event.target));
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  for (const menu of menus()) {
    if (!menu.open) continue;
    const hadFocus = menu.contains(document.activeElement);
    menu.open = false;
    if (hadFocus) menu.querySelector<HTMLElement>('summary')?.focus();
  }
});
// Opening one menu closes the others (a toggle event does not bubble, so listen while capturing).
document.addEventListener(
  'toggle',
  (event) => {
    const opened = event.target;
    if (!(opened instanceof HTMLDetailsElement) || !opened.hasAttribute('data-menu') || !opened.open) return;
    for (const menu of menus()) if (menu !== opened) menu.open = false;
  },
  true,
);

const SUBMITTERS = 'button[type="submit"], button:not([type]), input[type="submit"]';
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.hasAttribute('data-allow-resubmit')) return;
  if (form.dataset.submitting === '1') {
    event.preventDefault();
    return;
  }
  form.dataset.submitting = '1';
  // After this event finishes, so the pressed button's name and value are still sent with the form.
  setTimeout(() => {
    for (const b of form.querySelectorAll<HTMLButtonElement | HTMLInputElement>(SUBMITTERS)) {
      b.disabled = true;
      b.setAttribute('aria-busy', 'true');
    }
  }, 0);
});
// Coming back with the Back button shows the page as it was left, so the buttons must work again.
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  for (const form of document.querySelectorAll<HTMLFormElement>('form[data-submitting]')) {
    delete form.dataset.submitting;
    for (const b of form.querySelectorAll<HTMLButtonElement | HTMLInputElement>(SUBMITTERS)) {
      b.disabled = false;
      b.removeAttribute('aria-busy');
    }
  }
});
