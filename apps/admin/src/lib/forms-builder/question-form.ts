/**
 * The question editor's HTML form <-> the schema. `toFormValues` turns a question into the flat field
 * values the editor renders (also what a 409 or validation re-render keeps); `validateQuestionEdit` reads
 * posted fields back into a question, checks them in plain language and returns the updated schema. The
 * server's `parseFormSchema` stays the authority (`normalizeQuestion` runs the question through it).
 *
 * Field names (all optional unless the type needs them):
 *   label, help, required, bind
 *   max_length, validation_kind, validation_message, v_min, v_max, v_integer, v_value, v_pattern
 *   options, other, other_label, shuffle, limit_kind, limit_n
 *   scale_min, scale_max, min_label, max_label
 *   rows, columns, require_each_row, one_per_column
 *   include_year, include_time, time_mode, providers
 *   accept, max_files, max_mb, body
 *   si_join, si_q_<n>, si_op_<n>, si_val_<n>  (show-if sentence rules, n = 0..9)
 */
import {
  BIND_KEYS,
  FILE_GROUPS,
  FORM_LIMITS,
  LINK_PROVIDER_NAMES,
  isSafeRegexPattern,
  type BindKey,
  type FormSchema,
  type Question,
  type ShowIfRule,
} from '@gamo/domain/forms';
import {
  BINDABLE_TYPES,
  BuilderError,
  findQuestion,
  flattenQuestions,
  normalizeQuestion,
} from './schema-edit';

export type FieldValues = Record<string, string | string[]>;
export interface FieldError {
  /** The posted field name (`label`, `options`, `si_q_0`, …); the DOM id is `qe-<field>`. */
  field: string;
  message: string;
}
export type QuestionEdit =
  { ok: true; question: Question; schema: FormSchema } | { ok: false; errors: FieldError[] };

type Raw = Record<string, unknown>;

export const SHOW_IF_SLOTS = FORM_LIMITS.maxShowIfRules;

/** Human names of the system fields a question can fill. */
export const BIND_LABELS: Record<BindKey, string> = {
  'contact.name': 'Contact: name',
  'contact.email': 'Contact: email',
  'contact.phone': 'Contact: phone',
  'roster.roles': 'Roster: roles played',
  'roster.city': 'Roster: city',
  'roster.can_teach': 'Roster: can teach',
  'request.church_name': 'Request: church name',
  'request.date': 'Request: date',
  'request.start_time': 'Request: start time',
  'request.address': 'Request: address',
  'request.roles_needed': 'Request: roles needed',
};

export const REGEX_HINT = `A custom pattern may only use literal characters, . \\d \\w \\s, [character classes], ^ and $, and one repeat (? * + {n} {n,} {n,m}, up to 100) per item: no groups, alternation, backreferences or lookarounds. At most ${FORM_LIMITS.maxRegex} characters.`;

const VALIDATION_KINDS = [
  'email',
  'phone',
  'postal_code',
  'url',
  'number',
  'length',
  'text_contains',
  'text_not_contains',
  'regex',
] as const;

// ---------------------------------------------------------------------------------------------
// Reading fields
// ---------------------------------------------------------------------------------------------

const has = (fields: FieldValues, key: string) => Object.prototype.hasOwnProperty.call(fields, key);

function one(fields: FieldValues, key: string): string {
  if (!has(fields, key)) return '';
  const value = fields[key];
  const first = Array.isArray(value) ? (value[0] ?? '') : value;
  return typeof first === 'string' ? first : '';
}

function many(fields: FieldValues, key: string): string[] {
  if (!has(fields, key)) return [];
  const value = fields[key];
  return (Array.isArray(value) ? value : [value]).filter(
    (v): v is string => typeof v === 'string' && v !== '',
  );
}

const flag = (fields: FieldValues, key: string) => ['on', 'true', '1', 'yes'].includes(one(fields, key));

/** Readers for the editor component (same rules as the parser). */
export const fieldValue = one;
export const fieldValues = many;
export const fieldOn = flag;

