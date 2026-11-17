/**
 * Pure editing helpers for a form draft (`FormSchema`). Every function returns a new schema and never
 * mutates its input; the server's `parseFormSchema` stays the authority (`saveDraft` re-parses), so these
 * helpers only have to keep the draft consistent for staff: unique ids, show-if rules that point upwards,
 * no question deleted while others depend on it.
 */
import {
  FORM_LIMITS,
  FormSchemaError,
  parseFormSchema,
  type BindKey,
  type FormSchema,
  type Question,
  type QuestionType,
  type Section,
  type ShowIf,
} from '@gamo/domain/forms';

/** A refusal whose message is plain language for the staff member (never contains input echoes). */
export class BuilderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BuilderError';
  }
}

export interface FlatQuestion {
  question: Question;
  /** 1-based reading position across the whole form. */
  position: number;
  sectionId: string;
  sectionIndex: number;
  indexInSection: number;
}

export interface Dependent {
  kind: 'question' | 'section';
  id: string;
  label: string;
}

export function flattenQuestions(schema: FormSchema): FlatQuestion[] {
  const out: FlatQuestion[] = [];
  schema.sections.forEach((section, sectionIndex) => {
    section.questions.forEach((question, indexInSection) => {
      out.push({ question, position: out.length + 1, sectionId: section.id, sectionIndex, indexInSection });
    });
  });
  return out;
}

export function findQuestion(schema: FormSchema, id: string): FlatQuestion | null {
  return flattenQuestions(schema).find((f) => f.question.id === id) ?? null;
}

export function questionCount(schema: FormSchema): number {
  return schema.sections.reduce((n, s) => n + s.questions.length, 0);
}

/** Types that can carry a system bind key (mirrors the publish check). */
export const BINDABLE_TYPES: readonly QuestionType[] = [
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
];

const CHOICE_TYPES: readonly QuestionType[] = ['multiple_choice', 'checkboxes', 'dropdown'];
const GRID_TYPES: readonly QuestionType[] = ['choice_grid', 'checkbox_grid'];

// ---------------------------------------------------------------------------------------------
// Ids and normalising
// ---------------------------------------------------------------------------------------------

function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

function takenIds(schema: FormSchema): Set<string> {
  const taken = new Set<string>();
  for (const s of schema.sections) {
    taken.add(s.id);
    for (const q of s.questions) taken.add(q.id);
  }
  return taken;
}

function uniqueId(schema: FormSchema, prefix: string, gen?: () => string): string {
  const taken = takenIds(schema);
  for (let i = 0; i < 20; i += 1) {
    const id = gen ? gen() : randomId(prefix);
    if (!taken.has(id)) return id;
  }
  throw new BuilderError('A new id could not be chosen. Try again.');
}

/** Runs one raw question through the server's parser (defaults, limits) and returns the typed result. */
export function normalizeQuestion(raw: Record<string, unknown>): Question {
  try {
    const parsed = parseFormSchema({ sections: [{ id: 'check', title: 'Check', questions: [raw] }] });
    return parsed.sections[0]!.questions[0]!;
  } catch (error) {
    if (error instanceof FormSchemaError) throw new BuilderError(error.message);
    throw error;
  }
}

const DEFAULT_LABELS: Record<QuestionType, string> = {
  short_text: 'Untitled question',
  paragraph: 'Untitled question',
  multiple_choice: 'Untitled question',
  checkboxes: 'Untitled question',
  dropdown: 'Untitled question',
  file_upload: 'Upload a file',
  linear_scale: 'Untitled question',
  rating: 'Untitled question',
  choice_grid: 'Untitled question',
  checkbox_grid: 'Untitled question',
  date: 'Date',
  time: 'Time',
  link: 'Link',
  statement: 'Note for the reader',
};

