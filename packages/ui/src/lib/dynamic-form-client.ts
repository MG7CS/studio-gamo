/**
 * Progressive enhancement for `DynamicForm` (`components/forms/dynamic/*`). The form is complete and works
 * without any of this (every question is rendered, the server drops answers hidden by show-if, files are
 * native inputs). With it:
 *
 * - Show-if, live: each question and section carries its rule group as `data-show-join` / `data-show-rules`;
 *   the page re-evaluates them on every input (same semantics as the server, `computeVisibility`), sets
 *   `hidden` on what the server will ignore and `disabled` on its controls (so nothing hidden is validated
 *   or posted). Answers typed into a question that becomes hidden are kept and come back when it reappears.
 * - Character counters: `input[data-dyn-counter="<id>"]` shows "n / max" in that (otherwise hidden) element.
 *   Textareas keep using `lib/forms-client.ts`.
 * - File questions (`[data-dyn-upload]`): each chosen file goes through the chunked uploader
 *   (`lib/chunked-upload.ts`) with progress, cancel and remove; a finished upload becomes a hidden
 *   `<name>.upload` input holding its `uploadId`; a failed one explains itself and, for video, offers to jump
 *   to the link question. The native input's `name` is removed so no file bytes are posted by the form.
 *   Sending the form while an upload is running is blocked with a message.
 *
 * Bundled by Astro into an external script (CSP: no inline script). Safe to call twice.
 */
import {
  computeVisibility,
  conditionValueFromRaw,
  showIfFromAttributes,
  uploadFieldName,
  type DynQuestionType,
  type RawReader,
  type VisibilityQuestion,
  type VisibilitySection,
} from './dynamic-form.ts';
import { ChunkedUploader, UploadFailure, describeFailure } from './chunked-upload.ts';

// ---------------------------------------------------------------------------
// Show-if
// ---------------------------------------------------------------------------

interface DomQuestion extends VisibilityQuestion {
  el: HTMLElement;
  rowCount: number;
}
interface DomSection extends VisibilitySection {
  el: HTMLElement;
  questions: DomQuestion[];
}

function readStructure(form: HTMLFormElement): DomSection[] {
  const sections: DomSection[] = [];
  for (const sectionEl of form.querySelectorAll<HTMLElement>('[data-dyn-section]')) {
    const questions: DomQuestion[] = [];
    for (const el of sectionEl.querySelectorAll<HTMLElement>('[data-dyn-question]')) {
      questions.push({
        el,
        id: el.dataset.dynQuestion ?? '',
        type: (el.dataset.dynType ?? 'short_text') as DynQuestionType,
        rowCount: Number(el.dataset.dynRows ?? 0) || 0,
        showIf: showIfFromAttributes(el.dataset.showJoin, el.dataset.showRules),
      });
    }
    sections.push({
      el: sectionEl,
      id: sectionEl.dataset.dynSection ?? '',
      showIf: showIfFromAttributes(sectionEl.dataset.showJoin, sectionEl.dataset.showRules),
      questions,
    });
  }
  return sections;
}

/** Every posted value by field name (checked boxes only; controls this script disabled still count). */
function collectValues(form: HTMLFormElement): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const control of form.elements) {
    if (
      !(control instanceof HTMLInputElement) &&
      !(control instanceof HTMLSelectElement) &&
      !(control instanceof HTMLTextAreaElement)
    ) {
      continue;
    }
    if (!control.name || (control.disabled && !control.dataset.dynOff)) continue;
    if (control instanceof HTMLInputElement) {
      if (['file', 'button', 'submit', 'reset', 'image'].includes(control.type)) continue;
      if ((control.type === 'checkbox' || control.type === 'radio') && !control.checked) continue;
    }
    const list = map.get(control.name);
    if (list) list.push(control.value);
    else map.set(control.name, [control.value]);
  }
  return map;
}

function setControlsEnabled(root: HTMLElement, enabled: boolean): void {
  for (const control of root.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement
  >('input, select, textarea, button')) {
    if (enabled) {
      if (control.dataset.dynOff) {
        control.disabled = false;
        delete control.dataset.dynOff;
      }
    } else if (!control.disabled) {
      control.disabled = true;
      control.dataset.dynOff = '1';
    }
  }
}

