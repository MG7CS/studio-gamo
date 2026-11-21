/**
 * Browser behaviour of the form wizard (`DynamicForm` with `wizard`): one screen at a time, Back and Next,
 * progress, focus, history and the live announcement. Without this module the server HTML is one complete,
 * scrolling form (the no-JavaScript baseline). Bundled by Astro into an external script (CSP: no inline
 * script). Idempotent: forms already wired carry `data-wizard-ready`.
 *
 * Markup contract (Task 2, `DynamicForm` / `SectionBlock` / `WizardControls`): `form[data-wizard]`; screens
 * `[data-wizard-screen][data-wizard-section]` inside `[data-dyn-section]`; the consent / Turnstile / submit
 * block `[data-wizard-final]`; `[data-wizard-controls]` with `[data-wizard-progress]`, `[data-wizard-status]`,
 * `[data-wizard-live]`, `[data-wizard-actions]`, `[data-wizard-back]`, `[data-wizard-next]`.
 *
 * Behaviour
 * - Init: unhide the controls, mark the form `data-wizard-active`, show only the current screen (the others
 *   get `hidden`), show the final block only on the last visible screen (kept
 *   rendered but invisible with `data-wizard-away`, never `hidden`: the real Cloudflare Turnstile widget cannot
 *   render or produce a token inside `display:none`, and the Send and chunked uploads read its token). The submit button(s) of the final
 *   block move once into the controls' action row, so on the last screen Back sits beside Send (Next is
 *   hidden there; Back is hidden on the first screen). The button is still inside the form.
 * - A screen is hidden when its section, or every question in it, carries the show-if `hidden` attribute
 *   (`lib/dynamic-form-client.ts` sets it; this module never writes it on sections or questions). Sections
 *   without the current screen get `data-wizard-off` (CSS in `styles/tokens.css` takes them out of the flow).
 *   Wizard-hidden controls stay enabled and are posted; only show-if disables controls.
 * - Recomputed after every move and on `input` / `change` (listeners added after the show-if ones, so they
 *   see its result) and on `pageshow`.
 * - Next validates the current screen's controls with `reportValidity()` (first invalid one only). Enter in
 *   an input advances on a non-final screen; on the final screen the browser submits as usual.
 * - Submit: a control the browser finds invalid on another screen (native validation cannot focus a hidden
 *   control) opens that screen and reports it there instead of failing silently.
 * - After every move: `data-wizard-current-section` on the form, progress marks (`aria-current="step"`),
 *   "Step n of N" in the status line and the polite live region, focus on the screen heading or its first
 *   control, and the card scrolled into view only when its top is off screen.
 * - History (the first wizard form of the page only): Next pushes `#step-n` (1-based screen index); browser
 *   Back/Forward shows the matching screen without scrolling; in-page Back pops our own entry. On load a
 *   `#step-n` is ignored (answers do not survive a reload): the wizard opens on the first visible screen, or,
 *   after a failed submit, on the first screen with an invalid control (the last screen when only the error
 *   summary has entries: Turnstile, consent). Focus then stays on the summary (`forms-client.ts`).
 * - Error summary links to a field on another screen open that screen and focus the field.
 * - Uploads: Next never waits for the chunked uploader; the existing submit guard still blocks sending
 *   while a file is going up, and the wizard then opens the screen holding the upload and scrolls to the
 *   guard's wait message.
 */
import {
  historyPushedAfter,
  isFinalAway,
  nextVisibleScreen,
  openingScreen,
  parseStepHash,
  resolveScreen,
  stepHash,
  stepStatusText,
  visibleScreenIndexes,
  type WizardScreen,
} from './dynamic-form-wizard.ts';

interface DomScreen extends WizardScreen {
  el: HTMLElement;
  section: HTMLElement | null;
}

