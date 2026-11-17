/**
 * Forms engine schema (design: "Forms engine"). Pure TypeScript + zod: no database, no Astro.
 *
 * A `FormSchema` is what staff edit in admin and what a published `form_versions` row snapshots.
 * `parseFormSchema` accepts a draft (it may still be unpublishable); `checkPublishable` lists the
 * reasons a draft cannot be published yet. `validateAnswers` lives in `./validate.ts`.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export const QUESTION_TYPES = [
  'short_text',
  'paragraph',
  'multiple_choice',
  'checkboxes',
  'dropdown',
  'file_upload',
  'linear_scale',
  'rating',
  'choice_grid',
  'checkbox_grid',
  'date',
  'time',
  'link',
  'statement',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const BIND_KEYS = [
  'contact.name',
  'contact.email',
  'contact.phone',
  'roster.roles',
  'roster.city',
  'roster.can_teach',
  'request.church_name',
  'request.date',
  'request.start_time',
  'request.address',
  'request.roles_needed',
] as const;
export type BindKey = (typeof BIND_KEYS)[number];

export const FORM_KINDS = [
  'musician_application',
  'technician_application',
  'church_request',
  'production_request',
  'contact',
  'partner_interest',
] as const;
export type FormKind = (typeof FORM_KINDS)[number];

/** Bind keys a form of each kind must contain before it can be published. */
export const REQUIRED_BINDS: Record<FormKind, BindKey[]> = {
  musician_application: ['contact.name', 'contact.email', 'roster.roles'],
  technician_application: ['contact.name', 'contact.email', 'roster.roles'],
  church_request: [
    'contact.name',
    'contact.email',
    'request.church_name',
    'request.date',
    'request.roles_needed',
  ],
  production_request: [
    'contact.name',
    'contact.email',
    'request.church_name',
    'request.date',
    'request.roles_needed',
  ],
  contact: ['contact.name', 'contact.email'],
  partner_interest: ['contact.name', 'contact.email'],
};

export const FILE_GROUPS = ['image', 'video', 'pdf', 'document', 'audio'] as const;
export type FileGroup = (typeof FILE_GROUPS)[number];

export type UploadKind = 'image' | 'video' | 'pdf' | 'other';
/** What the upload service stores for a finished, verified upload. */
export type UploadRef = { uploadId: string; kind: UploadKind; bytes: number };

/** Upload kinds that satisfy each accept group (`document` and `audio` are stored as pdf/other). */
export const FILE_GROUP_KINDS: Record<FileGroup, UploadKind[]> = {
  image: ['image'],
  video: ['video'],
  pdf: ['pdf'],
  document: ['pdf', 'other'],
  audio: ['other'],
};

export const LINK_PROVIDER_NAMES = ['youtube', 'vimeo', 'drive', 'dropbox'] as const;

export const FORM_LIMITS = {
  maxSections: 20,
  maxQuestions: 100,
  maxOptions: 100,
  maxOptionLabel: 150,
  maxGridAxis: 20,
  maxLabel: 200,
  maxHelp: 500,
  maxShowIfRules: 10,
  maxRegex: 100,
  maxRegexTested: 500,
  maxSchemaBytes: 256 * 1024,
  maxShortText: 500,
  maxParagraph: 5000,
  maxOtherText: 300,
  maxFiles: 10,
  maxUploadMb: 500,
} as const;

const RESERVED_IDS = new Set(['constructor', 'prototype']);

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const idSchema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/, 'Use letters, digits, "_" or "-" (start with a letter, max 40).')
  .refine((id) => !RESERVED_IDS.has(id), 'This id is reserved.');
const labelSchema = z.string().trim().min(1).max(FORM_LIMITS.maxLabel);
const helpSchema = z.string().trim().max(FORM_LIMITS.maxHelp).optional();
const messageSchema = z.string().trim().max(200).optional();
const optionsSchema = z
  .array(z.string().trim().min(1).max(FORM_LIMITS.maxOptionLabel))
  .min(1)
  .max(FORM_LIMITS.maxOptions);

