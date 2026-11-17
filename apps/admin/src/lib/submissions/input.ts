/** Reading and bounding what a submissions form post sends. Nothing here reflects input back to the staff member. */
import { FormsError } from '@gamo/domain/forms';
import { BULK_MAX, ID_PATTERN } from './statuses.ts';

type Body = Record<string, string | string[]>;

export function text(body: Body, name: string, max: number): string {
  const v = body[name];
  const s = typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? '') : '';
  return s.trim().slice(0, max);
}

export function ids(body: Body, name = 'ids'): string[] {
  const v = body[name];
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (ID_PATTERN.test(item)) seen.add(item);
  }
  if (seen.size > BULK_MAX) throw new FormsError('INVALID_INPUT', 'Too many submissions were selected.');
  return [...seen];
}

export function submissionIdParam(params: Record<string, string | undefined>): string {
  const id = params.id ?? '';
  if (!ID_PATTERN.test(id)) throw new FormsError('NOT_FOUND', 'This submission does not exist.');
  return id;
}

/** Same-site paths a form may send staff back to: the inbox or one submission, with a plain query. */
const RETURN = /^\/submissions(?:\/[A-Za-z0-9_-]{1,80})?(?:\?[A-Za-z0-9_=&%.:+~-]{0,600})?$/;

export function returnTo(body: Body, fallback: string): string {
  const v = text(body, 'return', 700);
  return RETURN.test(v) ? v : fallback;
}

/** A `true`-ish checkbox value from a form or JSON body. */
export function flag(body: Body, name: string): boolean {
  return ['1', 'true', 'on', 'yes'].includes(text(body, name, 10).toLowerCase());
}
