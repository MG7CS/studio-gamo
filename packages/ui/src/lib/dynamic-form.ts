/**
 * Pure helpers for the shared dynamic form renderer (`components/forms/dynamic/*`) and its browser
 * enhancement (`dynamic-form-client.ts`). No DOM, no Astro, no import from `@gamo/domain`: `packages/ui`
 * never depends on the domain layer, so the minimal structural types the renderer needs are declared
 * here (`DynFormSchema` and friends). The domain `FormSchema` is assignable to `DynFormSchema`;
 * `scripts/audit/dynamic-form.test.ts` fails to compile (tsc) if it ever stops being.
 *
 * What lives here
 * - Field naming that mirrors `packages/domain/src/forms/validate.ts` exactly: `OTHER_VALUE`,
 *   `otherFieldName`, `gridFieldName`; plus `uploadFieldName` (the one convention the renderer adds).
 * - `buildFieldId`: DOM ids that can never collide with the primitives' derived ids (`-hint`, `-error`, …).
 * - `evaluateShowIf` / `computeVisibility` / `conditionValueFromRaw`: the show-if semantics of the server's
 *   `validateAnswers`, so the page hides exactly what the server will ignore (parity is proven against
 *   the real server function in `scripts/audit/dynamic-form.test.ts`).
 * - `encodeShowIfRules` / `decodeShowIfRules`: the JSON-free attribute encoding of a show-if group.
 * - Hint, accept-list and text-input helpers shared by the field components.
 *
 * The frontend is never the authority: the server re-runs everything.
 */

// ---------------------------------------------------------------------------
// Structural schema types (a minimal supertype of the domain FormSchema)
// ---------------------------------------------------------------------------

export type DynFileGroup = 'image' | 'video' | 'pdf' | 'document' | 'audio';
export type DynLinkProvider = 'youtube' | 'vimeo' | 'drive' | 'dropbox';
export type DynShowIfOp = 'eq' | 'neq' | 'in' | 'answered';

export interface DynShowIfRule {
  questionId: string;
  op: DynShowIfOp;
  value?: string | string[] | undefined;
}
export interface DynShowIf {
  join: 'all' | 'any';
  rules: DynShowIfRule[];
}

/** Validation preset of a short text question (only what the renderer reads). */
export interface DynTextRule {
  kind:
    | 'number'
    | 'text_contains'
    | 'text_not_contains'
    | 'email'
    | 'phone'
    | 'postal_code'
    | 'url'
    | 'length'
    | 'regex';
  message?: string | undefined;
  min?: number | undefined;
  max?: number | undefined;
  integer?: boolean | undefined;
  value?: string | undefined;
}

interface DynBase {
  id: string;
  label: string;
  help?: string | undefined;
  required: boolean;
  showIf?: DynShowIf | undefined;
  bind?: string | undefined;
}

export type DynQuestion =
  | (DynBase & { type: 'short_text'; maxLength?: number | undefined; validation?: DynTextRule | undefined })
  | (DynBase & { type: 'paragraph'; maxLength?: number | undefined; validation?: DynTextRule | undefined })
  | (DynBase & {
      type: 'multiple_choice';
      options: string[];
      other: boolean;
      otherLabel?: string | undefined;
    })
  | (DynBase & {
      type: 'checkboxes';
      options: string[];
      other: boolean;
      otherLabel?: string | undefined;
      limit?: { kind: 'at_least' | 'at_most' | 'exactly'; n: number } | undefined;
    })
  | (DynBase & { type: 'dropdown'; options: string[] })
  | (DynBase & { type: 'file_upload'; accept: DynFileGroup[]; maxFiles: number; maxMb: number })
  | (DynBase & {
      type: 'linear_scale';
      min: 0 | 1;
      max: number;
      minLabel?: string | undefined;
      maxLabel?: string | undefined;
    })
  | (DynBase & { type: 'rating'; max: number })
  | (DynBase & {
      type: 'choice_grid';
      rows: string[];
      columns: string[];
      requireEachRow: boolean;
      onePerColumn: boolean;
    })
  | (DynBase & {
      type: 'checkbox_grid';
      rows: string[];
      columns: string[];
      requireEachRow: boolean;
      onePerColumn: boolean;
    })
  | (DynBase & { type: 'date'; includeYear: boolean; includeTime: boolean })
  | (DynBase & { type: 'time'; mode: 'clock' | 'duration' })
  | (DynBase & { type: 'link'; providers?: DynLinkProvider[] | undefined })
  | (DynBase & { type: 'statement'; body?: string | undefined });