const ruleValue = z.union([
  z.string().max(FORM_LIMITS.maxOptionLabel),
  z.array(z.string().max(FORM_LIMITS.maxOptionLabel)).min(1).max(FORM_LIMITS.maxOptions),
]);

const showIfRuleSchema = z
  .object({
    questionId: idSchema,
    op: z.enum(['eq', 'neq', 'in', 'answered']),
    value: ruleValue.optional(),
  })
  .superRefine((rule, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message });
    if ((rule.op === 'eq' || rule.op === 'neq') && typeof rule.value !== 'string') {
      fail(`"${rule.op}" needs a single text value.`);
    } else if (rule.op === 'in' && rule.value === undefined) {
      fail('"in" needs a value or a list of values.');
    }
  });

const showIfGroupSchema = z.object({
  join: z.enum(['all', 'any']).default('all'),
  rules: z.array(showIfRuleSchema).min(1).max(FORM_LIMITS.maxShowIfRules),
});

/** Old shape `{questionId, equals|includes}` becomes a one-rule "all" group; anything else passes through. */
function upgradeLegacyShowIf(input: unknown): unknown {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return input;
  const old = input as Record<string, unknown>;
  if (!('questionId' in old) || 'rules' in old) return input;
  const hasEquals = old.equals !== undefined;
  const hasIncludes = old.includes !== undefined;
  if (hasEquals === hasIncludes) return input; // neither or both: let validation reject it
  return {
    join: 'all',
    rules: [
      hasEquals
        ? { questionId: old.questionId, op: 'eq', value: old.equals }
        : { questionId: old.questionId, op: 'in', value: [old.includes] },
    ],
  };
}

const showIfSchema = z.preprocess(upgradeLegacyShowIf, showIfGroupSchema);

const base = {
  id: idSchema,
  label: labelSchema,
  help: helpSchema,
  required: z.boolean().default(false),
  showIf: showIfSchema.optional(),
  bind: z.enum(BIND_KEYS).optional(),
};

const intLen = z.number().int().min(0).max(FORM_LIMITS.maxParagraph);

const lengthRule = z.object({
  kind: z.literal('length'),
  min: intLen.optional(),
  max: intLen.optional(),
  message: messageSchema,
});
const regexRule = z.object({
  kind: z.literal('regex'),
  pattern: z.string().min(1).max(FORM_LIMITS.maxRegex),
  message: messageSchema,
});

const shortTextRule = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('number'),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    integer: z.boolean().optional(),
    message: messageSchema,
  }),
  z.object({
    kind: z.literal('text_contains'),
    value: z.string().trim().min(1).max(200),
    message: messageSchema,
  }),
  z.object({
    kind: z.literal('text_not_contains'),
    value: z.string().trim().min(1).max(200),
    message: messageSchema,
  }),
  z.object({ kind: z.literal('email'), message: messageSchema }),
  z.object({ kind: z.literal('phone'), message: messageSchema }),
  z.object({ kind: z.literal('postal_code'), message: messageSchema }),
  z.object({ kind: z.literal('url'), message: messageSchema }),
  lengthRule,
  regexRule,
]);
const paragraphRule = z.discriminatedUnion('kind', [lengthRule, regexRule]);

const gridAxis = z
  .array(z.string().trim().min(1).max(FORM_LIMITS.maxOptionLabel))
  .min(1)
  .max(FORM_LIMITS.maxGridAxis);

