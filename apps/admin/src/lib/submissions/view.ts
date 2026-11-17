/**
 * The submission detail screen as plain data: what the page renders, with the decisions made here so they
 * can be tested without a browser.
 *
 * - Labels come from the form VERSION the person answered (`detail.version.schema`), never from the draft.
 * - A question hidden by its (or its section's) show-if rule, evaluated on the stored answers, is omitted.
 * - Bound questions (`contact.*`, `request.*`, `roster.*`) go to the Contact and Request cards, not the sections.
 * - Nothing here builds HTML: every string is rendered by Astro, which escapes it. No `set:html` anywhere.
 * - A link answer is shown as a link only when it re-normalises to an https URL on an allow-listed host.
 */
import {
  embedUrl,
  normalizeLink,
  type FormSchema,
  type Question,
  type ShowIf,
  type SubmissionDetail,
  type SubmissionUpload,
} from '@gamo/domain/forms';
import { YOUTUBE_EMBED_ALLOWED } from './embeds.ts';
import { formatBytes } from './format.ts';

export interface LinkView {
  /** Canonical `https://` URL on an allow-listed host (YouTube, Vimeo, Google Drive, Dropbox). */
  href: string;
  providerLabel: string;
  /** `youtube-nocookie.com` embed URL; null unless the admin CSP allows it (see `embeds.ts`) and the link is YouTube. */
  embedSrc: string | null;
}

export type AnswerView =
  | { kind: 'text'; text: string; multiline: boolean }
  | { kind: 'list'; items: string[] }
  | { kind: 'grid'; rows: { row: string; value: string }[] }
  | { kind: 'link'; link: LinkView | null }
  | { kind: 'files'; count: number }
  | { kind: 'none' };

export interface AnswerItem {
  id: string;
  label: string;
  help: string | null;
  answer: AnswerView;
}

export interface SectionView {
  id: string;
  title: string;
  description: string | null;
  items: AnswerItem[];
}

export type AttachmentKind = 'image' | 'video' | 'file';

export interface AttachmentView {
  id: string;
  /** The question it answers. */
  questionLabel: string;
  /** Original name, sanitised on upload; rendered as escaped text. */
  name: string;
  sizeLabel: string;
  contentType: string;
  /** How the page shows it: an inline `<img>`, a `<video controls preload="none">`, or a download link only. */
  kind: AttachmentKind;
  /** Always `/files/<id>` (the staff-only handler); never a storage key. */
  href: string;
}

export interface DetailView {
  contact: AnswerItem[];
  /** `request.*` and `roster.*` bound answers. */
  request: AnswerItem[];
  requestTitle: string;
  sections: SectionView[];
  attachments: AttachmentView[];
}

const PROVIDER_LABEL: Record<string, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  drive: 'Google Drive',
  dropbox: 'Dropbox',
};

const INLINE_IMAGES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const INLINE_VIDEOS = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

export const fileHref = (uploadId: string): string => `/files/${encodeURIComponent(uploadId)}`;

// ---- show-if on stored answers ---------------------------------------------------------------------------

type Comparable = string | string[] | true;

function comparableOf(value: unknown): Comparable | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    return value.every((v) => typeof v === 'string') ? (value as string[]) : true;
  }
  if (value !== null && typeof value === 'object') return true;
  return undefined;
}

/** Ids of the questions that were shown to the person, evaluated like the server does on submit. */
export function shownQuestionIds(schema: FormSchema, answers: Record<string, unknown>): Set<string> {
  const shown = new Map<string, boolean>();
  const holds = (rule: ShowIf['rules'][number]): boolean => {
    if (shown.get(rule.questionId) !== true) return false;
    const value = comparableOf(
      Object.prototype.hasOwnProperty.call(answers, rule.questionId) ? answers[rule.questionId] : undefined,
    );
    if (rule.op === 'answered') return value !== undefined;
    const equal = (wanted: unknown): boolean =>
      typeof wanted === 'string' &&
      (typeof value === 'string'
        ? value === wanted
        : Array.isArray(value) && value.length === 1 && value[0] === wanted);
    if (rule.op === 'eq') return equal(rule.value);
    if (rule.op === 'neq') return !equal(rule.value);
    const list = Array.isArray(rule.value) ? rule.value : rule.value === undefined ? [] : [rule.value];
    if (typeof value === 'string') return list.includes(value);
    return Array.isArray(value) && value.some((v) => list.includes(v));
  };
  const groupHolds = (group: ShowIf | undefined): boolean =>
    !group ? true : group.join === 'any' ? group.rules.some(holds) : group.rules.every(holds);

  for (const section of schema.sections) {
    const sectionVisible = groupHolds(section.showIf);
    for (const q of section.questions) {
      if (q.type === 'statement') continue;
      const visible = sectionVisible && groupHolds(q.showIf);
      if (!shown.has(q.id)) shown.set(q.id, visible);
    }
  }
  return new Set([...shown].filter(([, v]) => v).map(([id]) => id));
}