export type DynQuestionType = DynQuestion['type'];
export type DynQuestionOf<T extends DynQuestionType> = Extract<DynQuestion, { type: T }>;

export interface DynSection {
  id: string;
  title: string;
  description?: string | undefined;
  showIf?: DynShowIf | undefined;
  questions: DynQuestion[];
}
export interface DynFormSchema {
  sections: DynSection[];
}

/** Raw posted values the renderer re-renders: `questionId`, `${id}.other`, `${id}.${rowIndex}`. */
export type DynRawValues = Record<string, string | string[] | undefined>;
/** One server validation error (`AnswerError` in the domain). */
export interface DynAnswerError {
  questionId: string;
  message: string;
}
/** A finished upload to re-render after a failed submit. Only `uploadId` is posted back. */
export interface DynUploadSummary {
  uploadId: string;
  filename?: string | undefined;
  kind?: string | undefined;
  bytes?: number | undefined;
}

// ---------------------------------------------------------------------------
// Field naming (mirrors packages/domain/src/forms/validate.ts)
// ---------------------------------------------------------------------------

/** Value posted for the "Other" choice; the typed text is posted as `otherFieldName(id)`. */
export const OTHER_VALUE = '__other__';
export const otherFieldName = (questionId: string): string => `${questionId}.other`;
export const gridFieldName = (questionId: string, rowIndex: number): string => `${questionId}.${rowIndex}`;
/** Hidden inputs, one per finished upload, each holding only the `uploadId` (the server looks the rest up). */
export const uploadFieldName = (questionId: string): string => `${questionId}.upload`;
/** The native file input of a file question (posted only when the browser has no JavaScript). */
export const fileInputName = (questionId: string): string => `${questionId}.file`;

/**
 * Base DOM id of a question: `${prefix}_${questionId}_`. Every id a primitive derives from it ends in a
 * character other than `_` (`-hint`, `-error`, `-legend`, `-0`, `-other-text`), and every base ends in
 * `_`, so two questions (say `x` and `x-hint`) can never produce the same id.
 */
export const buildFieldId = (prefix: string, questionId: string): string => `${prefix}_${questionId}_`;
export const sectionDomId = (prefix: string, sectionId: string): string => `${prefix}-section-${sectionId}`;

/** Cloudflare Turnstile `action`: letters, digits, `_` and `-`, at most 32 characters. */
export function turnstileActionFor(formSlug: string): string {
  const cleaned = `form_${formSlug}`.replace(/[^A-Za-z0-9_-]/g, '_');
  return cleaned.slice(0, 32);
}