const questionSchema = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('short_text'),
    maxLength: z.number().int().min(1).max(FORM_LIMITS.maxShortText).optional(),
    validation: shortTextRule.optional(),
  }),
  z.object({
    ...base,
    type: z.literal('paragraph'),
    maxLength: z.number().int().min(1).max(FORM_LIMITS.maxParagraph).optional(),
    validation: paragraphRule.optional(),
  }),
  z.object({
    ...base,
    type: z.literal('multiple_choice'),
    options: optionsSchema,
    other: z.boolean().default(false),
    otherLabel: z.string().max(FORM_LIMITS.maxOptionLabel).optional(),
    shuffle: z.boolean().default(false),
  }),
  z.object({
    ...base,
    type: z.literal('checkboxes'),
    options: optionsSchema,
    other: z.boolean().default(false),
    otherLabel: z.string().max(FORM_LIMITS.maxOptionLabel).optional(),
    shuffle: z.boolean().default(false),
    limit: z
      .object({
        kind: z.enum(['at_least', 'at_most', 'exactly']),
        n: z
          .number()
          .int()
          .min(1)
          .max(FORM_LIMITS.maxOptions + 1),
      })
      .optional(),
  }),
  z.object({
    ...base,
    type: z.literal('dropdown'),
    options: optionsSchema,
    shuffle: z.boolean().default(false),
  }),
  z.object({
    ...base,
    type: z.literal('file_upload'),
    accept: z.array(z.enum(FILE_GROUPS)).min(1).max(FILE_GROUPS.length),
    maxFiles: z.number().int().min(1).max(FORM_LIMITS.maxFiles).default(1),
    maxMb: z.number().min(1).max(FORM_LIMITS.maxUploadMb).default(10),
  }),
  z.object({
    ...base,
    type: z.literal('linear_scale'),
    min: z.union([z.literal(0), z.literal(1)]).default(1),
    max: z.number().int().min(2).max(10),
    minLabel: z.string().trim().max(100).optional(),
    maxLabel: z.string().trim().max(100).optional(),
  }),
  z.object({
    ...base,
    type: z.literal('rating'),
    max: z.number().int().min(3).max(10),
  }),
  z.object({
    ...base,
    type: z.literal('choice_grid'),
    rows: gridAxis,
    columns: gridAxis,
    requireEachRow: z.boolean().default(false),
    onePerColumn: z.boolean().default(false),
  }),
  z.object({
    ...base,
    type: z.literal('checkbox_grid'),
    rows: gridAxis,
    columns: gridAxis,
    requireEachRow: z.boolean().default(false),
    onePerColumn: z.boolean().default(false),
  }),
  z.object({
    ...base,
    type: z.literal('date'),
    includeYear: z.boolean().default(true),
    includeTime: z.boolean().default(false),
  }),
  z.object({
    ...base,
    type: z.literal('time'),
    mode: z.enum(['clock', 'duration']).default('clock'),
  }),
  z.object({
    ...base,
    type: z.literal('link'),
    providers: z.array(z.enum(LINK_PROVIDER_NAMES)).min(1).max(LINK_PROVIDER_NAMES.length).optional(),
  }),
  z.object({
    ...base,
    type: z.literal('statement'),
    body: z.string().trim().max(FORM_LIMITS.maxHelp).optional(),
  }),
]);

const sectionSchema = z.object({
  id: idSchema,
  title: labelSchema,
  description: helpSchema,
  showIf: showIfSchema.optional(),
  questions: z.array(questionSchema).max(FORM_LIMITS.maxQuestions),
});

const formSchemaSchema = z
  .object({ sections: z.array(sectionSchema).min(1).max(FORM_LIMITS.maxSections) })
  .superRefine((form, ctx) => {
    const total = form.sections.reduce((n, s) => n + s.questions.length, 0);
    if (total > FORM_LIMITS.maxQuestions) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sections'],
        message: `A form can have at most ${FORM_LIMITS.maxQuestions} questions.`,
      });
    }
  });

export type Question = z.infer<typeof questionSchema>;
export type QuestionOf<T extends QuestionType> = Extract<Question, { type: T }>;
export type Section = z.infer<typeof sectionSchema>;
export type FormSchema = z.infer<typeof formSchemaSchema>;
export type FormSchemaInput = z.input<typeof formSchemaSchema>;
export type ShowIf = z.infer<typeof showIfGroupSchema>;
export type ShowIfRule = z.infer<typeof showIfRuleSchema>;
export type ShortTextRule = z.infer<typeof shortTextRule>;
export type ParagraphRule = z.infer<typeof paragraphRule>;

