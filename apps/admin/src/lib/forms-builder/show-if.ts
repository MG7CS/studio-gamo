/** Plain-language summaries of show-if rules ("Shown only if "Main role" is "Keys"."). Plain text only. */
import type { FormSchema, ShowIf, ShowIfRule } from '@gamo/domain/forms';
import { findQuestion } from './schema-edit';

const SHORT = 60;

function shorten(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > SHORT ? `${clean.slice(0, SHORT).trimEnd()}…` : clean;
}

function source(schema: FormSchema, id: string): string {
  const found = findQuestion(schema, id);
  return found ? `"${shorten(found.question.label)}"` : 'a question that no longer exists';
}

function quoted(value: string): string {
  return `"${shorten(value)}"`;
}

function ruleText(schema: FormSchema, rule: ShowIfRule): string {
  const who = source(schema, rule.questionId);
  const values = rule.value === undefined ? [] : Array.isArray(rule.value) ? rule.value : [rule.value];
  switch (rule.op) {
    case 'eq':
      return `${who} is ${quoted(values[0] ?? '')}`;
    case 'neq':
      return `${who} is not ${quoted(values[0] ?? '')}`;
    case 'in':
      return `${who} is one of ${values.map(quoted).join(', ')}`;
    case 'answered':
      return `${who} is answered`;
  }
}

export function describeShowIf(showIf: ShowIf, schema: FormSchema): string {
  const parts = showIf.rules.map((rule) => ruleText(schema, rule));
  if (parts.length === 1) return `Shown only if ${parts[0]}.`;
  if (showIf.join === 'any') return `Shown if any of these apply: ${parts.join('; ')}.`;
  return `Shown only if ${parts.join(' and ')}.`;
}
