/**
 * Read-only queries the invoice screens need beside `InvoiceService`: the roster for payee choices and
 * the Academy registrations list. Parameterised SQL only; no writes.
 */
import { allRows, asSqlDatabase, type SqlDatabase } from '@gamo/domain/security';
import { InvoiceService, type InvoiceEnv, type InvoiceServiceOptions } from '@gamo/domain/invoices';

export type InvoiceRuntimeEnv = InvoiceEnv & { DB?: unknown };

/** The D1 binding as a SQL database; throws `Database binding unavailable.` when it is missing. */
export function sqlOf(env: { DB?: unknown }): SqlDatabase {
  return asSqlDatabase(env.DB);
}

export function invoiceService(env: InvoiceRuntimeEnv, options: InvoiceServiceOptions = {}): InvoiceService {
  return new InvoiceService(sqlOf(env), env, options);
}

export interface RosterOption {
  id: string;
  name: string;
}

/** Active roster members, by name; the payee choices for musician pay lines. */
export async function listRosterOptions(db: SqlDatabase): Promise<RosterOption[]> {
  const rows = await allRows<{ id: string; display_name: string }>(db, {
    sql: `SELECT id, display_name FROM roster_members WHERE status = 'active' ORDER BY display_name COLLATE NOCASE, id LIMIT 500`,
    params: [],
  });
  return rows.map((r) => ({ id: r.id, name: r.display_name }));
}

/** Roster names by id (any status) for the lines of one invoice. */
export async function rosterNames(db: SqlDatabase, ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return out;
  const rows = await allRows<{ id: string; display_name: string }>(db, {
    sql: `SELECT id, display_name FROM roster_members WHERE id IN (${unique.map((_, i) => `?${i + 1}`).join(', ')})`,
    params: unique,
  });
  for (const r of rows) out.set(r.id, r.display_name);
  return out;
}

export interface RegistrationRow {
  id: string;
  reference: string | null;
  status: string;
  programSlug: string;
  lessonSlug: string | null;
  /** Guardian email, or the customer's own email for an adult student. Mask before display. */
  email: string | null;
  amountCents: number;
  paidAt: number | null;
  createdAt: number;
  /** The newest non-void invoice for this registration, if any. */
  invoiceId: string | null;
  invoiceNumber: string | null;
}

export interface RegistrationPage {
  items: RegistrationRow[];
  nextCursor: string | null;
}

const PAGE = 25;

const encode = (createdAt: number, id: string) =>
  btoa(JSON.stringify({ c: createdAt, i: id }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

function decode(cursor: string): { c: number; i: string } | null {
  try {
    const p = JSON.parse(atob(cursor.replace(/-/g, '+').replace(/_/g, '/'))) as { c?: unknown; i?: unknown };
    return typeof p.c === 'number' && Number.isSafeInteger(p.c) && typeof p.i === 'string'
      ? { c: p.c, i: p.i }
      : null;
  } catch {
    return null;
  }
}

/** Academy registrations, newest first (keyset on created_at, id). */
export async function listRegistrations(db: SqlDatabase, cursor?: string | null): Promise<RegistrationPage> {
  const params: Array<string | number> = [];
  let where = '';
  const c = cursor ? decode(cursor) : null;
  if (c) {
    params.push(c.c, c.i);
    where = 'WHERE (r.created_at < ?1 OR (r.created_at = ?1 AND r.id < ?2))';
  }
  params.push(PAGE + 1);
  const rows = await allRows<{
    id: string;
    reference: string | null;
    status: string;
    program_slug: string;
    lesson_slug: string | null;
    guardian_email: string | null;
    customer_email: string | null;
    amount_cents: number;
    paid_at: number | null;
    created_at: number;
    invoice_id: string | null;
    invoice_number: string | null;
  }>(db, {
    sql: `SELECT r.id, r.reference, r.status, r.program_slug, r.lesson_slug, r.guardian_email,
                 c.email_normalized AS customer_email, r.amount_cents, r.paid_at, r.created_at,
                 (SELECT i.id FROM invoices i WHERE i.source_type = 'academy_registration' AND i.source_id = r.id AND i.status != 'void'
                    ORDER BY i.created_at DESC LIMIT 1) AS invoice_id,
                 (SELECT i.number FROM invoices i WHERE i.source_type = 'academy_registration' AND i.source_id = r.id AND i.status != 'void'
                    ORDER BY i.created_at DESC LIMIT 1) AS invoice_number
          FROM academy_registrations r LEFT JOIN customer_profiles c ON c.id = r.customer_profile_id
          ${where}
          ORDER BY r.created_at DESC, r.id DESC LIMIT ?${params.length}`,
    params,
  });
  const page = rows.slice(0, PAGE);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => ({
      id: r.id,
      reference: r.reference,
      status: r.status,
      programSlug: r.program_slug,
      lessonSlug: r.lesson_slug,
      email: r.guardian_email ?? r.customer_email,
      amountCents: Number(r.amount_cents),
      paidAt: r.paid_at === null ? null : Number(r.paid_at),
      createdAt: Number(r.created_at),
      invoiceId: r.invoice_id,
      invoiceNumber: r.invoice_number,
    })),
    nextCursor: rows.length > PAGE && last ? encode(Number(last.created_at), last.id) : null,
  };
}

/** A lesson label for a registration row: the lesson, else the program, with dashes as spaces. */
export function registrationLabel(row: Pick<RegistrationRow, 'lessonSlug' | 'programSlug'>): string {
  return (row.lessonSlug ?? row.programSlug).replace(/[-_]+/g, ' ');
}