/** One value per line; blank lines dropped. */
export function parseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function numberField(
  fields: FieldValues,
  key: string,
  errors: FieldError[],
  rule: { label: string; min?: number; max?: number; integer?: boolean },
): number | undefined {
  const text = one(fields, key).trim();
  if (text === '') return undefined;
  const n = Number(text);
  const kind = rule.integer ? 'a whole number' : 'a number';
  if (!Number.isFinite(n) || (rule.integer && !Number.isInteger(n))) {
    errors.push({ field: key, message: `${rule.label} must be ${kind}.` });
    return undefined;
  }
  if ((rule.min !== undefined && n < rule.min) || (rule.max !== undefined && n > rule.max)) {
    const range =
      rule.min !== undefined && rule.max !== undefined
        ? `from ${rule.min} to ${rule.max}`
        : rule.min !== undefined
          ? `at least ${rule.min}`
          : `at most ${rule.max}`;
    errors.push({ field: key, message: `${rule.label} must be ${range}.` });
    return undefined;
  }
  return n;
}

function listField(
  fields: FieldValues,
  key: string,
  errors: FieldError[],
  rule: { label: string; min: number; max: number; item: string },
): string[] {
  const lines = parseLines(one(fields, key));
  if (lines.length < rule.min) {
    errors.push({ field: key, message: `Add at least ${rule.min} ${rule.label}.` });
  } else if (lines.length > rule.max) {
    errors.push({ field: key, message: `Use at most ${rule.max} ${rule.label}.` });
  }
  if (lines.some((l) => l.length > FORM_LIMITS.maxOptionLabel)) {
    errors.push({
      field: key,
      message: `Each ${rule.item} can have at most ${FORM_LIMITS.maxOptionLabel} characters.`,
    });
  }
  const seen = new Set<string>();
  for (const line of lines) {
    const k = line.toLowerCase();
    if (seen.has(k)) {
      errors.push({
        field: key,
        message: `Two ${rule.label} are the same. Each ${rule.item} must be different.`,
      });
      break;
    }
    seen.add(k);
  }
  return lines;
}

// ---------------------------------------------------------------------------------------------
// Validation rule
// ---------------------------------------------------------------------------------------------

function validationRule(
  fields: FieldValues,
  errors: FieldError[],
  textOnly: 'short' | 'paragraph',
): Raw | undefined {
  const kind = one(fields, 'validation_kind');
  if (kind === '') return undefined;
  const allowed: readonly string[] = textOnly === 'short' ? VALIDATION_KINDS : ['length', 'regex'];
  if (!allowed.includes(kind)) {
    errors.push({ field: 'validation_kind', message: 'Choose one of the listed validation rules.' });
    return undefined;
  }
  const rule: Raw = { kind };
  if (kind === 'number') {
    const min = numberField(fields, 'v_min', errors, { label: 'The minimum' });
    const max = numberField(fields, 'v_max', errors, { label: 'The maximum' });
    if (min !== undefined) rule.min = min;
    if (max !== undefined) rule.max = max;
    if (min !== undefined && max !== undefined && min > max) {
      errors.push({ field: 'v_max', message: 'The maximum cannot be smaller than the minimum.' });
    }
    if (flag(fields, 'v_integer')) rule.integer = true;
  } else if (kind === 'length') {
    const limits = { min: 0, max: FORM_LIMITS.maxParagraph, integer: true } as const;
    const min = numberField(fields, 'v_min', errors, { label: 'The minimum length', ...limits });
    const max = numberField(fields, 'v_max', errors, { label: 'The maximum length', ...limits });
    if (min !== undefined) rule.min = min;
    if (max !== undefined) rule.max = max;
    if (min !== undefined && max !== undefined && min > max) {
      errors.push({ field: 'v_max', message: 'The maximum length cannot be smaller than the minimum.' });
    }
  } else if (kind === 'text_contains' || kind === 'text_not_contains') {
    const value = one(fields, 'v_value').trim();
    if (value === '' || value.length > 200) {
      errors.push({ field: 'v_value', message: 'Enter the text to look for (up to 200 characters).' });
    }
    rule.value = value;
  } else if (kind === 'regex') {
    const pattern = one(fields, 'v_pattern');
    if (pattern === '' || pattern.length > FORM_LIMITS.maxRegex || !isSafeRegexPattern(pattern)) {
      errors.push({
        field: 'v_pattern',
        message: `This pattern is not allowed. Use a preset where you can. ${REGEX_HINT}`,
      });
    }
    rule.pattern = pattern;
  }
  const message = one(fields, 'validation_message').trim();
  if (message.length > 200) {
    errors.push({ field: 'validation_message', message: 'The message can have at most 200 characters.' });
  } else if (message !== '') rule.message = message;
  return rule;
}

// ---------------------------------------------------------------------------------------------
// Show-if
// ---------------------------------------------------------------------------------------------