/** A valid question of `type` with a placeholder label, ready for staff to edit. */
export function defaultQuestion(type: QuestionType, id: string): Question {
  const raw: Record<string, unknown> = { id, type, label: DEFAULT_LABELS[type], required: false };
  if (CHOICE_TYPES.includes(type)) raw.options = ['Option 1', 'Option 2'];
  if (GRID_TYPES.includes(type)) {
    raw.rows = ['Row 1'];
    raw.columns = ['Column 1', 'Column 2'];
  }
  if (type === 'file_upload') {
    raw.accept = ['image'];
    raw.maxFiles = 1;
    raw.maxMb = 10;
  }
  if (type === 'linear_scale') {
    raw.min = 1;
    raw.max = 5;
  }
  if (type === 'rating') raw.max = 5;
  return normalizeQuestion(raw);
}

// ---------------------------------------------------------------------------------------------
// Order rules
// ---------------------------------------------------------------------------------------------

export interface OrderingProblem {
  dependent: Dependent;
  sourceId: string;
}

/** Show-if rules that point at an unknown question or at one that does not come strictly before the owner. */
export function orderingProblems(schema: FormSchema): OrderingProblem[] {
  const flat = flattenQuestions(schema);
  const index = new Map(flat.map((f, i) => [f.question.id, i]));
  const out: OrderingProblem[] = [];
  let before = 0;
  for (const section of schema.sections) {
    for (const rule of section.showIf?.rules ?? []) {
      const at = index.get(rule.questionId);
      if (at === undefined || at >= before) {
        out.push({
          dependent: { kind: 'section', id: section.id, label: section.title },
          sourceId: rule.questionId,
        });
      }
    }
    before += section.questions.length;
  }
  flat.forEach((f, own) => {
    for (const rule of f.question.showIf?.rules ?? []) {
      const at = index.get(rule.questionId);
      if (at === undefined || at >= own) {
        out.push({
          dependent: { kind: 'question', id: f.question.id, label: f.question.label },
          sourceId: rule.questionId,
        });
      }
    }
  });
  return out;
}

const problemKey = (p: OrderingProblem) => `${p.dependent.kind}:${p.dependent.id}>${p.sourceId}`;

function labelOfId(schema: FormSchema, id: string): string {
  return findQuestion(schema, id)?.question.label ?? id;
}