function bindShowIf(form: HTMLFormElement): () => void {
  const sections = readStructure(form);
  const conditional = sections.some((s) => s.showIf || s.questions.some((q) => q.showIf));
  if (!conditional) return () => undefined;
  const byId = new Map<string, DomQuestion>();
  for (const section of sections) for (const q of section.questions) if (!byId.has(q.id)) byId.set(q.id, q);

  const apply = () => {
    const values = collectValues(form);
    const reader: RawReader = {
      values: (name) => values.get(name) ?? [],
      uploadCount: (id) => (values.get(uploadFieldName(id)) ?? []).length,
    };
    const visibility = computeVisibility(sections, (question) => {
      const dom = byId.get(question.id);
      return dom
        ? conditionValueFromRaw({ id: dom.id, type: dom.type, rowCount: dom.rowCount }, reader)
        : null;
    });
    for (const section of sections) {
      const sectionVisible = visibility.sections.get(section.id) !== false;
      section.el.hidden = !sectionVisible;
      for (const q of section.questions) {
        const visible = visibility.display.get(q.id) !== false;
        q.el.hidden = !visible;
        setControlsEnabled(q.el, visible);
      }
    }
  };

  form.addEventListener('input', apply);
  form.addEventListener('change', apply);
  window.addEventListener('pageshow', apply);
  apply();
  return apply;
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

function bindCounter(input: HTMLInputElement): void {
  const out = document.getElementById(input.dataset.dynCounter ?? '');
  const max = input.maxLength;
  if (!out || max <= 0) return;
  const update = () => {
    out.textContent = `${input.value.length} / ${max}`;
  };
  input.addEventListener('input', update);
  update();
  out.hidden = false;
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

function matchesAccept(file: File, accept: string): boolean {
  const tokens = accept
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith('.')) return name.endsWith(token);
    if (token.endsWith('/*')) return type.startsWith(token.slice(0, -1));
    return type === token;
  });
}

function resetTurnstile(): void {
  // A Turnstile token is single use and the upload session consumed it; ask the widget for a fresh one.
  try {
    (window as unknown as { turnstile?: { reset?: () => void } }).turnstile?.reset?.();
  } catch {
    // The widget is Cloudflare's; a failed reset only means the person retries the security check.
  }
}

/** The server attaches finished files with the session token they were uploaded under: post it with the form. */
function addUploadToken(form: HTMLFormElement, token: string): void {
  const known = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="upload_session_token"]'));
  if (known.some((input) => input.value === token)) return;
  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.name = 'upload_session_token';
  hidden.value = token;
  form.append(hidden);
}