// ---- one answer ------------------------------------------------------------------------------------------

export function linkViewOf(value: unknown): LinkView | null {
  if (value === null || typeof value !== 'object') return null;
  const canonical = (value as { canonical?: unknown }).canonical;
  if (typeof canonical !== 'string') return null;
  // Re-validate: stored JSON is trusted less than the allow-list.
  const link = normalizeLink(canonical);
  if (!link) return null;
  return {
    href: link.canonical,
    providerLabel: PROVIDER_LABEL[link.provider] ?? 'Link',
    embedSrc: YOUTUBE_EMBED_ALLOWED ? embedUrl(link) : null,
  };
}

const text = (value: string, multiline = false): AnswerView => ({ kind: 'text', text: value, multiline });

function answerViewOf(
  q: Exclude<Question, { type: 'statement' }>,
  value: unknown,
  uploads: SubmissionUpload[],
): AnswerView {
  if (q.type === 'file_upload') {
    return { kind: 'files', count: uploads.filter((u) => u.questionId === q.id).length };
  }
  if (value === undefined || value === null || value === '') return { kind: 'none' };
  switch (q.type) {
    case 'short_text':
    case 'multiple_choice':
    case 'dropdown':
    case 'date':
    case 'time':
      return typeof value === 'string' ? text(value) : { kind: 'none' };
    case 'paragraph':
      return typeof value === 'string' ? text(value, true) : { kind: 'none' };
    case 'checkboxes': {
      const items = Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
      return items.length > 0 ? { kind: 'list', items } : { kind: 'none' };
    }
    case 'linear_scale':
    case 'rating':
      return typeof value === 'number' ? text(`${value} of ${q.max}`) : { kind: 'none' };
    case 'choice_grid':
    case 'checkbox_grid': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return { kind: 'none' };
      const record = value as Record<string, unknown>;
      const rows: { row: string; value: string }[] = [];
      for (const row of q.rows) {
        if (!Object.prototype.hasOwnProperty.call(record, row)) continue;
        const picked = record[row];
        const cell = Array.isArray(picked) ? picked.filter((v) => typeof v === 'string').join(', ') : picked;
        if (typeof cell === 'string' && cell !== '') rows.push({ row, value: cell });
      }
      return rows.length > 0 ? { kind: 'grid', rows } : { kind: 'none' };
    }
    case 'link':
      return { kind: 'link', link: linkViewOf(value) };
  }
}

function attachmentKind(upload: SubmissionUpload): AttachmentKind {
  if (upload.kind === 'image' && INLINE_IMAGES.has(upload.contentType)) return 'image';
  if (upload.kind === 'video' && INLINE_VIDEOS.has(upload.contentType)) return 'video';
  return 'file';
}

// ---- the whole screen ------------------------------------------------------------------------------------

export function buildDetailView(detail: SubmissionDetail): DetailView {
  const { schema } = detail.version;
  const answers = detail.answers as Record<string, unknown>;
  const shown = shownQuestionIds(schema, answers);

  const contact: AnswerItem[] = [];
  const request: AnswerItem[] = [];
  let hasRoster = false;
  const sections: SectionView[] = [];
  const labelOf = new Map<string, string>();

  for (const section of schema.sections) {
    const items: AnswerItem[] = [];
    for (const q of section.questions) {
      if (q.type === 'statement') continue;
      labelOf.set(q.id, q.label);
      if (!shown.has(q.id)) continue;
      const item: AnswerItem = {
        id: q.id,
        label: q.label,
        help: q.help ?? null,
        answer: answerViewOf(
          q,
          Object.prototype.hasOwnProperty.call(answers, q.id) ? answers[q.id] : undefined,
          detail.uploads,
        ),
      };
      if (q.bind?.startsWith('contact.')) contact.push(item);
      else if (q.bind?.startsWith('request.') || q.bind?.startsWith('roster.')) {
        if (q.bind.startsWith('roster.')) hasRoster = true;
        request.push(item);
      } else items.push(item);
    }
    if (items.length > 0) {
      sections.push({
        id: section.id,
        title: section.title,
        description: section.description ?? null,
        items,
      });
    }
  }

  if (contact.length === 0) {
    const s = detail.submission;
    const fallback: [string, string | null][] = [
      ['Name', s.submitterName],
      ['Email', s.submitterEmail],
      ['Phone', s.submitterPhone],
    ];
    for (const [label, value] of fallback) {
      if (value)
        contact.push({ id: `submitter-${label.toLowerCase()}`, label, help: null, answer: text(value) });
    }
  }

  const attachments: AttachmentView[] = detail.uploads.map((u) => ({
    id: u.id,
    questionLabel: labelOf.get(u.questionId) ?? 'Attachment',
    name: u.originalName ?? 'file',
    sizeLabel: formatBytes(u.bytes),
    contentType: u.contentType,
    kind: attachmentKind(u),
    href: fileHref(u.id),
  }));

  return { contact, request, requestTitle: hasRoster ? 'Application' : 'Request', sections, attachments };
}