export const uploadRefSchema = z.object({
  uploadId: z.string().min(1).max(100),
  kind: z.enum(['image', 'video', 'pdf', 'other']),
  bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});

export class FormSchemaError extends Error {
  readonly path: string;
  readonly issues: { path: string; message: string }[];
  constructor(path: string, message: string, issues: { path: string; message: string }[] = []) {
    super(path ? `${path}: ${message}` : message);
    this.name = 'FormSchemaError';
    this.path = path;
    this.issues = issues.length > 0 ? issues : [{ path, message }];
  }
}

/** Parse untrusted JSON into a typed schema (defaults applied, unknown keys stripped). */
export function parseFormSchema(input: unknown): FormSchema {
  // Cheap size guard so a hostile document is refused before zod walks it.
  if (
    input !== null &&
    typeof input === 'object' &&
    Array.isArray((input as { sections?: unknown }).sections)
  ) {
    const sections = (input as { sections: unknown[] }).sections;
    let total = 0;
    if (sections.length > FORM_LIMITS.maxSections)
      throw new FormSchemaError('sections', 'Too many sections.');
    for (const [i, section] of sections.entries()) {
      const qs =
        section !== null && typeof section === 'object'
          ? (section as { questions?: unknown }).questions
          : null;
      if (Array.isArray(qs)) {
        total += qs.length;
        if (total > FORM_LIMITS.maxQuestions) {
          throw new FormSchemaError(
            `sections.${i}.questions`,
            `A form can have at most ${FORM_LIMITS.maxQuestions} questions.`,
          );
        }
      }
    }
  }
  let json: string | undefined;
  try {
    json = JSON.stringify(input);
  } catch {
    throw new FormSchemaError('', 'The form could not be read.');
  }
  if (
    json !== undefined &&
    (json.length > FORM_LIMITS.maxSchemaBytes ||
      new TextEncoder().encode(json).byteLength > FORM_LIMITS.maxSchemaBytes)
  ) {
    throw new FormSchemaError('', `The form is larger than ${FORM_LIMITS.maxSchemaBytes / 1024} KB.`);
  }
  const result = formSchemaSchema.safeParse(input);
  if (result.success) return result.data;
  const issues = result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
  const first = issues[0]!;
  throw new FormSchemaError(first.path, first.message, issues);
}

// ---------------------------------------------------------------------------
// Regex safety (staff-authored patterns run against applicant text)
// ---------------------------------------------------------------------------

const MAX_QUANTIFIERS = 8;
const MAX_REPEATING_ANCHORED = 3;
const MAX_REPEATING_UNANCHORED = 2;
const MAX_REPEAT = 100;
const MAX_CLASS_LENGTH = 40;