interface Wizard {
  form: HTMLFormElement;
  screens: DomScreen[];
  current: number | null;
  final: HTMLElement | null;
  progress: HTMLOListElement | null;
  status: HTMLElement | null;
  live: HTMLElement | null;
  back: HTMLButtonElement;
  next: HTMLButtonElement;
  submits: HTMLButtonElement[];
  segmentClass: string;
  history: boolean;
}

interface HistoryMark {
  index: number;
  /** True for the entries Next pushed (in-page Back may pop them). */
  pushed: boolean;
}

const HISTORY_KEY = 'gamoWizard';
const CONTROL_SELECTOR = 'input, select, textarea';
const NO_ENTER_TYPES = new Set(['button', 'submit', 'reset', 'image', 'file']);

let historyTaken = false;

// ---------------------------------------------------------------------------
// Reading the markup
// ---------------------------------------------------------------------------

function readScreens(form: HTMLFormElement): DomScreen[] {
  return Array.from(form.querySelectorAll<HTMLElement>('[data-wizard-screen]')).map((el) => {
    const questionIds: string[] = [];
    const statementIds: string[] = [];
    for (const q of el.querySelectorAll<HTMLElement>('[data-dyn-question]')) {
      const id = q.dataset.dynQuestion ?? '';
      if (q.dataset.dynType === 'statement') statementIds.push(id);
      else questionIds.push(id);
    }
    return {
      el,
      section: el.closest<HTMLElement>('[data-dyn-section]'),
      id: el.dataset.wizardScreen ?? '',
      sectionId: el.dataset.wizardSection ?? '',
      questionIds,
      statementIds,
    };
  });
}

/** Hidden by show-if: the section is hidden, or every question (statements only when there is none) is. */
function isScreenHidden(screen: WizardScreen): boolean {
  const dom = screen as DomScreen;
  if (dom.section?.hidden) return true;
  let items = dom.el.querySelectorAll<HTMLElement>('[data-dyn-question]:not([data-dyn-type="statement"])');
  if (items.length === 0) items = dom.el.querySelectorAll<HTMLElement>('[data-dyn-question]');
  if (items.length === 0) return false;
  return Array.from(items).every((item) => item.hidden);
}

function screenControls(screen: DomScreen): HTMLElement[] {
  return Array.from(screen.el.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)).filter(
    (c) => !(c as HTMLInputElement).disabled && !c.closest('[hidden]'),
  );
}

/** The screen a control belongs to; a control outside every screen (consent) belongs to the last one. */
function screenIndexOf(w: Wizard, el: Element): number | null {
  const index = w.screens.findIndex((s) => s.el.contains(el));
  if (index !== -1) return index;
  const visible = visibleScreenIndexes(w.screens, isScreenHidden);
  return visible[visible.length - 1] ?? null;
}

function invalidQuestionIds(form: HTMLFormElement): string[] {
  const ids: string[] = [];
  for (const control of form.querySelectorAll<HTMLElement>('[aria-invalid="true"]')) {
    const id = control.closest<HTMLElement>('[data-dyn-question]')?.dataset.dynQuestion;
    // Inside a screen without question markup: `invalidScreenIds` finds it.
    if (id === undefined && control.closest('[data-wizard-screen]')) continue;
    // Outside every question and screen (consent): an id no screen holds, so the wizard opens on the last screen.
    ids.push(id ?? '');
  }
  return ids;
}