/** Other questions and sections whose show-if rules use `id`. */
export function dependentsOf(schema: FormSchema, id: string): Dependent[] {
  const out: Dependent[] = [];
  for (const section of schema.sections) {
    if (section.showIf?.rules.some((r) => r.questionId === id)) {
      out.push({ kind: 'section', id: section.id, label: section.title });
    }
    for (const q of section.questions) {
      if (q.id !== id && q.showIf?.rules.some((r) => r.questionId === id)) {
        out.push({ kind: 'question', id: q.id, label: q.label });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Adding, duplicating, deleting
// ---------------------------------------------------------------------------------------------

function mapSection(schema: FormSchema, sectionId: string, fn: (s: Section) => Section): FormSchema {
  return { sections: schema.sections.map((s) => (s.id === sectionId ? fn(s) : s)) };
}

function requireSection(schema: FormSchema, sectionId: string): Section {
  const section = schema.sections.find((s) => s.id === sectionId);
  if (!section) throw new BuilderError('That section no longer exists. Reload the page.');
  return section;
}

function assertRoomForQuestion(schema: FormSchema): void {
  if (questionCount(schema) >= FORM_LIMITS.maxQuestions) {
    throw new BuilderError(`A form can have at most ${FORM_LIMITS.maxQuestions} questions.`);
  }
}

export function addQuestion(
  schema: FormSchema,
  sectionId: string,
  type: QuestionType,
  options: { newId?: () => string; afterQuestionId?: string } = {},
): { schema: FormSchema; question: Question } {
  const section = requireSection(schema, sectionId);
  assertRoomForQuestion(schema);
  const question = defaultQuestion(type, uniqueId(schema, 'q', options.newId));
  const after = options.afterQuestionId
    ? section.questions.findIndex((q) => q.id === options.afterQuestionId)
    : -1;
  const at = after >= 0 ? after + 1 : section.questions.length;
  return {
    schema: mapSection(schema, sectionId, (s) => ({
      ...s,
      questions: [...s.questions.slice(0, at), question, ...s.questions.slice(at)],
    })),
    question,
  };
}

export function duplicateQuestion(
  schema: FormSchema,
  questionId: string,
  newId?: () => string,
): { schema: FormSchema; question: Question } {
  const found = findQuestion(schema, questionId);
  if (!found) throw new BuilderError('That question no longer exists. Reload the page.');
  assertRoomForQuestion(schema);
  const suffix = ' (copy)';
  const label =
    found.question.label.length + suffix.length > FORM_LIMITS.maxLabel
      ? found.question.label.slice(0, FORM_LIMITS.maxLabel - suffix.length).trimEnd() + suffix
      : found.question.label + suffix;
  const copy = structuredClone(found.question) as Record<string, unknown>;
  copy.id = uniqueId(schema, 'q', newId);
  copy.label = label;
  delete copy.bind; // one system field per question: a copy never competes for it
  const question = normalizeQuestion(copy);
  return {
    schema: mapSection(schema, found.sectionId, (s) => ({
      ...s,
      questions: [
        ...s.questions.slice(0, found.indexInSection + 1),
        question,
        ...s.questions.slice(found.indexInSection + 1),
      ],
    })),
    question,
  };
}

export type DeleteResult = { ok: true; schema: FormSchema } | { ok: false; dependents: Dependent[] };

export function deleteQuestion(schema: FormSchema, questionId: string): DeleteResult {
  const found = findQuestion(schema, questionId);
  if (!found) throw new BuilderError('That question no longer exists. Reload the page.');
  const dependents = dependentsOf(schema, questionId);
  if (dependents.length > 0) return { ok: false, dependents };
  return {
    ok: true,
    schema: mapSection(schema, found.sectionId, (s) => ({
      ...s,
      questions: s.questions.filter((q) => q.id !== questionId),
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Moving
// ---------------------------------------------------------------------------------------------

export interface MoveResult {
  schema: FormSchema;
  moved: boolean;
  /** 1-based position after the move (the current one when nothing moved). */
  position: number;
  /** Plain-language reason when the move was refused. */
  blocked?: string;
}

function rebuild(schema: FormSchema, items: { q: Question; sectionId: string }[]): FormSchema {
  return {
    sections: schema.sections.map((s) => ({
      ...s,
      questions: items.filter((i) => i.sectionId === s.id).map((i) => i.q),
    })),
  };
}

export function moveQuestionToPosition(schema: FormSchema, questionId: string, position: number): MoveResult {
  const flat = flattenQuestions(schema);
  const current = flat.find((f) => f.question.id === questionId);
  if (!current) throw new BuilderError('That question no longer exists. Reload the page.');
  if (!Number.isInteger(position) || position < 1 || position > flat.length) {
    throw new BuilderError(`Choose a position from 1 to ${flat.length}.`);
  }
  const from = current.position - 1;
  const to = position - 1;
  if (from === to) return { schema, moved: false, position: current.position };

  const items = flat.map((f) => ({ q: f.question, sectionId: f.sectionId }));
  const [item] = items.splice(from, 1);
  // Moving up lands just before the question now at the target; moving down lands just after the one
  // before it. Either way the question joins the section of its new neighbour.
  const neighbour = to < from ? items[to]! : items[to - 1]!;
  items.splice(to, 0, { q: item!.q, sectionId: neighbour.sectionId });
  const next = rebuild(schema, items);

  const known = new Set(orderingProblems(schema).map(problemKey));
  const fresh = orderingProblems(next).find((p) => !known.has(problemKey(p)));
  if (fresh) {
    const who =
      fresh.dependent.kind === 'section'
        ? `Section "${fresh.dependent.label}"`
        : `"${fresh.dependent.label}"`;
    const source = labelOfId(next, fresh.sourceId);
    return {
      schema,
      moved: false,
      position: current.position,
      blocked: `Not moved: ${who} is shown only if "${source}" is answered, so "${source}" has to stay above it. Change that rule first.`,
    };
  }
  return { schema: next, moved: true, position };
}

export function moveQuestion(schema: FormSchema, questionId: string, direction: 'up' | 'down'): MoveResult {
  const current = findQuestion(schema, questionId);
  if (!current) throw new BuilderError('That question no longer exists. Reload the page.');
  const total = questionCount(schema);
  const target = direction === 'up' ? current.position - 1 : current.position + 1;
  if (target < 1 || target > total) return { schema, moved: false, position: current.position };
  return moveQuestionToPosition(schema, questionId, target);
}

// ---------------------------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------------------------

export function addSection(
  schema: FormSchema,
  title: string,
  newId?: () => string,
): { schema: FormSchema; section: Section } {
  const clean = title.trim();
  if (clean.length < 1 || clean.length > FORM_LIMITS.maxLabel) {
    throw new BuilderError(`A section title needs 1 to ${FORM_LIMITS.maxLabel} characters.`);
  }
  if (schema.sections.length >= FORM_LIMITS.maxSections) {
    throw new BuilderError(`A form can have at most ${FORM_LIMITS.maxSections} sections.`);
  }
  const section: Section = { id: uniqueId(schema, 's', newId), title: clean, questions: [] };
  return { schema: { sections: [...schema.sections, section] }, section };
}

export function updateSection(
  schema: FormSchema,
  sectionId: string,
  fields: { title?: string; description?: string },
): FormSchema {
  requireSection(schema, sectionId);
  return mapSection(schema, sectionId, (s) => {
    const next: Section = { ...s };
    if (fields.title !== undefined) {
      const title = fields.title.trim();
      if (title.length < 1 || title.length > FORM_LIMITS.maxLabel) {
        throw new BuilderError(`A section title needs 1 to ${FORM_LIMITS.maxLabel} characters.`);
      }
      next.title = title;
    }
    if (fields.description !== undefined) {
      const description = fields.description.trim();
      if (description.length > FORM_LIMITS.maxHelp) {
        throw new BuilderError(`A section description can have at most ${FORM_LIMITS.maxHelp} characters.`);
      }
      if (description === '') delete next.description;
      else next.description = description;
    }
    return next;
  });
}

export function removeSection(schema: FormSchema, sectionId: string): FormSchema {
  const section = requireSection(schema, sectionId);
  if (section.questions.length > 0) {
    throw new BuilderError('Move or delete the questions in this section first.');
  }
  if (schema.sections.length <= 1) throw new BuilderError('A form needs at least one section.');
  return { sections: schema.sections.filter((s) => s.id !== sectionId) };
}

// ---------------------------------------------------------------------------------------------
// Changing a question's type
// ---------------------------------------------------------------------------------------------

export interface TypeChange {
  schema: FormSchema;
  changed: boolean;
  /** What the new type cannot hold (plain language, shown before and after the change). */
  lost: string[];
  /** Questions and sections that are shown depending on this question (check their rules). */
  dependents: Dependent[];
}

type Loose = Record<string, unknown>;

export function changeQuestionType(schema: FormSchema, questionId: string, type: QuestionType): TypeChange {
  const found = findQuestion(schema, questionId);
  if (!found) throw new BuilderError('That question no longer exists. Reload the page.');
  const old = found.question as Question & Loose;
  const dependents = dependentsOf(schema, questionId);
  if (old.type === type) return { schema, changed: false, lost: [], dependents };

  const lost: string[] = [];
  const next: Loose = {
    id: old.id,
    type,
    label: old.label,
    required: type === 'statement' ? false : old.required,
  };
  if (old.help !== undefined) next.help = old.help;
  if (old.showIf !== undefined) next.showIf = old.showIf;
  if (old.bind !== undefined) {
    if (BINDABLE_TYPES.includes(type)) next.bind = old.bind;
    else
      lost.push(
        `The system field this question fills (${old.bind}); a ${type.replace(/_/g, ' ')} cannot fill it`,
      );
  }

  const oldChoice = CHOICE_TYPES.includes(old.type);
  const newChoice = CHOICE_TYPES.includes(type);
  const oldGrid = GRID_TYPES.includes(old.type);
  const newGrid = GRID_TYPES.includes(type);

  if (newChoice) {
    next.options = oldChoice ? (old as Loose).options : ['Option 1', 'Option 2'];
    if (oldChoice && (old as Loose).shuffle !== undefined) next.shuffle = (old as Loose).shuffle;
    if (
      (type === 'multiple_choice' || type === 'checkboxes') &&
      (old.type === 'multiple_choice' || old.type === 'checkboxes')
    ) {
      next.other = (old as Loose).other;
      if ((old as Loose).otherLabel !== undefined) next.otherLabel = (old as Loose).otherLabel;
    } else if ((old as Loose).other === true) {
      lost.push('The "Other" choice');
    }
    if (old.type === 'checkboxes' && type !== 'checkboxes' && (old as Loose).limit !== undefined) {
      lost.push('The limit on how many choices can be ticked');
    }
  } else if (oldChoice) {
    const n = ((old as Loose).options as string[]).length;
    lost.push(`The ${n} answer option${n === 1 ? '' : 's'}`);
  }

  if (newGrid) {
    next.rows = oldGrid ? (old as Loose).rows : ['Row 1'];
    next.columns = oldGrid ? (old as Loose).columns : ['Column 1', 'Column 2'];
    if (oldGrid) {
      next.requireEachRow = (old as Loose).requireEachRow;
      next.onePerColumn = (old as Loose).onePerColumn;
    }
  } else if (oldGrid) {
    lost.push('The grid rows and columns');
  }

  const oldText = old.type === 'short_text' || old.type === 'paragraph';
  if (type === 'short_text' || type === 'paragraph') {
    if (oldText) {
      const max = (old as Loose).maxLength as number | undefined;
      const cap = type === 'short_text' ? FORM_LIMITS.maxShortText : FORM_LIMITS.maxParagraph;
      if (max !== undefined) next.maxLength = Math.min(max, cap);
      const rule = (old as Loose).validation as { kind: string } | undefined;
      if (rule) {
        if (type === 'paragraph' && rule.kind !== 'length' && rule.kind !== 'regex') {
          lost.push(`The validation rule (${rule.kind.replace(/_/g, ' ')}) that only short answers can use`);
        } else next.validation = rule;
      }
    }
  } else if (oldText) {
    if ((old as Loose).validation) lost.push('The validation rule');
    if ((old as Loose).maxLength !== undefined) lost.push('The maximum length');
  }

  if (type === 'linear_scale' || type === 'rating') {
    if (old.type === 'linear_scale' || old.type === 'rating') {
      const max = (old as Loose).max as number;
      next.max = type === 'rating' ? Math.max(3, max) : max;
      if (type === 'linear_scale') {
        if (old.type === 'linear_scale') {
          next.min = (old as Loose).min;
          if ((old as Loose).minLabel !== undefined) next.minLabel = (old as Loose).minLabel;
          if ((old as Loose).maxLabel !== undefined) next.maxLabel = (old as Loose).maxLabel;
        }
      } else if (old.type === 'linear_scale' && ((old as Loose).minLabel || (old as Loose).maxLabel)) {
        lost.push('The labels at each end of the scale');
      }
    } else {
      next.max = 5;
    }
  } else if (old.type === 'linear_scale' || old.type === 'rating') {
    lost.push('The scale settings');
  }

  if (type === 'file_upload') {
    next.accept = ['image'];
    next.maxFiles = 1;
    next.maxMb = 10;
  } else if (old.type === 'file_upload') {
    lost.push('The accepted file types and size limits');
  }
  if (type === 'link' && old.type === 'link') next.providers = (old as Loose).providers;
  if (old.type === 'link' && type !== 'link' && (old as Loose).providers !== undefined) {
    lost.push('The list of accepted link providers');
  }
  if (old.type === 'statement' && type !== 'statement' && (old as Loose).body) {
    lost.push('The statement text');
  }
  if (old.type === 'date' && type !== 'date') lost.push('The date options (year, time)');
  if (old.type === 'time' && type !== 'time') lost.push('The time mode');
  if (type === 'date') next.includeYear = true;
  if (type === 'time') next.mode = 'clock';

  const question = normalizeQuestion(next);
  const out = mapSection(schema, found.sectionId, (s) => ({
    ...s,
    questions: s.questions.map((q) => (q.id === questionId ? question : q)),
  }));
  return { schema: out, changed: true, lost, dependents };
}

export type { BindKey, ShowIf };