/** Characters that match themselves when written bare. Everything else must be escaped or is refused. */
const LITERAL_CHAR = /^[A-Za-z0-9 _\-:,;/@#%&'"!=~<>`]$/;
/** Punctuation that may be written as `\x` to match itself. */
const ESCAPABLE = new Set('.-/+()[]{}\\^$|*?');
/** Shorthand classes. */
const SHORTHAND = new Set('dwsDWS');

/**
 * Custom regex rules are restricted to a small, strictly parsed subset. Presets (email, phone,
 * postal code, number range, length) remain the recommended path; a custom pattern is for simple
 * codes such as `^[A-Z]{2}\d{4}$`.
 *
 * Why a whitelist: OWASP's ReDoS guidance (Regular expression Denial of Service, owasp.org/www-community/
 * attacks/Regular_expression_Denial_of_Service_-_ReDoS) shows catastrophic backtracking needs nested or
 * overlapping repetition: groups with quantifiers, alternation with overlap, or backreferences. Blacklisting those
 * shapes is brittle (parser differentials, `a?a?a?...aaa`), so instead only a grammar that cannot nest is
 * accepted, and because it is this small the screen and `RegExp` agree by construction.
 *
 * Grammar (pattern length 1..100, compiled with `new RegExp(pattern)` and refused on SyntaxError):
 *
 *   pattern    = [ "^" ] { atom [ quantifier ] } [ "$" ]
 *   atom       = literal | "\" punctuation | "." | "\" ("d"|"w"|"s"|"D"|"W"|"S") | class
 *   literal    = letter | digit | space | one of  _ - : , ; / @ # % & ' " ! = ~ < > `
 *   punctuation= one of  . - / + ( ) [ ] { } \ ^ $ | * ?
 *   class      = "[" [ "^" ] item+ "]"   (at most 40 characters between the brackets)
 *   item       = literal | "." | "\" punctuation | "\" shorthand | literal "-" literal  (range, ascending)
 *                (a "-" is literal only as the first or last item; no nested "[", no "[:posix:]")
 *   quantifier = "?" | "*" | "+" | "{n}" | "{n,}" | "{n,m}"   (digit run of 1..3 digits, n <= m <= 100, m >= 1)
 *
 * Refused: groups of any kind, alternation, backreferences, lookarounds, flags, `\b \B \u \x \p \k` and any
 * other escape, lazy/possessive/double quantifiers, a `{` that is not a strictly valid quantifier (never a
 * literal), unescaped `) ] }`, non-ASCII, anchors anywhere except the very start/end.
 *
 * Budgets: at most 8 quantifiers (bounds `a?a?...` at 2^8) and a cap on quantifiers whose upper bound
 * exceeds 1 (`*`, `+`, `{n,}`, `{n,m}` with m>1, `{n}` with n>1): 2 for an unanchored pattern, 3 when it
 * starts with `^`. An unanchored search retries from every start offset, which multiplies the cost by n
 * (measured: `a*a*a*b$` takes seconds on 500 characters, `^a*a*a*b$` about 70 ms), so the anchored form
 * gets the third quantifier that shapes like `^[a-z]+@[a-z]+\.[a-z]{2,}$` need.
 */
export function isSafeRegexPattern(pattern: string): boolean {
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > FORM_LIMITS.maxRegex) {
    return false;
  }
  const n = pattern.length;
  let i = pattern[0] === '^' ? 1 : 0;
  let quantifiers = 0;
  let repeating = 0;
  const maxRepeating = pattern[0] === '^' ? MAX_REPEATING_ANCHORED : MAX_REPEATING_UNANCHORED;

  /** Parse an escape at `at` (pattern[at] === "\\"); returns the code of a single-character escape, 'class' for shorthand, or null. */
  const escapeAt = (at: number): number | 'class' | null => {
    const next = pattern[at + 1];
    if (next === undefined) return null;
    if (SHORTHAND.has(next)) return 'class';
    if (ESCAPABLE.has(next)) return next.charCodeAt(0);
    return null;
  };

  /** Parse a character class starting at the "[" at `at`; returns the index after its "]" or -1. */
  const classEnd = (at: number): number => {
    let j = at + 1;
    if (pattern[j] === '^') j += 1;
    type Item = { kind: 'char'; code: number } | { kind: 'class' } | { kind: 'dash' };
    const items: Item[] = [];
    const start = j;
    while (j < n && pattern[j] !== ']') {
      const c = pattern[j]!;
      if (c === '\\') {
        const escaped = escapeAt(j);
        if (escaped === null) return -1;
        items.push(escaped === 'class' ? { kind: 'class' } : { kind: 'char', code: escaped });
        j += 2;
      } else if (c === '-') {
        items.push({ kind: 'dash' });
        j += 1;
      } else if (LITERAL_CHAR.test(c) || c === '.') {
        items.push({ kind: 'char', code: c.charCodeAt(0) });
        j += 1;
      } else {
        return -1; // includes a nested "[", "[:posix:]", non-ASCII and control characters
      }
      if (j - start > MAX_CLASS_LENGTH) return -1;
    }
    if (j >= n || items.length === 0) return -1; // unclosed or empty
    for (let k = 0; k < items.length; k += 1) {
      const item = items[k]!;
      if (item.kind === 'dash') {
        if (k !== 0 && k !== items.length - 1) return -1;
      } else if (item.kind === 'char' && items[k + 1]?.kind === 'dash' && k + 2 < items.length) {
        const to = items[k + 2]!;
        if (to.kind !== 'char' || to.code < item.code) return -1;
        k += 2;
      } else if (item.kind === 'class' && items[k + 1]?.kind === 'dash' && k + 2 < items.length) {
        return -1; // shorthand cannot start a range
      }
    }
    return j + 1;
  };

  while (i < n) {
    const c = pattern[i]!;
    if (c === '$') {
      if (i !== n - 1) return false;
      break;
    }
    // atom
    if (c === '\\') {
      if (escapeAt(i) === null) return false;
      i += 2;
    } else if (c === '[') {
      const end = classEnd(i);
      if (end < 0) return false;
      i = end;
    } else if (c === '.' || LITERAL_CHAR.test(c)) {
      i += 1;
    } else {
      return false; // ( ) | ^ * + ? { } ] and everything non-ASCII
    }
    // optional single quantifier
    const q = pattern[i];
    if (q === '?' || q === '*' || q === '+') {
      quantifiers += 1;
      if (q !== '?') repeating += 1;
      i += 1;
    } else if (q === '{') {
      const m = /^\{(\d{1,3})(?:(,)(\d{0,3}))?\}/.exec(pattern.slice(i, i + 9));
      if (!m) return false;
      const min = Number(m[1]);
      const max = m[2] === undefined ? min : m[3] === '' ? Infinity : Number(m[3]);
      if (min > MAX_REPEAT || max < min || max < 1 || (max !== Infinity && max > MAX_REPEAT)) return false;
      quantifiers += 1;
      if (max > 1) repeating += 1;
      i += m[0].length;
    }
    if (quantifiers > MAX_QUANTIFIERS || repeating > maxRepeating) return false;
  }
  try {
    new RegExp(pattern);
  } catch {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Publish checks
// ---------------------------------------------------------------------------

const BINDABLE: ReadonlySet<QuestionType> = new Set<QuestionType>([
  'short_text',
  'paragraph',
  'multiple_choice',
  'checkboxes',
  'dropdown',
  'linear_scale',
  'rating',
  'date',
  'time',
  'link',
]);

const GENERIC_LINK_LABELS = new Set(['click here', 'link', 'here', 'click', 'this link', 'url']);

function describe(q: Question): string {
  return `Question "${q.id}"`;
}

function optionsOf(q: Question): string[] | null {
  return q.type === 'multiple_choice' || q.type === 'checkboxes' || q.type === 'dropdown' ? q.options : null;
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const v of values) {
    const key = normalizeLabel(v);
    if (seen.has(key)) dup.add(v);
    seen.add(key);
  }
  return [...dup];
}

export type PublishCheck = {
  /** Blocking problems: the form cannot be published until these are fixed. */
  errors: string[];
  /** Advice only: the form can still be published. */
  warnings: string[];
};

/**
 * Publish gate. `errors` block publishing; `warnings` are quality hints. Limits are re-checked so a
 * schema built in code (not through `parseFormSchema`) is also covered.
 */
export function checkPublishable(kind: FormKind, schema: FormSchema): PublishCheck {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Flatten, remembering where each section starts so section showIf can be ordered too.
  const questions: Question[] = [];
  const seenSectionIds = new Set<string>();
  const sectionStart = new Map<string, number>();
  for (const section of schema.sections) {
    if (seenSectionIds.has(section.id)) errors.push(`Duplicate section id "${section.id}".`);
    else sectionStart.set(section.id, questions.length);
    seenSectionIds.add(section.id);
    if (section.title.length > FORM_LIMITS.maxLabel || section.title.trim() === '') {
      errors.push(`Section "${section.id}" needs a title of 1 to ${FORM_LIMITS.maxLabel} characters.`);
    }
    if ((section.description ?? '').length > FORM_LIMITS.maxHelp) {
      errors.push(`Section "${section.id}" description is longer than ${FORM_LIMITS.maxHelp} characters.`);
    }
    questions.push(...section.questions);
  }
  if (questions.length > FORM_LIMITS.maxQuestions) {
    errors.push(`A form can have at most ${FORM_LIMITS.maxQuestions} questions.`);
  }
  if (schema.sections.length > FORM_LIMITS.maxSections) errors.push('Too many sections.');
  try {
    if (new TextEncoder().encode(JSON.stringify(schema)).byteLength > FORM_LIMITS.maxSchemaBytes) {
      errors.push(`The form is larger than ${FORM_LIMITS.maxSchemaBytes / 1024} KB.`);
    }
  } catch {
    errors.push('The form could not be serialized.');
  }

  const position = new Map<string, number>();
  const byId = new Map<string, Question>();
  const dupIds = new Set<string>();
  questions.forEach((q, index) => {
    if (position.has(q.id)) dupIds.add(q.id);
    else {
      position.set(q.id, index);
      byId.set(q.id, q);
    }
  });
  for (const id of dupIds) errors.push(`Duplicate question id "${id}".`);

  /** Every rule must point at a known question that comes strictly before `limit` (an index). */
  const checkShowIf = (who: string, showIf: ShowIf, limit: number) => {
    if (showIf.rules.length === 0) errors.push(`${who} has a show-if with no rules.`);
    if (showIf.rules.length > FORM_LIMITS.maxShowIfRules) {
      errors.push(`${who} has more than ${FORM_LIMITS.maxShowIfRules} show-if rules.`);
    }
    for (const rule of showIf.rules) {
      const target = byId.get(rule.questionId);
      const at = position.get(rule.questionId);
      if (!target || at === undefined) {
        errors.push(`${who} is shown by unknown question "${rule.questionId}".`);
        continue;
      }
      if (at >= limit) {
        errors.push(`${who} must be shown by an earlier question, not "${rule.questionId}".`);
        continue;
      }
      const opts = optionsOf(target);
      const otherAllowed =
        (target.type === 'multiple_choice' || target.type === 'checkboxes') && target.other;
      if (opts && rule.op !== 'answered' && rule.value !== undefined && !otherAllowed) {
        const wanted = Array.isArray(rule.value) ? rule.value : [rule.value];
        for (const w of wanted) {
          if (!opts.includes(w)) {
            errors.push(`${who} is shown by "${w}", which is not an option of "${target.id}".`);
          }
        }
      }
    }
  };
  for (const section of schema.sections) {
    if (section.showIf) {
      const start = sectionStart.get(section.id) ?? questions.length;
      checkShowIf(`Section "${section.id}"`, section.showIf, start);
    }
  }

  const bindUse = new Map<BindKey, number>();
  const labelUse = new Map<string, number>();
  questions.forEach((q, index) => {
    const who = describe(q);
    const label = normalizeLabel(q.label);
    if (label === '') warnings.push(`${who} has an empty label.`);
    else labelUse.set(label, (labelUse.get(label) ?? 0) + 1);
    if (q.label.length > FORM_LIMITS.maxLabel) {
      errors.push(`${who} label is longer than ${FORM_LIMITS.maxLabel} characters.`);
    }
    if ((q.help ?? '').length > FORM_LIMITS.maxHelp) {
      errors.push(`${who} help text is longer than ${FORM_LIMITS.maxHelp} characters.`);
    }

    const options = optionsOf(q);
    if (options) {
      if (options.length === 0) errors.push(`${who} needs at least one option.`);
      if (options.length > FORM_LIMITS.maxOptions) {
        errors.push(`${who} has more than ${FORM_LIMITS.maxOptions} options.`);
      }
      if (options.some((o) => o.length > FORM_LIMITS.maxOptionLabel)) {
        errors.push(`${who} has an option longer than ${FORM_LIMITS.maxOptionLabel} characters.`);
      }
      for (const d of duplicates(options)) errors.push(`${who} has a duplicate option "${d}".`);
      if (options.length < 2) warnings.push(`${who} has fewer than 2 options.`);
      if (options.some((o) => o.trim() === '')) warnings.push(`${who} has an option with no label.`);
      if ((q.type === 'multiple_choice' || q.type === 'checkboxes') && q.other) {
        if (q.otherLabel !== undefined && q.otherLabel.trim() === '') {
          warnings.push(`${who} has an "Other" option with no label.`);
        }
        if (options.some((o) => normalizeLabel(o) === 'other')) {
          warnings.push(`${who} lists "Other" as an option and also enables the Other choice.`);
        }
      }
    }
    if (q.type === 'choice_grid' || q.type === 'checkbox_grid') {
      for (const [axis, values] of [
        ['row', q.rows],
        ['column', q.columns],
      ] as const) {
        if (values.length > FORM_LIMITS.maxGridAxis) {
          errors.push(`${who} has more than ${FORM_LIMITS.maxGridAxis} ${axis}s.`);
        }
        if (values.length === 0 || values.some((v) => v.trim() === '')) {
          warnings.push(`${who} has a ${axis} with no label.`);
        }
        for (const d of duplicates(values)) errors.push(`${who} has a duplicate ${axis} "${d}".`);
      }
    }
    if (q.type === 'link' && GENERIC_LINK_LABELS.has(label.replace(/[^a-z0-9 ]/g, '').trim())) {
      warnings.push(`${who} has a generic label ("${q.label}"); say what the link is for.`);
    }
    if (q.type === 'checkboxes' && q.limit) {
      const choices = q.options.length + (q.other ? 1 : 0);
      if (q.limit.kind !== 'at_most' && q.limit.n > choices) {
        errors.push(`${who} asks for ${q.limit.n} selections but has only ${choices} choices.`);
      }
    }
    if (q.type === 'short_text' || q.type === 'paragraph') {
      const rule = q.validation;
      if (rule?.kind === 'regex' && !isSafeRegexPattern(rule.pattern)) {
        errors.push(
          `${who} has a regex pattern that is not allowed. Use a preset (email, phone, postal code, number range, length) where you can; custom patterns may only use literals, character classes and simple repeats (no groups, alternation or lookarounds), at most ${FORM_LIMITS.maxRegex} characters.`,
        );
      }
      if (q.type === 'paragraph' && rule?.kind === 'regex') {
        warnings.push(
          `${who} uses a regex on a paragraph; answers over ${FORM_LIMITS.maxRegexTested} characters are refused.`,
        );
      }
      if (
        (rule?.kind === 'number' || rule?.kind === 'length') &&
        rule.min !== undefined &&
        rule.max !== undefined &&
        rule.min > rule.max
      ) {
        errors.push(`${who} has a minimum greater than its maximum.`);
      }
    }
    if (q.bind) {
      if (!BINDABLE.has(q.type)) {
        errors.push(`${who} cannot be bound to "${q.bind}" (${q.type} questions cannot carry a bind key).`);
      }
      bindUse.set(q.bind, (bindUse.get(q.bind) ?? 0) + 1);
    }
    if (q.showIf) checkShowIf(who, q.showIf, index);
  });

  for (const [text, n] of labelUse) {
    if (n > 1) warnings.push(`Duplicate label "${text}" is used by ${n} questions.`);
  }
  for (const [bind, n] of bindUse) {
    if (n > 1) warnings.push(`Bind key "${bind}" is used by more than one question.`);
  }
  for (const bind of REQUIRED_BINDS[kind]) {
    if (!bindUse.has(bind)) {
      errors.push(`A ${kind.replace(/_/g, ' ')} form needs a question bound to "${bind}".`);
    }
  }
  return { errors, warnings };
}