/** Ids of the screens that contain an invalid control (the fallback for screens without question markup). */
function invalidScreenIds(form: HTMLFormElement): string[] {
  const ids = new Set<string>();
  for (const control of form.querySelectorAll<HTMLElement>('[aria-invalid="true"]')) {
    const id = control.closest<HTMLElement>('[data-wizard-screen]')?.dataset.wizardScreen;
    if (id) ids.add(id);
  }
  return [...ids];
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderProgress(w: Wizard, visible: number[]): void {
  if (!w.progress) return;
  const items = w.progress.querySelectorAll('li');
  if (items.length !== visible.length) {
    w.progress.replaceChildren(
      ...visible.map(() => {
        const li = document.createElement('li');
        li.className = w.segmentClass;
        li.dataset.wizardSegment = '';
        return li;
      }),
    );
  }
  const position = w.current === null ? -1 : visible.indexOf(w.current);
  w.progress.querySelectorAll('li').forEach((li, i) => {
    li.dataset.state = i < position ? 'done' : i === position ? 'current' : 'todo';
    if (i === position) li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
  });
}

/** Shows the current screen and updates every control; `announce` also speaks the step. */
function render(w: Wizard, announce: boolean): void {
  const shown = w.current === null ? undefined : w.screens[w.current];
  if (!shown || isScreenHidden(shown)) w.current = resolveScreen(w.screens, w.current ?? 0, isScreenHidden);
  const current = w.current === null ? undefined : w.screens[w.current];
  const visible = visibleScreenIndexes(w.screens, isScreenHidden);
  const position = w.current === null ? 0 : visible.indexOf(w.current) + 1;
  const total = visible.length;
  const isLast = position === total;

  w.screens.forEach((s) => {
    s.el.hidden = s !== current;
  });
  for (const section of w.form.querySelectorAll<HTMLElement>('[data-dyn-section]')) {
    if (current && section.contains(current.el)) delete section.dataset.wizardOff;
    else section.dataset.wizardOff = '';
  }
  // Away, not `hidden`: the real Turnstile widget cannot render inside `display:none` (see tokens.css).
  if (w.final) w.final.toggleAttribute('data-wizard-away', isFinalAway(position, total));
  for (const submit of w.submits) submit.hidden = !isLast;
  w.next.hidden = isLast;
  w.back.hidden = position <= 1;
  if (w.progress) w.progress.hidden = total <= 1;
  if (w.status) w.status.hidden = total <= 1;
  renderProgress(w, visible);

  const text = total > 0 ? stepStatusText(position, total) : '';
  if (w.status) w.status.textContent = text;
  if (announce && w.live) w.live.textContent = text;
  if (current) w.form.dataset.wizardCurrentSection = current.sectionId;
  else delete w.form.dataset.wizardCurrentSection;
}

function focusScreen(w: Wizard, scroll: boolean): void {
  const screen = w.current === null ? undefined : w.screens[w.current];
  if (!screen) return;
  const heading = screen.el.querySelector<HTMLElement>('h1, h2, h3, h4, h5, h6');
  const target = heading ?? screenControls(screen).find((c) => (c as HTMLInputElement).type !== 'hidden');
  if (heading && !heading.hasAttribute('tabindex')) heading.tabIndex = -1;
  target?.focus({ preventScroll: true });
  if (!scroll) return;
  const card = w.form.closest<HTMLElement>('[data-wizard-card]') ?? w.form;
  const top = card.getBoundingClientRect().top;
  if (top < 0 || top > window.innerHeight) card.scrollIntoView({ block: 'start' });
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function readMark(state: unknown): HistoryMark | null {
  const mark = (state as Record<string, unknown> | null)?.[HISTORY_KEY] as HistoryMark | undefined;
  return mark && typeof mark.index === 'number' ? mark : null;
}

function markUrl(w: Wizard, index: number): string {
  const url = new URL(window.location.href);
  const first = visibleScreenIndexes(w.screens, isScreenHidden)[0];
  if (index === first) {
    if (parseStepHash(url.hash) !== null) url.hash = '';
  } else {
    url.hash = stepHash(index);
  }
  return url.href;
}

function writeHistory(w: Wizard, mode: 'push' | 'replace'): void {
  if (!w.history || w.current === null) return;
  const base = (window.history.state as Record<string, unknown> | null) ?? {};
  const pushed = historyPushedAfter(mode, readMark(base)?.pushed);
  const state = { ...base, [HISTORY_KEY]: { index: w.current, pushed } };
  try {
    if (mode === 'push') window.history.pushState(state, '', markUrl(w, w.current));
    else window.history.replaceState(state, '', markUrl(w, w.current));
  } catch {
    // History can be unavailable (sandboxed frames); the wizard works without it.
  }
}

function bindHistory(w: Wizard): void {
  window.addEventListener('popstate', (event) => {
    const index = readMark(event.state)?.index ?? parseStepHash(window.location.hash);
    if (index === null) return; // a fragment link of the page, not one of our steps
    const target = resolveScreen(w.screens, index, isScreenHidden);
    if (target === null) return;
    w.current = target;
    render(w, true);
    focusScreen(w, false);
  });
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

function moveTo(w: Wizard, index: number, history: 'push' | 'replace' | 'none'): void {
  w.current = index;
  render(w, true);
  focusScreen(w, true);
  if (history !== 'none') writeHistory(w, history);
}

/** The current screen's controls pass native validation; the first invalid one is reported. */
function validateCurrent(w: Wizard): boolean {
  const screen = w.current === null ? undefined : w.screens[w.current];
  if (!screen) return true;
  for (const control of screenControls(screen)) {
    const c = control as HTMLInputElement;
    if (typeof c.checkValidity === 'function' && !c.checkValidity()) {
      c.reportValidity();
      return false;
    }
  }
  return true;
}

function goNext(w: Wizard): void {
  if (w.current === null || !validateCurrent(w)) return;
  const target = nextVisibleScreen(w.screens, w.current, 1, isScreenHidden);
  if (target !== null) moveTo(w, target, 'push');
}

function goBack(w: Wizard): void {
  if (w.current === null) return;
  const target = nextVisibleScreen(w.screens, w.current, -1, isScreenHidden);
  if (target === null) return;
  const mark = readMark(window.history.state);
  if (w.history && mark?.pushed && mark.index === w.current) {
    window.history.back(); // popstate shows the screen Next came from
    return;
  }
  moveTo(w, target, 'replace');
}

// ---------------------------------------------------------------------------
// Bindings
// ---------------------------------------------------------------------------

function isOnLastScreen(w: Wizard): boolean {
  const visible = visibleScreenIndexes(w.screens, isScreenHidden);
  return w.current === null || w.current === visible[visible.length - 1];
}

function bindEnter(w: Wizard): void {
  w.form.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing || event.defaultPrevented) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || NO_ENTER_TYPES.has(target.type)) return;
    if (isOnLastScreen(w)) return; // the browser submits the form
    event.preventDefault();
    goNext(w);
  });
}