/** First value of a raw field as text (undefined when absent). */
export function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
/** All values of a raw field as a list. */
export function asValues(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

// ---------------------------------------------------------------------------
// Show-if semantics (mirrors validateAnswers)
// ---------------------------------------------------------------------------

/**
 * What a show-if rule compares: text, a list of picked options, or `true` for an answer that is not
 * text (grid, upload, link). Same shape as the server's `conditionValue`.
 */
export type ConditionValue = string | string[] | true;
/**
 * Looks up the answer a rule points at. `undefined`: the source is unknown, later in the form, a
 * statement or hidden, so the rule fails closed (even `neq`). `null`: the source is shown but unanswered.
 */
export type AnswerLookup = (questionId: string) => ConditionValue | null | undefined;

function ruleHolds(rule: DynShowIfRule, getAnswer: AnswerLookup): boolean {
  const value = getAnswer(rule.questionId);
  if (value === undefined) return false;
  if (rule.op === 'answered') return value !== null;
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
}

/** Does this show-if group hold? A missing group always holds. */
export function evaluateShowIf(showIf: DynShowIf | undefined, getAnswer: AnswerLookup): boolean {
  if (!showIf) return true;
  return showIf.join === 'any'
    ? showIf.rules.some((rule) => ruleHolds(rule, getAnswer))
    : showIf.rules.every((rule) => ruleHolds(rule, getAnswer));
}

/** What the visibility walk needs of a question (a `DynQuestion` satisfies it). */
export interface VisibilityQuestion {
  id: string;
  type: DynQuestionType;
  showIf?: DynShowIf | undefined;
}
export interface VisibilitySection {
  id: string;
  showIf?: DynShowIf | undefined;
  questions: VisibilityQuestion[];
}
export interface Visibility {
  /** Section id to visible. */
  sections: Map<string, boolean>;
  /** Question id (statements included) to visible: what the page shows. */
  display: Map<string, boolean>;
  /** Question id (statements excluded) to visible: the server's `shown` map. */
  shown: Map<string, boolean>;
}

/**
 * The server's walk, step for step: sections and questions in document order; a section's show-if is
 * evaluated before its questions; a question inherits its section; a source counts only when it was shown
 * earlier; hidden questions are skipped; statements are never sources. `readAnswer` supplies the comparable
 * value of a shown question (`null` when unanswered).
 */
export function computeVisibility(
  sections: VisibilitySection[],
  readAnswer: (question: VisibilityQuestion) => ConditionValue | null,
): Visibility {
  const result: Visibility = { sections: new Map(), display: new Map(), shown: new Map() };
  const values = new Map<string, ConditionValue>();
  const lookup: AnswerLookup = (id) => (result.shown.get(id) === true ? (values.get(id) ?? null) : undefined);
  for (const section of sections) {
    const sectionVisible = evaluateShowIf(section.showIf, lookup);
    if (!result.sections.has(section.id)) result.sections.set(section.id, sectionVisible);
    for (const q of section.questions) {
      const visible = sectionVisible && evaluateShowIf(q.showIf, lookup);
      if (!result.display.has(q.id)) result.display.set(q.id, visible);
      if (q.type === 'statement') continue;
      if (!result.shown.has(q.id)) result.shown.set(q.id, visible);
      if (!visible) continue;
      const value = readAnswer(q);
      if (value !== null) values.set(q.id, value);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Reading a posted/typed answer as a condition value
// ---------------------------------------------------------------------------

/** How the current answers are read: the values posted under a field name, and finished uploads. */
export interface RawReader {
  /** Every value for a field name, in order (checked boxes only; disabled controls are not posted). */
  values(name: string): string[];
  /** Finished uploads attached to a file question. */
  uploadCount(questionId: string): number;
}

/** A reader over a plain record (the shape the server receives). */
export function recordReader(
  raw: Record<string, string | string[] | undefined>,
  uploadCounts: Record<string, number> = {},
): RawReader {
  return {
    values: (name) => (Object.prototype.hasOwnProperty.call(raw, name) ? asValues(raw[name]) : []),
    uploadCount: (id) => uploadCounts[id] ?? 0,
  };
}

/** What `conditionValueFromRaw` needs of a question. */
export interface ConditionSource {
  id: string;
  type: DynQuestionType;
  /** Rows of a grid question. */
  rowCount?: number | undefined;
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const MAX_OTHER_TEXT = 300;

/** Trimmed text without control characters; null when blank (the server's `readText`). */
function cleanText(value: string | undefined): string | null {
  if (value === undefined) return null;
  const text = value.replace(CONTROL, '').trim();
  return text === '' ? null : text;
}

/**
 * The comparable value of one question's current answer, as the server's `validateAnswers` stores it for
 * show-if rules (`null` when unanswered). Exact for valid answers. For answers the server will reject it
 * follows the server's fallback where the browser can know it (text kept as typed); rules that depend on a
 * rejected answer are moot because the form comes back with an error.
 */
export function conditionValueFromRaw(source: ConditionSource, reader: RawReader): ConditionValue | null {
  const text = (name: string): string | null => cleanText(reader.values(name)[0]);
  switch (source.type) {
    case 'statement':
      return null;
    case 'short_text': {
      const value = text(source.id);
      return value === null ? null : value.replace(/\s*[\r\n]+\s*/g, ' ');
    }
    case 'paragraph':
    case 'dropdown':
    case 'linear_scale':
    case 'rating':
    case 'time':
      return text(source.id);
    case 'date': {
      const value = text(source.id);
      // `YYYY-MM-DD HH:MM` is stored as `YYYY-MM-DDTHH:MM`.
      return value === null ? null : value.replace(/^(\d{2,4}-\d{2}(?:-\d{2})?) (\d{2}:\d{2})$/, '$1T$2');
    }
    case 'multiple_choice': {
      const value = text(source.id);
      if (value !== OTHER_VALUE) return value;
      const other = text(otherFieldName(source.id));
      return other !== null && other.length <= MAX_OTHER_TEXT ? other : value;
    }
    case 'checkboxes': {
      const raws: string[] = [];
      for (const item of reader.values(source.id)) {
        const clean = cleanText(item);
        if (clean !== null && !raws.includes(clean)) raws.push(clean);
      }
      if (raws.length === 0) return null;
      const picked: string[] = [];
      for (const item of raws) {
        if (item === OTHER_VALUE) {
          const other = text(otherFieldName(source.id));
          // The server rejects a blank "Other"; with a single raw value its fallback is that text.
          if (other === null || other.length > MAX_OTHER_TEXT) return raws.length === 1 ? item : null;
          if (!picked.includes(other)) picked.push(other);
        } else if (!picked.includes(item)) picked.push(item);
      }
      return picked;
    }
    case 'choice_grid':
    case 'checkbox_grid': {
      for (let i = 0; i < (source.rowCount ?? 0); i++) {
        if (reader.values(gridFieldName(source.id, i)).some((v) => cleanText(v) !== null)) return true;
      }
      return null;
    }
    case 'file_upload':
      return reader.uploadCount(source.id) > 0 ? true : null;
    case 'link':
      // A valid link is stored as an object (never equal to text); an invalid one is rejected anyway.
      return text(source.id) === null ? null : true;
  }
}

/** `conditionValueFromRaw` for a schema question. */
export function conditionSourceOf(q: DynQuestion): ConditionSource {
  return {
    id: q.id,
    type: q.type,
    rowCount: q.type === 'choice_grid' || q.type === 'checkbox_grid' ? q.rows.length : undefined,
  };
}

/** Which questions and sections of a schema are visible for a set of raw answers (the server's view). */
export function visibilityForRaw(
  schema: DynFormSchema,
  raw: Record<string, string | string[] | undefined>,
  uploadCounts: Record<string, number> = {},
): Visibility {
  const reader = recordReader(raw, uploadCounts);
  const byId = new Map<string, DynQuestion>();
  for (const section of schema.sections) for (const q of section.questions) byId.set(q.id, q);
  return computeVisibility(schema.sections, (q) => {
    const full = byId.get(q.id);
    return full ? conditionValueFromRaw(conditionSourceOf(full), reader) : null;
  });
}

// ---------------------------------------------------------------------------
// Show-if attribute encoding (no JSON in the markup)
// ---------------------------------------------------------------------------

/**
 * Rules as one attribute value: rules joined by `;`, parts joined by `,` (`questionId,op,value…`), every
 * part percent-encoded (so a value can contain `,` or `;`). `answered` has no value; `eq`/`neq` have one;
 * `in` has one or more.
 */
export function encodeShowIfRules(rules: DynShowIfRule[]): string {
  return rules
    .map((rule) => {
      const values =
        rule.op === 'answered' || rule.value === undefined
          ? []
          : Array.isArray(rule.value)
            ? rule.value
            : [rule.value];
      return [rule.questionId, rule.op, ...values].map(encodeURIComponent).join(',');
    })
    .join(';');
}

const OPS: ReadonlySet<string> = new Set<DynShowIfOp>(['eq', 'neq', 'in', 'answered']);

/** Inverse of `encodeShowIfRules`; unreadable input yields `null` (the question then stays visible). */
export function decodeShowIfRules(encoded: string | null | undefined): DynShowIfRule[] | null {
  if (!encoded) return null;
  const rules: DynShowIfRule[] = [];
  try {
    for (const chunk of encoded.split(';')) {
      const [questionId, op, ...values] = chunk.split(',').map(decodeURIComponent);
      if (!questionId || !op || !OPS.has(op)) return null;
      const rule: DynShowIfRule = { questionId, op: op as DynShowIfOp };
      if (op === 'eq' || op === 'neq') {
        if (values.length !== 1 || values[0] === undefined) return null;
        rule.value = values[0];
      } else if (op === 'in') {
        if (values.length === 0) return null;
        rule.value = values;
      }
      rules.push(rule);
    }
  } catch {
    return null;
  }
  return rules.length > 0 ? rules : null;
}

/** The two `data-*` attributes of a show-if group (empty object when there is none). */
export function showIfAttributes(showIf: DynShowIf | undefined): Record<string, string> {
  if (!showIf || showIf.rules.length === 0) return {};
  return { 'data-show-join': showIf.join, 'data-show-rules': encodeShowIfRules(showIf.rules) };
}

/** Rebuild a group from the two attributes. */
export function showIfFromAttributes(
  join: string | null | undefined,
  rules: string | null | undefined,
): DynShowIf | undefined {
  const decoded = decodeShowIfRules(rules);
  if (!decoded) return undefined;
  return { join: join === 'any' ? 'any' : 'all', rules: decoded };
}

// ---------------------------------------------------------------------------
// Hints and input configuration
// ---------------------------------------------------------------------------

const PROVIDER_LABELS: Record<DynLinkProvider, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  drive: 'Google Drive',
  dropbox: 'Dropbox',
};
const ALL_PROVIDERS: DynLinkProvider[] = ['youtube', 'vimeo', 'drive', 'dropbox'];

/** "a", "a or b", "a, b or c". */
export function joinOr(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/** "YouTube, Vimeo, Google Drive or Dropbox" (or the question's own providers). */
export function providerNames(providers?: DynLinkProvider[]): string {
  return joinOr(
    (providers && providers.length > 0 ? providers : ALL_PROVIDERS).map((p) => PROVIDER_LABELS[p]),
  );
}

/** Short sentence under a link question. */
export function linkHint(providers?: DynLinkProvider[]): string {
  return `A ${providerNames(providers)} link that starts with https://.`;
}

/** Hint line for a checkbox question's selection limit; the server enforces it. */
export function checkboxLimitHint(limit?: {
  kind: 'at_least' | 'at_most' | 'exactly';
  n: number;
}): string | undefined {
  if (!limit) return undefined;
  if (limit.kind === 'exactly') return `Choose exactly ${limit.n}.`;
  return limit.kind === 'at_least' ? `Choose at least ${limit.n}.` : `Choose up to ${limit.n}.`;
}

/** Hint for the grid rules the server enforces. */
export function gridHint(q: {
  type: 'choice_grid' | 'checkbox_grid';
  requireEachRow: boolean;
  onePerColumn: boolean;
}): string | undefined {
  const parts: string[] = [];
  parts.push(q.type === 'choice_grid' ? 'Choose one answer in each row.' : 'Choose any answers in each row.');
  if (q.requireEachRow) parts.push('Answer every row.');
  if (q.onePerColumn) parts.push('Choose each column only once.');
  return parts.join(' ');
}

export interface TextInputConfig {
  type: 'text' | 'email' | 'tel' | 'url';
  inputmode?: 'text' | 'email' | 'tel' | 'url' | 'numeric' | 'decimal' | undefined;
  autocomplete?: string | undefined;
  hint?: string | undefined;
}

const AUTOCOMPLETE_BY_BIND: Record<string, string> = {
  'contact.name': 'name',
  'contact.email': 'email',
  'contact.phone': 'tel',
  'roster.city': 'address-level2',
  'request.address': 'street-address',
  'request.church_name': 'organization',
};

/** `<input>` type, inputmode, autocomplete (WCAG 1.3.5) and a format hint for a short text question. */
export function textInputConfig(q: DynQuestionOf<'short_text'>): TextInputConfig {
  const autocomplete = q.bind ? AUTOCOMPLETE_BY_BIND[q.bind] : undefined;
  const rule = q.validation;
  switch (rule?.kind) {
    case 'email':
      return { type: 'email', inputmode: 'email', autocomplete: autocomplete ?? 'email' };
    case 'phone':
      return { type: 'tel', inputmode: 'tel', autocomplete: autocomplete ?? 'tel' };
    case 'url':
      return { type: 'url', inputmode: 'url', hint: 'Start with https://.', autocomplete };
    case 'postal_code':
      return {
        type: 'text',
        inputmode: 'numeric',
        autocomplete: autocomplete ?? 'postal-code',
        hint: 'A US ZIP code, such as 12345.',
      };
    case 'number': {
      const range =
        rule.min !== undefined && rule.max !== undefined
          ? `Between ${rule.min} and ${rule.max}.`
          : rule.min !== undefined
            ? `At least ${rule.min}.`
            : rule.max !== undefined
              ? `At most ${rule.max}.`
              : undefined;
      const kind = rule.integer ? 'A whole number.' : 'A number.';
      return {
        type: 'text',
        inputmode: rule.integer ? 'numeric' : 'decimal',
        autocomplete,
        hint: [kind, range].filter(Boolean).join(' '),
      };
    }
    default:
      return {
        type: autocomplete === 'email' ? 'email' : autocomplete === 'tel' ? 'tel' : 'text',
        inputmode: autocomplete === 'email' ? 'email' : autocomplete === 'tel' ? 'tel' : undefined,
        autocomplete,
      };
  }
}

/** Hint for the date question's format (shown for the text fallback and under the native picker). */
export function dateHint(q: { includeYear: boolean; includeTime: boolean }): string | undefined {
  if (q.includeYear) return q.includeTime ? 'Choose a date and a time.' : undefined;
  return q.includeTime
    ? 'Month, day and time as MM-DD HH:MM, for example 12-24 18:30.'
    : 'Month and day as MM-DD, for example 12-24.';
}

/** `pattern` for the text-based date and duration inputs. */
export const MONTH_DAY_PATTERN = '\\d{2}-\\d{2}';
export const MONTH_DAY_TIME_PATTERN = '\\d{2}-\\d{2} \\d{2}:\\d{2}';
export const DURATION_PATTERN = '\\d{1,3}:\\d{2}:\\d{2}';

/** Paragraphs of a statement body: split on blank lines, blank paragraphs dropped. Text only, never HTML. */
export function splitParagraphs(body: string | undefined): string[] {
  if (!body) return [];
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// File questions
// ---------------------------------------------------------------------------

const MIB = 1024 * 1024;

/** Content types the public uploader accepts for each group (`document` is PDF only; audio is not accepted yet). */
export const ACCEPT_BY_GROUP: Record<
  DynFileGroup,
  { mime: string[]; ext: string[]; label: string; maxMb: number }
> = {
  image: {
    mime: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
    ext: ['.jpg', '.jpeg', '.png', '.webp', '.heic'],
    label: 'photos (JPEG, PNG, WebP or HEIC)',
    maxMb: 10,
  },
  video: {
    mime: ['video/mp4', 'video/quicktime', 'video/webm'],
    ext: ['.mp4', '.mov', '.webm'],
    label: 'video (MP4, MOV or WebM)',
    maxMb: 500,
  },
  pdf: { mime: ['application/pdf'], ext: ['.pdf'], label: 'PDF', maxMb: 10 },
  document: { mime: ['application/pdf'], ext: ['.pdf'], label: 'PDF', maxMb: 10 },
  audio: {
    mime: ['audio/mpeg', 'audio/mp4', 'audio/wav'],
    ext: ['.mp3', '.m4a', '.wav'],
    label: 'audio (MP3, M4A or WAV)',
    maxMb: 10,
  },
};

/** Native `accept` list for a file question. */
export function acceptAttribute(groups: DynFileGroup[]): string {
  const parts: string[] = [];
  for (const group of groups) {
    const entry = ACCEPT_BY_GROUP[group];
    for (const item of [...entry.mime, ...entry.ext]) if (!parts.includes(item)) parts.push(item);
  }
  return parts.join(',');
}

/** "photos (JPEG, PNG, WebP or HEIC), video (MP4, MOV or WebM) or PDF". */
export function acceptedTypesLabel(groups: DynFileGroup[]): string {
  const labels: string[] = [];
  for (const group of groups) {
    const label = ACCEPT_BY_GROUP[group].label;
    if (!labels.includes(label)) labels.push(label);
  }
  return joinOr(labels);
}

/** The per-file size limit to state: the question's limit, but never above what its types allow. */
export function effectiveMaxMb(q: { accept: DynFileGroup[]; maxMb: number }): number {
  const ceiling = Math.max(...q.accept.map((g) => ACCEPT_BY_GROUP[g].maxMb));
  return Math.min(q.maxMb, ceiling);
}

/** Per-file size limit in bytes (used by the browser to refuse a file before uploading it). */
export const maxBytesFor = (q: { accept: DynFileGroup[]; maxMb: number }): number => effectiveMaxMb(q) * MIB;

/**
 * The link question that can stand in for a video upload: the next `link` question in the same section
 * after the file question, else the first link question in that section. Null when there is none or the
 * file question does not accept video.
 */
export function linkAlternativeFor(
  section: DynSection,
  question: DynQuestionOf<'file_upload'>,
): DynQuestionOf<'link'> | null {
  if (!question.accept.includes('video')) return null;
  const index = section.questions.findIndex((q) => q.id === question.id);
  const links = section.questions.filter((q): q is DynQuestionOf<'link'> => q.type === 'link');
  return links.find((q) => section.questions.indexOf(q) > index) ?? links[0] ?? null;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** First server message per question id. */
export function errorsByQuestion(errors: DynAnswerError[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of errors ?? [])
    if (!Object.prototype.hasOwnProperty.call(out, e.questionId)) out[e.questionId] = e.message;
  return out;
}

/** Entries for `FormErrorSummary`: "Question label: message", linking to the field. */
export function summaryEntries(
  schema: DynFormSchema,
  errors: DynAnswerError[] | undefined,
  idPrefix: string,
): { message: string; fieldId?: string }[] {
  const labels = new Map<string, string>();
  for (const section of schema.sections) for (const q of section.questions) labels.set(q.id, q.label);
  const byQuestion = errorsByQuestion(errors);
  const entries: { message: string; fieldId?: string }[] = [];
  for (const section of schema.sections) {
    for (const q of section.questions) {
      const message = byQuestion[q.id];
      if (message !== undefined)
        entries.push({ message: `${q.label}: ${message}`, fieldId: buildFieldId(idPrefix, q.id) });
    }
  }
  for (const e of errors ?? []) {
    if (!labels.has(e.questionId) && !entries.some((x) => x.message === e.message))
      entries.push({ message: e.message });
  }
  return entries;
}
