/**
 * Progressive enhancement for the shared public-form components (`components/forms/*`). Everything works
 * without it (plain HTML forms, server-rendered errors); with it:
 *
 * - `[data-email-typo]` inputs show "Did you mean …?" as a button that fills the field (never auto-corrects);
 * - `[data-confirm-email-of="<id>"]` inputs compare with that field case-insensitively and show an inline
 *   error (and block submission with a custom validity message);
 * - `[data-submit-button]` disables itself after a submit and shows its pending label, and is restored when
 *   the page is shown again from the back/forward cache;
 * - `[data-error-summary]` takes focus on load so keyboard and screen-reader users land on it.
 *
 * Loaded by the components with a bundled `<script>` (an external file under the CSP); safe to call twice.
 */
import { emailsMatch, emailTypoSuggestion } from './email-typo.ts';

const MISMATCH_MESSAGE = "The email addresses don't match.";

function errorElement(input: HTMLInputElement): HTMLElement | null {
  return document.getElementById(`${input.id}-error`);
}

function setFieldError(input: HTMLInputElement, message: string | null): void {
  const el = errorElement(input);
  const serverError = input.dataset.serverError === 'true';
  if (message) {
    input.setAttribute('aria-invalid', 'true');
    if (el) {
      const text = el.querySelector<HTMLElement>('[data-error-text]') ?? el;
      text.textContent = message;
      el.hidden = false;
    }
  } else if (!serverError) {
    input.removeAttribute('aria-invalid');
    if (el) el.hidden = true;
  }
}

function bindTypo(input: HTMLInputElement): void {
  const box = document.querySelector<HTMLElement>(`[data-email-suggestion-for="${input.id}"]`);
  const button = box?.querySelector<HTMLButtonElement>('button');
  const value = box?.querySelector<HTMLElement>('[data-suggestion-value]');
  if (!box || !button || !value) return;
  const update = () => {
    const suggestion = emailTypoSuggestion(input.value);
    if (suggestion) {
      value.textContent = suggestion;
      button.dataset.fill = suggestion;
      box.hidden = false;
    } else {
      box.hidden = true;
    }
  };
  input.addEventListener('blur', update);
  input.addEventListener('change', update);
  input.addEventListener('input', () => {
    if (!box.hidden && !emailTypoSuggestion(input.value)) box.hidden = true;
  });
  button.addEventListener('click', () => {
    const fill = button.dataset.fill;
    if (!fill) return;
    input.value = fill;
    box.hidden = true;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
  });
}

function bindConfirm(confirm: HTMLInputElement): void {
  const original = document.getElementById(confirm.dataset.confirmEmailOf ?? '') as HTMLInputElement | null;
  if (!original) return;
  let touched = confirm.value !== '';
  const check = (show: boolean) => {
    const mismatch = confirm.value !== '' && !emailsMatch(confirm.value, original.value);
    confirm.setCustomValidity(mismatch ? MISMATCH_MESSAGE : '');
    if (show) setFieldError(confirm, mismatch ? MISMATCH_MESSAGE : null);
  };
  confirm.addEventListener('blur', () => {
    touched = true;
    check(true);
  });
  confirm.addEventListener('input', () => check(touched));
  original.addEventListener('input', () => check(touched));
  original.addEventListener('change', () => check(touched));
  confirm.form?.addEventListener('submit', () => check(true), { capture: true });
  check(false);
}

function bindSubmit(button: HTMLButtonElement): void {
  const form = button.form;
  if (!form) return;
  const label = button.querySelector<HTMLElement>('[data-label]');
  const original = label?.textContent ?? '';
  const restore = () => {
    button.disabled = false;
    button.removeAttribute('aria-disabled');
    delete button.dataset.pending;
    if (label) label.textContent = original;
  };
  form.addEventListener('submit', (event) => {
    if (button.dataset.pending === 'true') {
      event.preventDefault(); // a second click while the first submission is in flight
      return;
    }
    if (event.defaultPrevented) return;
    button.dataset.pending = 'true';
    button.setAttribute('aria-disabled', 'true');
    if (label) label.textContent = button.dataset.pendingLabel ?? 'Sending…';
    // Disable after the submission has started, so the button's own name/value is still sent.
    window.setTimeout(() => {
      if (button.dataset.pending === 'true') button.disabled = true;
    }, 0);
  });
  window.addEventListener('pageshow', restore);
  form.addEventListener('gamo:form-error', restore);
}

let started = false;

export function initForms(root: ParentNode = document): void {
  if (started && root === document) return;
  if (root === document) started = true;
  root.querySelectorAll<HTMLInputElement>('input[data-email-typo]').forEach(bindTypo);
  root.querySelectorAll<HTMLInputElement>('input[data-confirm-email-of]').forEach(bindConfirm);
  root.querySelectorAll<HTMLButtonElement>('button[data-submit-button]').forEach(bindSubmit);
  const summary = root.querySelector<HTMLElement>('[data-error-summary]');
  if (summary) summary.focus();
}