/** Native submit validation cannot show a control on a hidden screen: open that screen and report there. */
function bindInvalidJump(w: Wizard): void {
  let jumping = false;
  w.form.addEventListener(
    'invalid',
    (event) => {
      const control = event.target as HTMLInputElement;
      const index = screenIndexOf(w, control);
      if (index === null || index === w.current) return;
      event.preventDefault();
      if (jumping) return; // later invalid controls of the same submit attempt
      jumping = true;
      moveTo(w, index, 'replace');
      window.setTimeout(() => {
        jumping = false;
        control.reportValidity();
      }, 0);
    },
    true,
  );
}

/**
 * Send while a file is still going up: the upload guard (`dynamic-form-client.ts`, a capture-phase submit
 * listener registered earlier) cancels the submit and shows its wait message, which sits in the file
 * question's screen. Open that screen so the message is visible. Registered in the same phase and after the
 * guard, so it sees the guard's `preventDefault`.
 */
function bindUploadWait(w: Wizard): void {
  w.form.addEventListener(
    'submit',
    (event) => {
      if (!event.defaultPrevented) return;
      const uploading = w.form.querySelector('[data-upload-item][data-state="uploading"]');
      if (!uploading) return;
      const index = screenIndexOf(w, uploading);
      if (index !== null && index !== w.current) moveTo(w, index, 'replace');
      const wait = w.form.querySelector<HTMLElement>('[data-upload-wait]:not([hidden])');
      if (!wait) return;
      if (!wait.hasAttribute('tabindex')) wait.tabIndex = -1;
      wait.focus({ preventScroll: true });
      wait.scrollIntoView({ block: 'center' });
    },
    { capture: true },
  );
}

