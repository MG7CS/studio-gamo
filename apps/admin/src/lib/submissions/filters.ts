/**
 * The inbox filter lives in the URL (GET, link-addressable). This module turns query parameters into a
 * `SubmissionFilter` for `FormsService`, keeps the raw values to refill the form, and builds links that keep
 * the filter (pagination, back-to-inbox from a submission, export).
 *
 * Dates are calendar days in UTC (the inbox says so): `from` is the start of that day, `to` is inclusive so
 * the filter uses the start of the following day. A value that does not parse is ignored and reported by
 * field name only (never echoed back).
 */
import type { SubmissionFilter, SubmissionStatus } from '@gamo/domain/forms';
import { ID_PATTERN, isSubmissionStatus } from './statuses.ts';

export interface InboxValues {
  form: string;
  version: string;
  status: string;
  from: string;
  to: string;
  attachments: boolean;
  q: string;
}

export interface InboxQuery {
  filter: SubmissionFilter;
  /** Keyset cursor of the page being shown (`submittedAt:id`), if any. */
  cursor: string | undefined;
  /** Normalised values, safe to put back in the filter form. */
  values: InboxValues;
  /** Names of filters that were present but not understood (ignored). */
  ignored: string[];
}

const DAY = 86_400;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CURSOR = /^\d{1,12}:[A-Za-z0-9_-]{1,80}$/;
export const SEARCH_MAX = 100;

/** `YYYY-MM-DD` to epoch seconds at 00:00 UTC, or null for anything that is not a real calendar day. */
export function dayStartUtc(text: string): number | null {
  const m = DATE.exec(text);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2200) return null;
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return ms / 1000;
}

function first(params: URLSearchParams, name: string): string {
  return (params.get(name) ?? '').trim();
}

export function parseInboxQuery(params: URLSearchParams): InboxQuery {
  const filter: SubmissionFilter = {};
  const ignored: string[] = [];
  const values: InboxValues = {
    form: '',
    version: '',
    status: '',
    from: '',
    to: '',
    attachments: false,
    q: '',
  };

  const form = first(params, 'form');
  if (form) {
    if (ID_PATTERN.test(form)) {
      filter.formId = form;
      values.form = form;
    } else ignored.push('form');
  }

  const version = first(params, 'version');
  if (version) {
    if (/^\d{1,6}$/.test(version) && Number(version) >= 1) {
      filter.version = Number(version);
      values.version = version;
    } else ignored.push('version');
  }

  const status = first(params, 'status');
  if (status && status !== 'all') {
    if (isSubmissionStatus(status)) {
      filter.status = status as SubmissionStatus;
      values.status = status;
    } else ignored.push('status');
  }

  const from = first(params, 'from');
  if (from) {
    const start = dayStartUtc(from);
    if (start === null) ignored.push('from date');
    else {
      filter.from = start;
      values.from = from;
    }
  }
  const to = first(params, 'to');
  if (to) {
    const start = dayStartUtc(to);
    if (start === null) ignored.push('to date');
    else {
      filter.to = start + DAY;
      values.to = to;
    }
  }

  if (first(params, 'attachments') === '1') {
    filter.hasAttachments = true;
    values.attachments = true;
  }

  const q = first(params, 'q');
  if (q) {
    if (q.length <= SEARCH_MAX) {
      filter.q = q;
      values.q = q;
    } else ignored.push('search');
  }

  const rawCursor = first(params, 'cursor');
  let cursor: string | undefined;
  if (rawCursor) {
    if (CURSOR.test(rawCursor)) cursor = rawCursor;
    else ignored.push('page');
  }

  return { filter, cursor, values, ignored };
}

/** Query string (with a leading `?`, or empty) for the filter values plus optional extras. */
export function inboxQueryString(
  values: Partial<InboxValues>,
  extra: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams();
  const add = (k: string, v: string | undefined) => {
    if (v) params.set(k, v);
  };
  add('form', values.form);
  add('version', values.version);
  add('status', values.status);
  add('from', values.from);
  add('to', values.to);
  if (values.attachments) params.set('attachments', '1');
  add('q', values.q);
  for (const [k, v] of Object.entries(extra)) add(k, v);
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Keeps only the filter keys of a query string (drops cursor, notice and anything else). */
export function filterOnlyQuery(params: URLSearchParams): string {
  return inboxQueryString(parseInboxQuery(params).values);
}

/** The cursor that starts the page after `submission` (matches `FormsService.listSubmissions`). */
export function cursorAfter(submission: { submittedAt: number; id: string }): string {
  return `${submission.submittedAt}:${submission.id}`;
}
