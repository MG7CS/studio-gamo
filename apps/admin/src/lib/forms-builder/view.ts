/** Small view helpers for the builder screens: labels, status chips, UTC time. */
import type { FormSummary, QuestionType } from '@gamo/domain/forms';

export const TYPE_LABELS: Record<QuestionType, string> = {
  short_text: 'Short answer',
  paragraph: 'Paragraph',
  multiple_choice: 'Multiple choice',
  checkboxes: 'Checkboxes',
  dropdown: 'Dropdown',
  file_upload: 'File upload',
  linear_scale: 'Linear scale',
  rating: 'Rating',
  choice_grid: 'Choice grid',
  checkbox_grid: 'Checkbox grid',
  date: 'Date',
  time: 'Time',
  link: 'Link',
  statement: 'Text block (no answer)',
};

/** The "+ Add question" groups, in the order the design lists them. */
export const TYPE_GROUPS: readonly { label: string; types: readonly QuestionType[] }[] = [
  { label: 'Text', types: ['short_text', 'paragraph'] },
  { label: 'Choice', types: ['multiple_choice', 'checkboxes', 'dropdown'] },
  { label: 'Scale', types: ['linear_scale', 'rating'] },
  { label: 'Grid', types: ['choice_grid', 'checkbox_grid'] },
  { label: 'Date and time', types: ['date', 'time'] },
  { label: 'Files and links', types: ['file_upload', 'link'] },
  { label: 'Content', types: ['statement'] },
];

export const PROGRAM_LABELS: Record<string, string> = {
  web: 'Gamo Studios',
  worship: 'Gamo Worship',
  academy: 'Gamo Academy',
  production: 'Gamo Production',
};

export const KIND_LABELS: Record<string, string> = {
  musician_application: 'Musician application',
  technician_application: 'Technician application',
  instructor_application: 'Instructor application',
  church_request: 'Church request',
  production_request: 'Production request',
  contact: 'Contact',
  partner_interest: 'Partner interest',
};

export type StatusChip = { label: string; tone: 'neutral' | 'ok' | 'warn' };

/** Never colour alone: the chip always carries its words. */
export function statusChip(
  form: Pick<FormSummary, 'status' | 'publishedVersion' | 'hasUnpublishedChanges'>,
): StatusChip {
  if (form.status === 'closed') return { label: 'Closed', tone: 'neutral' };
  if (form.publishedVersion === null) return { label: 'Draft only', tone: 'neutral' };
  if (form.hasUnpublishedChanges)
    return { label: `Published v${form.publishedVersion}, draft changes pending`, tone: 'warn' };
  return { label: `Published v${form.publishedVersion}`, tone: 'ok' };
}

const UTC = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "15 Nov 2026, 14:05 UTC": staff times are always shown in UTC and say so. */
export function formatUtc(epochSeconds: number): string {
  return `${UTC.format(new Date(epochSeconds * 1000))} UTC`;
}

// ---------------------------------------------------------------------------------------------
// Publish checklist messages
// ---------------------------------------------------------------------------------------------

import type { FormSchema } from '@gamo/domain/forms';
import { findQuestion } from './schema-edit';

export interface CheckLine {
  /** The message with question ids replaced by "question N, "label"" where the id is known. */
  text: string;
  /** Where the offending question or section is edited (null when the message is about the form as a whole). */
  href: string | null;
}

/** Turns one `checkPublishable` message into text plus a link to the question it is about. */
export function checkLine(formId: string, schema: FormSchema, message: string): CheckLine {
  let href: string | null = null;
  const text = message.replace(/\bQuestion "([^"]+)"/g, (whole, id: string) => {
    const found = findQuestion(schema, id);
    if (!found) return whole;
    href ??= `/forms/${formId}/edit?q=${encodeURIComponent(id)}#editor`;
    return `Question ${found.position} (“${found.question.label}”)`;
  });
  if (href === null) {
    const section = /\bSection "([^"]+)"/.exec(message);
    if (section && schema.sections.some((s) => s.id === section[1])) {
      href = `/forms/${formId}/edit#section-${encodeURIComponent(section[1]!)}`;
    }
  }
  return { text, href };
}