function bindSummaryLinks(w: Wizard): void {
  const summary = w.form.querySelector<HTMLElement>('[data-error-summary]');
  summary?.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
    const field = link ? document.getElementById(decodeURIComponent(link.hash.slice(1))) : null;
    if (!field || !w.form.contains(field)) return;
    event.preventDefault();
    const index = screenIndexOf(w, field);
    if (index !== null && index !== w.current) {
      w.current = index;
      render(w, true);
      writeHistory(w, 'replace');
    }
    field.focus({ preventScroll: true });
    field.scrollIntoView({ block: 'center' });
  });
}

function bindRecompute(w: Wizard): void {
  const recompute = () => render(w, false);
  // Added after `initDynamicForms` bound show-if on the same form, so these run after it.
  w.form.addEventListener('input', recompute);
  w.form.addEventListener('change', recompute);
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) recompute();
  });
}

// ---------------------------------------------------------------------------

function initWizard(form: HTMLFormElement): void {
  const screens = readScreens(form);
  const controls = form.querySelector<HTMLElement>('[data-wizard-controls]');
  const back = controls?.querySelector<HTMLButtonElement>('[data-wizard-back]');
  const next = controls?.querySelector<HTMLButtonElement>('[data-wizard-next]');
  if (screens.length === 0 || !controls || !back || !next) return; // stays the scrolling form

  const final = form.querySelector<HTMLElement>('[data-wizard-final]');
  const progress = controls.querySelector<HTMLOListElement>('[data-wizard-progress]');
  const submits = final
    ? Array.from(final.querySelectorAll<HTMLButtonElement>('button[type="submit"], button:not([type])'))
    : [];
  const w: Wizard = {
    form,
    screens,
    current: null,
    final,
    progress,
    status: controls.querySelector<HTMLElement>('[data-wizard-status]'),
    live: controls.querySelector<HTMLElement>('[data-wizard-live]'),
    back,
    next,
    submits,
    segmentClass: progress?.querySelector('li')?.className ?? '',
    history: !historyTaken,
  };
  historyTaken = true;

  // Back beside Send on the last screen: the submit button(s) join the action row once (still in the form).
  const actions = controls.querySelector<HTMLElement>('[data-wizard-actions]') ?? next.parentElement;
  actions?.append(...submits);
  // Several submit buttons (e.g. Reserve and Pay): the row wraps and each button gets its own line on phones.
  if (submits.length > 1 && actions) actions.dataset.wizardMulti = '';

  w.current = openingScreen(screens, {
    isHidden: isScreenHidden,
    invalidQuestionIds: invalidQuestionIds(form),
    invalidScreenIds: invalidScreenIds(form),
    hasSummary: form.querySelector('[data-error-summary]') !== null,
  });
  form.dataset.wizardActive = '';
  controls.hidden = false;
  render(w, false);
  writeHistory(w, 'replace');

  next.addEventListener('click', () => goNext(w));
  back.addEventListener('click', () => goBack(w));
  bindEnter(w);
  bindInvalidJump(w);
  bindUploadWait(w);
  bindSummaryLinks(w);
  bindRecompute(w);
  if (w.history) bindHistory(w);
}

/** Wires every wizard form below `root` (idempotent: forms already wired carry `data-wizard-ready`). */
export function initWizards(root: ParentNode = document): void {
  for (const form of root.querySelectorAll<HTMLFormElement>('form[data-wizard]')) {
    if (form.dataset.wizardReady === 'true') continue;
    form.dataset.wizardReady = 'true';
    initWizard(form);
  }
}