function bindUploads(form: HTMLFormElement): void {
  const containers = form.querySelectorAll<HTMLElement>('[data-dyn-upload]');
  if (containers.length === 0) return;
  let uploader: ChunkedUploader | null = null;
  const getUploader = () =>
    (uploader ??= new ChunkedUploader({
      formSlug: form.dataset.formSlug ?? '',
      getTurnstileToken: () =>
        form.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')?.value ?? '',
      onSessionCreated: (token) => {
        resetTurnstile();
        addUploadToken(form, token);
      },
    }));

  const waits = new Set<() => void>();

  for (const container of containers) {
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    const list = container.querySelector<HTMLElement>('[data-upload-list]');
    const template = container.querySelector<HTMLTemplateElement>('template[data-upload-template]');
    const status = container.querySelector<HTMLElement>('[data-upload-status]');
    const wait = container.querySelector<HTMLElement>('[data-upload-wait]');
    const linkNote = container.querySelector<HTMLElement>('[data-upload-link-note]');
    if (!input || !list || !template) continue;

    const questionId = container.dataset.questionId ?? '';
    const hiddenName = container.dataset.uploadName ?? uploadFieldName(questionId);
    const maxFiles = Number(container.dataset.maxFiles ?? 1) || 1;
    const maxBytes = Number(container.dataset.maxBytes ?? 0) || undefined;
    const typesLabel = container.dataset.typesLabel ?? 'the listed types';
    const fallbackId = container.dataset.linkFallback;
    const accept = input.accept;

    // The browser must not post file bytes any more; finished uploads are posted as ids.
    input.removeAttribute('name');
    input.required = false;

    const say = (text: string) => {
      if (status) status.textContent = text;
    };
    const items = () => Array.from(list.querySelectorAll<HTMLElement>('[data-upload-item]'));
    const liveCount = () => items().filter((li) => li.dataset.state !== 'error').length;
    const syncWait = () => {
      const uploading = items().some((li) => li.dataset.state === 'uploading');
      // The message appears only when a send was blocked; it goes away once nothing is uploading.
      if (wait && !uploading) wait.hidden = true;
      list.hidden = items().length === 0;
    };
    waits.add(() => {
      if (wait && items().some((li) => li.dataset.state === 'uploading')) wait.hidden = false;
    });

    const bindRemove = (li: HTMLElement, onRemove: () => void) => {
      li.querySelector<HTMLButtonElement>('[data-upload-remove]')?.addEventListener('click', () => {
        onRemove();
        li.remove();
        syncWait();
        container.dispatchEvent(new Event('change', { bubbles: true }));
        input.focus();
      });
    };

    // Uploads rendered by the server after a failed submit: Remove drops the hidden input.
    for (const li of items()) {
      const button = li.querySelector<HTMLButtonElement>('[data-upload-remove]');
      if (button) button.hidden = false;
      const uploadId = li.dataset.uploadId;
      bindRemove(li, () => {
        if (uploadId) void uploader?.remove(uploadId);
        say('File removed.');
      });
    }

    const fail = (li: HTMLElement, failure: UploadFailure, name: string) => {
      const message = describeFailure(failure, Boolean(fallbackId));
      li.dataset.state = 'error';
      li.querySelector<HTMLProgressElement>('[data-upload-progress]')?.remove();
      const state = li.querySelector<HTMLElement>('[data-upload-state]');
      if (state) {
        state.textContent = message;
        state.dataset.state = 'error';
      }
      const label = li.querySelector<HTMLElement>('[data-upload-remove-label]');
      if (label) label.textContent = 'Dismiss';
      if (failure.linkInstead && linkNote) linkNote.hidden = false;
      say(`${name}: ${message}`);
    };

    const startUpload = (file: File) => {
      const fragment = template.content.cloneNode(true) as DocumentFragment;
      const li = fragment.querySelector<HTMLElement>('[data-upload-item]');
      if (!li) return;
      const nameText = li.querySelector<HTMLElement>('[data-upload-name-text]');
      const state = li.querySelector<HTMLElement>('[data-upload-state]');
      const progress = li.querySelector<HTMLProgressElement>('[data-upload-progress]');
      const removeName = li.querySelector<HTMLElement>('[data-upload-remove-name]');
      if (nameText) nameText.textContent = file.name;
      if (removeName) removeName.textContent = ` ${file.name}`;
      progress?.setAttribute('aria-label', `Uploading ${file.name}`);
      if (state) state.textContent = 'Starting…';
      list.append(li);
      syncWait();

      // Cheap checks first: a wrong file never reaches the network.
      if (!matchesAccept(file, accept)) {
        fail(
          li,
          new UploadFailure('type', { message: `This file type isn't accepted. Choose ${typesLabel}.` }),
          file.name,
        );
        bindRemove(li, () => undefined);
        return;
      }
      if (liveCount() > maxFiles) {
        fail(
          li,
          new UploadFailure('limit', {
            message: `You can attach up to ${maxFiles} ${maxFiles === 1 ? 'file' : 'files'}.`,
          }),
          file.name,
        );
        bindRemove(li, () => undefined);
        return;
      }

      const controller = new AbortController();
      let uploadedId: string | null = null;
      bindRemove(li, () => {
        if (li.dataset.state === 'uploading') controller.abort();
        else if (uploadedId) void getUploader().remove(uploadedId);
        say(`${file.name} removed.`);
      });
      say(`Uploading ${file.name}.`);
      getUploader()
        .upload(file, {
          questionId,
          signal: controller.signal,
          maxBytes,
          onProgress: (p) => {
            const percent = Math.round((p.loaded / p.total) * 100);
            if (progress) progress.value = percent;
            if (state) state.textContent = `Uploading… ${percent}%`;
          },
        })
        .then((done) => {
          if (!li.isConnected) {
            void getUploader().remove(done.uploadId);
            return;
          }
          uploadedId = done.uploadId;
          li.dataset.state = 'done';
          li.dataset.uploadId = done.uploadId;
          progress?.remove();
          if (state) state.textContent = 'Uploaded';
          const label = li.querySelector<HTMLElement>('[data-upload-remove-label]');
          if (label) label.textContent = 'Remove';
          const hidden = document.createElement('input');
          hidden.type = 'hidden';
          hidden.name = hiddenName;
          hidden.value = done.uploadId;
          li.append(hidden);
          if (linkNote && liveCount() > 0) linkNote.hidden = true;
          say(`${file.name} uploaded.`);
          syncWait();
          container.dispatchEvent(new Event('change', { bubbles: true }));
        })
        .catch((error: unknown) => {
          if (!li.isConnected) return;
          const failure = error instanceof UploadFailure ? error : new UploadFailure('failed');
          if (failure.code === 'aborted') return;
          fail(li, failure, file.name);
          syncWait();
        });
    };

    input.addEventListener('change', () => {
      const files = Array.from(input.files ?? []);
      input.value = '';
      for (const file of files) startUpload(file);
    });
    linkNote?.querySelector<HTMLButtonElement>('[data-upload-use-link]')?.addEventListener('click', () => {
      if (fallbackId) document.getElementById(fallbackId)?.focus();
    });
    syncWait();
  }

  // Sending while a file is still going up would lose it.
  form.addEventListener(
    'submit',
    (event) => {
      if (!form.querySelector('[data-upload-item][data-state="uploading"]')) return;
      event.preventDefault();
      for (const show of waits) show();
      form
        .querySelector<HTMLElement>('[data-upload-wait]:not([hidden])')
        ?.scrollIntoView({ block: 'center' });
    },
    { capture: true },
  );
}

// ---------------------------------------------------------------------------

export function initDynamicForms(root: ParentNode = document): void {
  for (const form of root.querySelectorAll<HTMLFormElement>('form[data-dynamic-form]')) {
    if (form.dataset.dynReady === 'true') continue;
    form.dataset.dynReady = 'true';
    // Rendered with novalidate so a browser without JavaScript (which shows every conditional question) is not
    // blocked by `required` on questions that do not apply; the server checks everything either way.
    form.noValidate = false;
    form.querySelectorAll<HTMLInputElement>('input[data-dyn-counter]').forEach(bindCounter);
    bindUploads(form);
    bindShowIf(form);
  }
}
