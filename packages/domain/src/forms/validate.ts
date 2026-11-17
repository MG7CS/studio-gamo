/**
 * Server-side answer validation for dynamic forms. The frontend is never the authority: the server
 * re-runs showIf branching, required checks and every per-type rule on whatever was posted.
 *
 * Raw field conventions (what the renderer must post):
 * - most questions: `raw[questionId]` is a string (checkboxes: string or string[]).
 * - "Other" choice: `raw[questionId]` holds `OTHER_VALUE` and `raw[otherFieldName(id)]` the typed text.
 * - grids: one field per row, `raw[gridFieldName(id, rowIndex)]` holds the chosen column label(s).
 * - file_upload: not in `raw`; `uploads[questionId]` is the list of finished uploads.
 */
import { normalizeLink } from './links.ts';
import { compileSafePattern } from './safe-regex.ts';
import type { NormalizedLink } from './links.ts';
import {
  FILE_GROUP_KINDS,
  FORM_LIMITS,
  uploadRefSchema,
  type BindKey,
  type FormSchema,
  type Question,
  type ShowIf,
  type UploadRef,
} from './schema.ts';

export const OTHER_VALUE = '__other__';
export const otherFieldName = (questionId: string): string => `${questionId}.other`;
export const gridFieldName = (questionId: string, rowIndex: number): string => `${questionId}.${rowIndex}`;

export type AnswerValue =
  string | number | string[] | UploadRef[] | Record<string, string | string[]> | NormalizedLink;
export type Answers = Record<string, AnswerValue>;
export type AnswerError = { questionId: string; message: string };
export type ValidationResult =
  | { ok: true; answers: Answers; binds: Partial<Record<BindKey, unknown>> }
  | { ok: false; errors: AnswerError[] };

const REQUIRED_MESSAGE = 'This question is required.';
const MAX_LIST = 200;
const MAX_URL = 2048;

type Check = { ok: true; value: AnswerValue | null } | { ok: false; message: string };
const good = (value: AnswerValue | null): Check => ({ ok: true, value });
const empty: Check = { ok: true, value: null };
const bad = (message: string): Check => ({ ok: false, message });

const INVALID = Symbol('invalid');
type Invalid = typeof INVALID;

function hasOwn(target: unknown, key: string): boolean {
  return target !== null && typeof target === 'object' && Object.prototype.hasOwnProperty.call(target, key);
}
function rawGet(raw: unknown, key: string): unknown {
  return hasOwn(raw, key) ? (raw as Record<string, unknown>)[key] : undefined;
}
/** Own-property assignment that is safe for keys like `__proto__`. */
function setOwn<T>(target: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** String value, trimmed; `null` when absent or blank; INVALID when it is not a string. */
function readText(value: unknown): string | null | Invalid {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return INVALID;
  const text = value.replace(CONTROL, '').trim();
  return text === '' ? null : text;
}

/** List of non-blank, de-duplicated strings from a string or string[]. */
function readList(value: unknown): string[] | Invalid {
  if (value === undefined || value === null) return [];
  if (typeof value === 'string') {
    const t = readText(value);
    return t === null || t === INVALID ? [] : [t];
  }
  if (!Array.isArray(value) || value.length > MAX_LIST) return INVALID;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return INVALID;
    const t = readText(item);
    if (t !== null && t !== INVALID && !out.includes(t)) out.push(t);
  }
  return out;
}

function isEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(value);
}
function isUrl(value: string): boolean {
  if (value.length > MAX_URL) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
function isPhone(value: string): boolean {
  return /^[0-9+()\-.\s]{7,25}$/.test(value) && (value.match(/\d/g)?.length ?? 0) >= 7;
}

// ---------------------------------------------------------------------------
// Per-type checks
// ---------------------------------------------------------------------------

type TextRule =
  | Extract<Question, { type: 'short_text' }>['validation']
  | Extract<Question, { type: 'paragraph' }>['validation'];

function applyTextRule(rule: TextRule, text: string): string | null {
  if (!rule) return null;
  const custom = (fallback: string) => rule.message || fallback;
  switch (rule.kind) {
    case 'number': {
      if (text.length > 30 || !/^-?\d+(\.\d+)?$/.test(text)) return custom('Enter a valid number.');
      const n = Number(text);
      if (!Number.isFinite(n)) return custom('Enter a valid number.');
      if (rule.integer && !Number.isInteger(n)) return custom('Enter a whole number.');
      if (rule.min !== undefined && rule.max !== undefined && (n < rule.min || n > rule.max)) {
        return custom(`Enter a number between ${rule.min} and ${rule.max}.`);
      }
      if (rule.min !== undefined && n < rule.min) return custom(`Enter a number of at least ${rule.min}.`);
      if (rule.max !== undefined && n > rule.max) return custom(`Enter a number of at most ${rule.max}.`);
      return null;
    }
    case 'text_contains':
      return text.toLowerCase().includes(rule.value.toLowerCase())
        ? null
        : custom(`Include "${rule.value}".`);
    case 'text_not_contains':
      return text.toLowerCase().includes(rule.value.toLowerCase())
        ? custom(`Do not include "${rule.value}".`)
        : null;
    case 'email':
      return isEmail(text) ? null : custom('Enter a valid email address.');
    case 'phone':
      return isPhone(text) ? null : custom('Enter a valid phone number.');
    case 'postal_code':
      return /^\d{5}(-\d{4})?$/.test(text) ? null : custom('Enter a US ZIP code (12345 or 12345-6789).');
    case 'url':
      return isUrl(text) ? null : custom('Enter a full web address starting with https://.');
    case 'length':
      if (rule.min !== undefined && text.length < rule.min)
        return custom(`Enter at least ${rule.min} characters.`);
      if (rule.max !== undefined && text.length > rule.max)
        return custom(`Keep this under ${rule.max} characters.`);
      return null;
    case 'regex': {
      // Fail closed, and never use the native RegExp engine: the pattern must parse in the restricted grammar
      // (./safe-regex.ts) and is matched by a linear-time NFA simulation. Values longer than
      // FORM_LIMITS.maxRegexTested are refused without matching, never tested as a truncated prefix (an
      // anchored or "ends with" pattern would then pass or fail on text the applicant did not submit).
      const refused = custom('This answer is not in the expected format.');
      if (text.length > FORM_LIMITS.maxRegexTested) return refused;
      const compiled = compileSafePattern(rule.pattern);
      return compiled?.test(text) ? null : refused;
    }
  }
}

function checkText(q: Extract<Question, { type: 'short_text' | 'paragraph' }>, raw: unknown): Check {
  const value = readText(rawGet(raw, q.id));
  if (value === INVALID) return bad('Enter a single text answer.');
  if (value === null) return empty;
  const multiline = q.type === 'paragraph';
  const text = multiline ? value : value.replace(/\s*[\r\n]+\s*/g, ' ');
  const cap = Math.min(
    q.maxLength ?? (multiline ? FORM_LIMITS.maxParagraph : FORM_LIMITS.maxShortText),
    multiline ? FORM_LIMITS.maxParagraph : FORM_LIMITS.maxShortText,
  );
  if (text.length > cap) return bad(`Keep this under ${cap} characters.`);
  const problem = applyTextRule(q.validation, text);
  return problem ? bad(problem) : good(text);
}

function resolveChoice(
  q: Extract<Question, { type: 'multiple_choice' | 'checkboxes' | 'dropdown' }>,
  value: string,
  raw: unknown,
): Check {
  if (value === OTHER_VALUE) {
    if (!('other' in q) || !q.other) return bad('Choose one of the listed options.');
    const other = readText(rawGet(raw, otherFieldName(q.id)));
    if (other === INVALID || other === null) return bad('Enter your answer for "Other".');
    if (other.length > FORM_LIMITS.maxOtherText)
      return bad(`Keep "Other" under ${FORM_LIMITS.maxOtherText} characters.`);
    return good(other);
  }
  return q.options.includes(value) ? good(value) : bad('Choose one of the listed options.');
}

function checkSingleChoice(
  q: Extract<Question, { type: 'multiple_choice' | 'dropdown' }>,
  raw: unknown,
): Check {
  const value = readText(rawGet(raw, q.id));
  if (value === INVALID) return bad('Choose one of the listed options.');
  if (value === null) return empty;
  return resolveChoice(q, value, raw);
}

function checkCheckboxes(q: Extract<Question, { type: 'checkboxes' }>, raw: unknown): Check {
  const list = readList(rawGet(raw, q.id));
  if (list === INVALID) return bad('Choose from the listed options.');
  if (list.length === 0) return empty;
  const picked: string[] = [];
  for (const item of list) {
    const result = resolveChoice(q, item, raw);
    if (!result.ok) return result;
    const value = result.value as string;
    if (!picked.includes(value)) picked.push(value);
  }
  if (q.limit) {
    const { kind, n } = q.limit;
    if (kind === 'at_least' && picked.length < n) return bad(`Choose at least ${n}.`);
    if (kind === 'at_most' && picked.length > n) return bad(`Choose at most ${n}.`);
    if (kind === 'exactly' && picked.length !== n) return bad(`Choose exactly ${n}.`);
  }
  return good(picked);
}

function checkScale(q: Extract<Question, { type: 'linear_scale' | 'rating' }>, raw: unknown): Check {
  const text = readText(rawGet(raw, q.id));
  if (text === INVALID) return bad('Choose a value.');
  if (text === null) return empty;
  const min = q.type === 'rating' ? 1 : q.min;
  const message = `Choose a value from ${min} to ${q.max}.`;
  if (!/^\d{1,2}$/.test(text)) return bad(message);
  const n = Number(text);
  return n < min || n > q.max ? bad(message) : good(n);
}

function checkGrid(q: Extract<Question, { type: 'choice_grid' | 'checkbox_grid' }>, raw: unknown): Check {
  const answer: Record<string, string | string[]> = {};
  const usedColumns = new Map<string, number>();
  let answered = 0;
  let missingRow = false;
  for (const [index, row] of q.rows.entries()) {
    const value = rawGet(raw, gridFieldName(q.id, index));
    let picked: string[];
    if (q.type === 'choice_grid') {
      const text = readText(value);
      if (text === INVALID) return bad(`Choose one column for "${row}".`);
      picked = text === null ? [] : [text];
    } else {
      const list = readList(value);
      if (list === INVALID) return bad(`Choose columns for "${row}".`);
      picked = list;
    }
    if (picked.length === 0) {
      missingRow = true;
      continue;
    }
    for (const column of picked) {
      if (!q.columns.includes(column)) return bad(`Choose a listed column for "${row}".`);
      usedColumns.set(column, (usedColumns.get(column) ?? 0) + 1);
    }
    answered += 1;
    setOwn(answer, row, q.type === 'choice_grid' ? picked[0]! : picked);
  }
  if (answered === 0) return empty;
  if (q.requireEachRow && missingRow) return bad('Answer every row.');
  if (q.onePerColumn && [...usedColumns.values()].some((n) => n > 1))
    return bad('Choose each column only once.');
  return good(answer);
}

const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function validTime(h: number, m: number): boolean {
  return h >= 0 && h < 24 && m >= 0 && m < 60;
}

function checkDate(q: Extract<Question, { type: 'date' }>, raw: unknown): Check {
  const text = readText(rawGet(raw, q.id));
  if (text === INVALID) return bad('Enter a date.');
  if (text === null) return empty;
  const datePart = q.includeYear ? '(\\d{4})-(\\d{2})-(\\d{2})' : '(\\d{2})-(\\d{2})';
  const re = new RegExp(`^${datePart}${q.includeTime ? '[T ](\\d{2}):(\\d{2})' : ''}$`);
  const shape = `${q.includeYear ? 'YYYY-MM-DD' : 'MM-DD'}${q.includeTime ? ' HH:MM' : ''}`;
  const m = re.exec(text);
  if (!m) return bad(`Enter a date as ${shape}.`);
  const nums = m.slice(1).map(Number);
  const year = q.includeYear ? nums.shift()! : null;
  const month = nums.shift()!;
  const day = nums.shift()!;
  const leap = year === null || (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0));
  const maxDay = month === 2 ? (leap ? 29 : 28) : DAYS[month - 1];
  if (
    (year !== null && (year < 1900 || year > 2200)) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    maxDay === undefined ||
    day > maxDay
  ) {
    return bad('Enter a real calendar date.');
  }
  if (q.includeTime) {
    if (!validTime(nums[0]!, nums[1]!)) return bad('Enter a real time (00:00 to 23:59).');
    return good(`${text.slice(0, text.length - 6)}T${text.slice(-5)}`);
  }
  return good(text);
}

