/**
 * Reads (never writes) the Live database of the end-to-end harness, for the one value no screen shows: the
 * PaymentIntent id of an order, which the harness's `/__stripe/dispute?payment_intent=…` control needs. Several
 * harnesses may run at once, each in its own `gamo-live-flow-*` folder; the order is found by its reference and its
 * event's title, so another run's database never answers.
 */
import { readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function sqliteFiles(): string[] {
  const root = tmpdir();
  const dirs = readdirSync(root)
    .filter((d) => d.startsWith('gamo-live-flow-') && !d.startsWith('gamo-live-flow-e2e-'))
    .map((d) => join(root, d, 'state', 'd1', 'miniflare-D1DatabaseObject'))
    .filter((d) => {
      try {
        return statSync(d).isDirectory();
      } catch {
        return false;
      }
    })
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return dirs.flatMap((d) =>
    readdirSync(d)
      .filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')
      .map((f) => join(d, f)),
  );
}

/** The order's PaymentIntent id (`pi_test_…`), or throws when no harness database has that order. */
export function paymentIntentOf(reference: string, eventTitle: string): string {
  for (const file of sqliteFiles()) {
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(file, { readOnly: true });
      const row = db
        .prepare(
          `SELECT o.payment_intent_id AS pi FROM orders o JOIN events e ON e.id = o.event_id
            WHERE o.reference = ? AND e.title = ?`,
        )
        .get(reference, eventTitle) as { pi: string | null } | undefined;
      if (row?.pi) return row.pi;
    } catch {
      // Not a Live database (the admin's own one), or busy: try the next.
    } finally {
      db?.close();
    }
  }
  throw new Error(`no harness database has order ${reference}`);
}
