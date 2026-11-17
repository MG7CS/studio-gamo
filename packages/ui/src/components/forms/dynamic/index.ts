/**
 * Types shared by the dynamic form components (`DynamicForm`, `SectionBlock`, `QuestionField`, …). The
 * schema types are the minimal structural shapes of `lib/dynamic-form.ts`; the domain `FormSchema` is
 * assignable to `DynFormSchema` (checked by `scripts/audit/dynamic-form.test.ts`).
 */
import type { DynRawValues, DynUploadSummary } from '../../../lib/dynamic-form';

export type {
  ConditionValue,
  DynAnswerError,
  DynFormSchema,
  DynQuestion,
  DynQuestionOf,
  DynQuestionType,
  DynRawValues,
  DynSection,
  DynShowIf,
  DynShowIfRule,
  DynUploadSummary,
} from '../../../lib/dynamic-form';

/** What every question component needs to render one question's current state. */
export interface DynamicFormContext {
  /** Prefix of every DOM id (`buildFieldId(idPrefix, questionId)`). */
  idPrefix: string;
  /** Slug of the form (used by the upload endpoints and the Turnstile action). */
  formSlug: string;
  /** Raw posted values to re-render (`questionId`, `${id}.other`, `${id}.${rowIndex}`). */
  values: DynRawValues;
  /** First server error message per question id. */
  errors: Record<string, string>;
  /** Finished uploads per file question id (re-rendered as hidden inputs after a failed submit). */
  uploads: Record<string, DynUploadSummary[]>;
}

/** A link question that can stand in for a video upload. */
export interface DynLinkAlternative {
  /** DOM id of the link question's input. */
  fieldId: string;
  label: string;
}