function checkTime(q: Extract<Question, { type: 'time' }>, raw: unknown): Check {
  const text = readText(rawGet(raw, q.id));
  if (text === INVALID) return bad('Enter a time.');
  if (text === null) return empty;
  if (q.mode === 'duration') {
    const m = /^(\d{1,3}):(\d{2}):(\d{2})$/.exec(text);
    if (!m || Number(m[2]) > 59 || Number(m[3]) > 59) return bad('Enter a duration as HH:MM:SS.');
    return good(text);
  }
  const m = /^(\d{2}):(\d{2})$/.exec(text);
  if (!m || !validTime(Number(m[1]), Number(m[2]))) return bad('Enter a time as HH:MM (24-hour).');
  return good(text);
}

function checkLink(q: Extract<Question, { type: 'link' }>, raw: unknown): Check {
  const text = readText(rawGet(raw, q.id));
  if (text === INVALID) return bad('Enter a link.');
  if (text === null) return empty;
  const link = text.length > MAX_URL ? null : normalizeLink(text);
  const message = 'Enter a YouTube, Vimeo, Google Drive or Dropbox link that starts with https://.';
  if (!link) return bad(message);
  if (q.providers && !q.providers.includes(link.provider)) return bad(message);
  return good(link);
}

function checkFiles(q: Extract<Question, { type: 'file_upload' }>, uploads: unknown): Check {
  const value = rawGet(uploads, q.id);
  if (value === undefined || value === null) return empty;
  if (!Array.isArray(value)) return bad('The upload could not be read. Try again.');
  if (value.length === 0) return empty;
  if (value.length > q.maxFiles)
    return bad(`Attach at most ${q.maxFiles} ${q.maxFiles === 1 ? 'file' : 'files'}.`);
  const allowed = new Set(q.accept.flatMap((group) => FILE_GROUP_KINDS[group]));
  const maxBytes = q.maxMb * 1024 * 1024;
  const refs: UploadRef[] = [];
  for (const item of value) {
    const parsed = uploadRefSchema.safeParse(item);
    if (!parsed.success) return bad('The upload could not be read. Try again.');
    const ref = parsed.data;
    if (refs.some((r) => r.uploadId === ref.uploadId)) return bad('The same file was attached twice.');
    if (!allowed.has(ref.kind)) return bad(`Attach a file of an allowed type (${q.accept.join(', ')}).`);
    if (ref.bytes > maxBytes) return bad(`Each file must be ${q.maxMb} MB or smaller.`);
    refs.push({ uploadId: ref.uploadId, kind: ref.kind, bytes: ref.bytes });
  }
  return good(refs);
}