const OPS = ['eq', 'neq', 'in', 'answered'] as const;

function showIfFrom(
  fields: FieldValues,
  schema: FormSchema,
  ownId: string,
  errors: FieldError[],
): { join: 'all' | 'any'; rules: ShowIfRule[] } | undefined {
  const flat = flattenQuestions(schema);
  const ownIndex = flat.findIndex((f) => f.question.id === ownId);
  const rules: ShowIfRule[] = [];
  for (let i = 0; i < SHOW_IF_SLOTS; i += 1) {
    const sourceId = one(fields, `si_q_${i}`);
    if (sourceId === '') continue;
    const at = flat.findIndex((f) => f.question.id === sourceId);
    const source = at === -1 ? null : flat[at]!.question;
    if (!source || at >= ownIndex || source.type === 'statement') {
      errors.push({
        field: `si_q_${i}`,
        message: 'Choose a question that comes earlier in the form and collects an answer.',
      });
      continue;
    }
    const op = one(fields, `si_op_${i}`);
    if (!(OPS as readonly string[]).includes(op)) {
      errors.push({ field: `si_op_${i}`, message: 'Choose how the answer is compared.' });
      continue;
    }
    if (op === 'answered') {
      rules.push({ questionId: sourceId, op: 'answered' });
      continue;
    }
    const lines = parseLines(one(fields, `si_val_${i}`));
    if (lines.length === 0) {
      errors.push({ field: `si_val_${i}`, message: 'Enter the answer to compare with.' });
      continue;
    }
    const options =
      source.type === 'multiple_choice' || source.type === 'checkboxes' || source.type === 'dropdown'
        ? source.options
        : null;
    const otherAllowed = (source.type === 'multiple_choice' || source.type === 'checkboxes') && source.other;
    const values = op === 'in' ? lines : [lines[0]!];
    if (options && !otherAllowed && values.some((v) => !options.includes(v))) {
      errors.push({
        field: `si_val_${i}`,
        message: `Use the exact wording of the options of the question you chose (${options.join(', ')}).`,
      });
      continue;
    }
    if (values.some((v) => v.length > FORM_LIMITS.maxOptionLabel)) {
      errors.push({
        field: `si_val_${i}`,
        message: `Each answer can have at most ${FORM_LIMITS.maxOptionLabel} characters.`,
      });
      continue;
    }
    rules.push(
      op === 'in'
        ? { questionId: sourceId, op: 'in', value: values }
        : { questionId: sourceId, op: op as 'eq' | 'neq', value: values[0]! },
    );
  }
  if (rules.length === 0) return undefined;
  return { join: one(fields, 'si_join') === 'any' ? 'any' : 'all', rules };
}

// ---------------------------------------------------------------------------------------------
// Question from fields
// ---------------------------------------------------------------------------------------------

