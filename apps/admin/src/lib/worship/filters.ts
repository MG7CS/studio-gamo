/**
 * Query-string filters for the roster and request lists. The same parsers serve the pages and the
 * `GET /api/roster` endpoint, so a filtered URL means the same thing in both. Unknown or malformed values
 * are reported in `invalid` and never reach SQL; the domain applies its own binds on top.
 */
import {
  REQUEST_STATUSES,
  ROSTER_STATUSES,
  isIsoDate,
  type RequestFilter,
  type RequestStatus,
  type RosterSearch,
  type RosterStatus,
} from '@gamo/domain/worship';

export const ROSTER_PROGRAMS = ['worship', 'production', 'academy'] as const;
export type RosterProgram = (typeof ROSTER_PROGRAMS)[number];
export const REQUEST_PROGRAMS = ['worship', 'production'] as const;

export const PAGE_SIZE = 25;
const MAX_CURSOR = 512;

export interface RosterFilterValues {
  role: string;
  city: string;
  status: RosterStatus | '';
  program: RosterProgram | '';
}

export interface ParsedRosterFilters {
  search: RosterSearch;
  values: RosterFilterValues;
  /** Names of query parameters that were present but not valid. */
  invalid: string[];
}

function text(params: URLSearchParams, key: string, max: number): string {
  return (params.get(key) ?? '').trim().slice(0, max);
}

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | '' {
  return (allowed as readonly string[]).includes(value) ? (value as T) : '';
}

function limitOf(params: URLSearchParams, invalid: string[]): number {
  const raw = params.get('limit');
  if (raw === null || raw === '') return PAGE_SIZE;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 100) {
    invalid.push('limit');
    return PAGE_SIZE;
  }
  return n;
}

function cursorOf(params: URLSearchParams, invalid: string[]): string | undefined {
  const raw = params.get('cursor');
  if (!raw) return undefined;
  if (raw.length > MAX_CURSOR) {
    invalid.push('cursor');
    return undefined;
  }
  return raw;
}

export function parseRosterFilters(params: URLSearchParams): ParsedRosterFilters {
  const invalid: string[] = [];
  const role = text(params, 'role', 60);
  const city = text(params, 'city', 120);
  const statusRaw = text(params, 'status', 20);
  const programRaw = text(params, 'program', 20);
  const status = oneOf(statusRaw, ROSTER_STATUSES);
  const program = oneOf(programRaw, ROSTER_PROGRAMS);
  if (statusRaw && !status) invalid.push('status');
  if (programRaw && !program) invalid.push('program');
  const search: RosterSearch = { limit: limitOf(params, invalid) };
  if (role) search.role = role;
  if (city) search.city = city;
  if (status) search.status = status;
  if (program) search.program = program;
  const cursor = cursorOf(params, invalid);
  if (cursor) search.cursor = cursor;
  return { search, values: { role, city, status, program }, invalid };
}

export interface RequestFilterValues {
  status: RequestStatus | '';
  program: (typeof REQUEST_PROGRAMS)[number] | '';
  from: string;
  to: string;
}

export interface ParsedRequestFilters {
  filter: RequestFilter;
  values: RequestFilterValues;
  invalid: string[];
}

export function parseRequestFilters(params: URLSearchParams): ParsedRequestFilters {
  const invalid: string[] = [];
  const statusRaw = text(params, 'status', 20);
  const programRaw = text(params, 'program', 20);
  const status = oneOf(statusRaw, REQUEST_STATUSES);
  const program = oneOf(programRaw, REQUEST_PROGRAMS);
  if (statusRaw && !status) invalid.push('status');
  if (programRaw && !program) invalid.push('program');
  const dates: Record<'from' | 'to', string> = { from: '', to: '' };
  for (const key of ['from', 'to'] as const) {
    const raw = text(params, key, 10);
    if (!raw) continue;
    if (isIsoDate(raw)) dates[key] = raw;
    else invalid.push(key);
  }
  const filter: RequestFilter = { limit: limitOf(params, invalid) };
  if (status) filter.status = status;
  if (program) filter.program = program;
  if (dates.from) filter.fromDate = dates.from;
  if (dates.to) filter.toDate = dates.to;
  const cursor = cursorOf(params, invalid);
  if (cursor) filter.cursor = cursor;
  return { filter, values: { status, program, from: dates.from, to: dates.to }, invalid };
}

/** The query string for a list link, keeping only the filters that are set (never `cursor`). */
export function filterQuery(
  values: RosterFilterValues | RequestFilterValues,
  extra: Record<string, string> = {},
): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...values, ...extra })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
}