function checkQuestion(q: Exclude<Question, { type: 'statement' }>, raw: unknown, uploads: unknown): Check {
  switch (q.type) {
    case 'short_text':
    case 'paragraph':
      return checkText(q, raw);
    case 'multiple_choice':
    case 'dropdown':
      return checkSingleChoice(q, raw);
    case 'checkboxes':
      return checkCheckboxes(q, raw);
    case 'file_upload':
      return checkFiles(q, uploads);
    case 'linear_scale':
    case 'rating':
      return checkScale(q, raw);
    case 'choice_grid':
    case 'checkbox_grid':
      return checkGrid(q, raw);
    case 'date':
      return checkDate(q, raw);
    case 'time':
      return checkTime(q, raw);
    case 'link':
      return checkLink(q, raw);
  }
}

// ---------------------------------------------------------------------------
// Whole-form validation
// ---------------------------------------------------------------------------

function bindValue(bind: BindKey, value: AnswerValue): { value: unknown } | { error: string } {
  if (typeof value !== 'string') return { value };
  if (bind === 'contact.email') {
    const email = value.trim().toLowerCase();
    return isEmail(email) ? { value: email } : { error: 'Enter a valid email address.' };
  }
  if (bind === 'contact.phone' && !isPhone(value)) return { error: 'Enter a valid phone number.' };
  return { value };
}

/**
 * Validate posted answers against a (published) schema. Answers to questions hidden by `showIf` are
 * dropped and never required; ids not in the schema are ignored; every error is reported.
 */
export function validateAnswers(
  schema: FormSchema,
  raw: Record<string, string | string[]>,
  uploads: Record<string, UploadRef[]>,
): ValidationResult {
  const errors: AnswerError[] = [];
  const answers: Answers = {};
  const binds: Partial<Record<BindKey, unknown>> = {};
  const shown = new Map<string, boolean>();
  // Comparable value of each answered question; `true` = answered with a non-text value (grid, upload, link).
  const conditionValue = new Map<string, string | string[] | true>();

  const ruleHolds = (rule: ShowIf['rules'][number]): boolean => {
    // Unknown, later or hidden source questions never satisfy a rule (fail closed).
    if (shown.get(rule.questionId) !== true) return false;
    const value = conditionValue.get(rule.questionId);
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
  const groupHolds = (group: ShowIf | undefined): boolean => {
    if (!group) return true;
    return group.join === 'any' ? group.rules.some(ruleHolds) : group.rules.every(ruleHolds);
  };

  for (const section of schema.sections) {
    const sectionVisible = groupHolds(section.showIf);
    for (const q of section.questions) {
      if (q.type === 'statement') continue;
      const visible = sectionVisible && groupHolds(q.showIf);
      if (!shown.has(q.id)) shown.set(q.id, visible);
      if (!visible) continue;

      const result = checkQuestion(q, raw, uploads);
      if (!result.ok) {
        errors.push({ questionId: q.id, message: result.message });
        const fallback = readText(rawGet(raw, q.id));
        if (typeof fallback === 'string') conditionValue.set(q.id, fallback);
        continue;
      }
      if (result.value === null) {
        if (q.required) errors.push({ questionId: q.id, message: REQUIRED_MESSAGE });
        continue;
      }
      const { value } = result;
      if (typeof value === 'string') conditionValue.set(q.id, value);
      else if (typeof value === 'number') conditionValue.set(q.id, String(value));
      else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
        conditionValue.set(q.id, value as string[]);
      } else conditionValue.set(q.id, true);
      if (q.bind) {
        const bound = bindValue(q.bind, value);
        if ('error' in bound) {
          errors.push({ questionId: q.id, message: bound.error });
          continue;
        }
        binds[q.bind] = bound.value;
      }
      setOwn(answers, q.id, value);
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, answers, binds };
}