export function validateQuestionEdit(
  schema: FormSchema,
  questionId: string,
  fields: FieldValues,
): QuestionEdit {
  const found = findQuestion(schema, questionId);
  if (!found) throw new BuilderError('That question no longer exists. Reload the page.');
  const old = found.question;
  const errors: FieldError[] = [];

  const label = one(fields, 'label').trim();
  if (label === '') errors.push({ field: 'label', message: 'Enter the question text.' });
  else if (label.length > FORM_LIMITS.maxLabel) {
    errors.push({
      field: 'label',
      message: `The question text can have at most ${FORM_LIMITS.maxLabel} characters.`,
    });
  }
  const help = one(fields, 'help').trim();
  if (help.length > FORM_LIMITS.maxHelp) {
    errors.push({
      field: 'help',
      message: `The help text can have at most ${FORM_LIMITS.maxHelp} characters.`,
    });
  }

  const raw: Raw = {
    id: old.id,
    type: old.type,
    label,
    required: old.type === 'statement' ? false : flag(fields, 'required'),
  };
  if (help !== '') raw.help = help;

  const bind = one(fields, 'bind');
  if (bind !== '') {
    if (!(BIND_KEYS as readonly string[]).includes(bind)) {
      errors.push({ field: 'bind', message: 'Choose one of the listed system fields.' });
    } else if (!BINDABLE_TYPES.includes(old.type)) {
      errors.push({ field: 'bind', message: 'This type of question cannot fill a system field.' });
    } else raw.bind = bind;
  }

  const showIf = showIfFrom(fields, schema, old.id, errors);
  if (showIf) raw.showIf = showIf;

  switch (old.type) {
    case 'short_text':
    case 'paragraph': {
      const cap = old.type === 'short_text' ? FORM_LIMITS.maxShortText : FORM_LIMITS.maxParagraph;
      const maxLength = numberField(fields, 'max_length', errors, {
        label: 'The maximum length',
        min: 1,
        max: cap,
        integer: true,
      });
      if (maxLength !== undefined) raw.maxLength = maxLength;
      const rule = validationRule(fields, errors, old.type === 'short_text' ? 'short' : 'paragraph');
      if (rule) raw.validation = rule;
      break;
    }
    case 'multiple_choice':
    case 'checkboxes':
    case 'dropdown': {
      raw.options = listField(fields, 'options', errors, {
        label: 'options',
        min: 1,
        max: FORM_LIMITS.maxOptions,
        item: 'option',
      });
      raw.shuffle = flag(fields, 'shuffle');
      if (old.type !== 'dropdown') {
        raw.other = flag(fields, 'other');
        const otherLabel = one(fields, 'other_label').trim();
        if (otherLabel.length > FORM_LIMITS.maxOptionLabel) {
          errors.push({
            field: 'other_label',
            message: `The label can have at most ${FORM_LIMITS.maxOptionLabel} characters.`,
          });
        } else if (otherLabel !== '') raw.otherLabel = otherLabel;
      }
      if (old.type === 'checkboxes') {
        const kind = one(fields, 'limit_kind');
        if (kind !== '') {
          if (!['at_least', 'at_most', 'exactly'].includes(kind)) {
            errors.push({ field: 'limit_kind', message: 'Choose a limit type.' });
          } else {
            const n = numberField(fields, 'limit_n', errors, {
              label: 'The number of choices',
              min: 1,
              max: FORM_LIMITS.maxOptions + 1,
              integer: true,
            });
            if (n === undefined && !errors.some((e) => e.field === 'limit_n')) {
              errors.push({ field: 'limit_n', message: 'Enter how many choices the limit applies to.' });
            }
            if (n !== undefined) raw.limit = { kind, n };
          }
        }
      }
      break;
    }
    case 'linear_scale':
    case 'rating': {
      const max = numberField(fields, 'scale_max', errors, {
        label: 'The highest value',
        min: old.type === 'rating' ? 3 : 2,
        max: 10,
        integer: true,
      });
      if (max === undefined && !errors.some((e) => e.field === 'scale_max')) {
        errors.push({ field: 'scale_max', message: 'Enter the highest value.' });
      }
      if (max !== undefined) raw.max = max;
      if (old.type === 'linear_scale') {
        raw.min = one(fields, 'scale_min') === '0' ? 0 : 1;
        for (const [field, key] of [
          ['min_label', 'minLabel'],
          ['max_label', 'maxLabel'],
        ] as const) {
          const text = one(fields, field).trim();
          if (text.length > 100)
            errors.push({ field, message: 'The label can have at most 100 characters.' });
          else if (text !== '') raw[key] = text;
        }
      }
      break;
    }
    case 'choice_grid':
    case 'checkbox_grid':
      raw.rows = listField(fields, 'rows', errors, {
        label: 'rows',
        min: 1,
        max: FORM_LIMITS.maxGridAxis,
        item: 'row',
      });
      raw.columns = listField(fields, 'columns', errors, {
        label: 'columns',
        min: 1,
        max: FORM_LIMITS.maxGridAxis,
        item: 'column',
      });
      raw.requireEachRow = flag(fields, 'require_each_row');
      raw.onePerColumn = flag(fields, 'one_per_column');
      break;
    case 'date':
      raw.includeYear = flag(fields, 'include_year');
      raw.includeTime = flag(fields, 'include_time');
      break;
    case 'time':
      raw.mode = one(fields, 'time_mode') === 'duration' ? 'duration' : 'clock';
      break;
    case 'link': {
      const providers = many(fields, 'providers');
      if (providers.some((p) => !(LINK_PROVIDER_NAMES as readonly string[]).includes(p))) {
        errors.push({ field: 'providers', message: 'Choose from the listed link providers.' });
      } else if (providers.length > 0) raw.providers = providers;
      break;
    }
    case 'file_upload': {
      const accept = many(fields, 'accept');
      if (accept.length === 0 || accept.some((a) => !(FILE_GROUPS as readonly string[]).includes(a))) {
        errors.push({ field: 'accept', message: 'Choose at least one type of file to accept.' });
      }
      raw.accept = accept;
      const files = numberField(fields, 'max_files', errors, {
        label: 'The number of files',
        min: 1,
        max: FORM_LIMITS.maxFiles,
        integer: true,
      });
      const mb = numberField(fields, 'max_mb', errors, {
        label: 'The size limit',
        min: 1,
        max: FORM_LIMITS.maxUploadMb,
      });
      if (files !== undefined) raw.maxFiles = files;
      if (mb !== undefined) raw.maxMb = mb;
      break;
    }
    case 'statement': {
      const body = one(fields, 'body').trim();
      if (body.length > FORM_LIMITS.maxHelp) {
        errors.push({
          field: 'body',
          message: `The text can have at most ${FORM_LIMITS.maxHelp} characters.`,
        });
      } else if (body !== '') raw.body = body;
      break;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  let question: Question;
  try {
    question = normalizeQuestion(raw);
  } catch (error) {
    if (error instanceof BuilderError)
      return { ok: false, errors: [{ field: 'label', message: error.message }] };
    throw error;
  }
  return {
    ok: true,
    question,
    schema: {
      sections: schema.sections.map((s) => ({
        ...s,
        questions: s.questions.map((q) => (q.id === questionId ? question : q)),
      })),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Question to fields
// ---------------------------------------------------------------------------------------------

const onOff = (value: boolean | undefined): string[] => (value ? ['on'] : []);

/** The editor's field values for `question` (strings and string lists, never undefined). */
export function toFormValues(question: Question): FieldValues {
  const q = question as Question & Record<string, unknown>;
  const v: FieldValues = {
    label: q.label,
    help: q.help ?? '',
    required: onOff(q.required),
    bind: q.bind ?? '',
  };
  const show = q.showIf;
  v.si_join = show?.join ?? 'all';
  show?.rules.forEach((rule, i) => {
    v[`si_q_${i}`] = rule.questionId;
    v[`si_op_${i}`] = rule.op;
    v[`si_val_${i}`] =
      rule.value === undefined ? '' : Array.isArray(rule.value) ? rule.value.join('\n') : rule.value;
  });
  const rule = (q as { validation?: Record<string, unknown> }).validation;
  switch (q.type) {
    case 'short_text':
    case 'paragraph':
      v.max_length = q.maxLength === undefined ? '' : String(q.maxLength);
      v.validation_kind = rule ? String(rule.kind) : '';
      v.validation_message = typeof rule?.message === 'string' ? rule.message : '';
      v.v_min = rule?.min === undefined ? '' : String(rule.min);
      v.v_max = rule?.max === undefined ? '' : String(rule.max);
      v.v_integer = onOff(rule?.integer === true);
      v.v_value = typeof rule?.value === 'string' ? rule.value : '';
      v.v_pattern = typeof rule?.pattern === 'string' ? rule.pattern : '';
      break;
    case 'multiple_choice':
    case 'checkboxes':
    case 'dropdown':
      v.options = q.options.join('\n');
      v.shuffle = onOff(q.shuffle);
      if (q.type !== 'dropdown') {
        v.other = onOff(q.other);
        v.other_label = q.otherLabel ?? '';
      }
      if (q.type === 'checkboxes') {
        v.limit_kind = q.limit?.kind ?? '';
        v.limit_n = q.limit ? String(q.limit.n) : '';
      }
      break;
    case 'linear_scale':
      v.scale_min = String(q.min);
      v.scale_max = String(q.max);
      v.min_label = q.minLabel ?? '';
      v.max_label = q.maxLabel ?? '';
      break;
    case 'rating':
      v.scale_max = String(q.max);
      break;
    case 'choice_grid':
    case 'checkbox_grid':
      v.rows = q.rows.join('\n');
      v.columns = q.columns.join('\n');
      v.require_each_row = onOff(q.requireEachRow);
      v.one_per_column = onOff(q.onePerColumn);
      break;
    case 'date':
      v.include_year = onOff(q.includeYear);
      v.include_time = onOff(q.includeTime);
      break;
    case 'time':
      v.time_mode = q.mode;
      break;
    case 'link':
      v.providers = q.providers ?? [];
      break;
    case 'file_upload':
      v.accept = q.accept;
      v.max_files = String(q.maxFiles);
      v.max_mb = String(q.maxMb);
      break;
    case 'statement':
      v.body = q.body ?? '';
      break;
  }
  return v;
}
