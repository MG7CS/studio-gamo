/**
 * Browser side of `WizardCard`: shows the photo that belongs to the screen the form wizard is on. The wizard
 * script sets `data-wizard-current-section="{sectionId}"` on the form after every move; this watches that
 * attribute and shows the wrapper whose `data-wizard-photo` lists the section (the default wrapper when none
 * does), hiding the others with the `hidden` attribute. Without JavaScript the default photo stays visible.
 * Idempotent: a card already wired carries `data-wizard-photos-ready`.
 */
const CARD = '[data-wizard-card]';

function show(card: Element, sectionId: string | null): void {
  const wrappers = [...card.querySelectorAll<HTMLElement>('[data-wizard-photo]')];
  if (wrappers.length === 0) return;
  const match =
    (sectionId && wrappers.find((w) => (w.dataset.wizardPhoto ?? '').split(' ').includes(sectionId))) ||
    wrappers.find((w) => w.hasAttribute('data-wizard-photo-default')) ||
    wrappers[0]!;
  for (const w of wrappers) w.hidden = w !== match;
}

export function initWizardPhotos(root: ParentNode = document): void {
  for (const card of root.querySelectorAll<HTMLElement>(CARD)) {
    if (card.hasAttribute('data-wizard-photos-ready')) continue;
    const form = card.querySelector<HTMLFormElement>('form[data-wizard]');
    if (!form) continue;
    card.setAttribute('data-wizard-photos-ready', '');
    const update = () => show(card, form.getAttribute('data-wizard-current-section'));
    new MutationObserver(update).observe(form, {
      attributes: true,
      attributeFilter: ['data-wizard-current-section'],
    });
    update();
  }
}
