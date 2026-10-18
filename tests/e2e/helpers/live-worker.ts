/**
 * A self-contained Gamo Live Worker for the scanner / organizer browser tests (Agent C): the built
 * app (apps/live/dist, `pnpm build` first) runs in Miniflare on a random loopback port with its own
 * empty D1, KV and R2, ENVIRONMENT=local and test-only secrets — no .dev.vars needed (the CI
 * condition). Fixtures are written with the same domain functions and SQL builders the app uses.
 * Fictional sample data only (example.org addresses, "Sample" names).
 */
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { newOrderReference, newPrefixedId, newTicketId } from '../../../packages/domain/src/security/ids.ts';
import { newQrSalt, signTicketQr } from '../../../packages/domain/src/security/ticket-qr.ts';
import { runBatch, type SqlDatabase, type SqlStatementSpec } from '../../../packages/domain/src/security/sql-database.ts';
import { EVENT_POLICY_DEFAULTS, HOLD_DURATION_SECONDS, policySnapshotJson } from '../../../packages/domain/src/types/policy.ts';
import {
  buildHoldBatch,
  convertOrderHoldsStatement,
  insertTicketStatement,
  transitionOrderStatement,
} from '../../../packages/domain/src/ticketing/sql.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const require = createRequire(join(ROOT, 'apps/live/package.json'));
const wranglerRequire = createRequire(require.resolve('wrangler'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare') as {
  Miniflare: new (options: never) => {
    ready: Promise<URL>;
    getD1Database(name: string): Promise<unknown>;
    getR2Bucket(name: string): Promise<unknown>;
    dispose(): Promise<void>;
  };
  convertV4MiniflareOptions(options: never): Record<string, unknown>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { build } = wranglerRequire('esbuild') as typeof import('esbuild');

export const SECRETS = {
  SESSION_SECRET: 'e2e-scanner-session-secret-0123456789abcdef',
  SCANNER_SESSION_SECRET: 'e2e-scanner-device-secret-0123456789abcdef',
  TICKET_QR_SECRET_GL1: 'e2e-scanner-ticket-qr-secret-0123456789abcd',
  PII_HASH_SECRET: 'e2e-scanner-pii-hash-secret-0123456789abcdef',
  CUSTOMER_LINK_SECRET: 'e2e-scanner-customer-link-0123456789abcdef',
};

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export interface LiveWorker {
  origin: string;
  db: SqlDatabase;
  bucket: { put(key: string, value: Uint8Array, opts?: unknown): Promise<unknown>; get(key: string): Promise<unknown> };
  env: Record<string, unknown>;
  dispose(): Promise<void>;
}

export async function startLiveWorker(): Promise<LiveWorker> {
  const entry = join(ROOT, 'apps/live/dist/server/entry.mjs');
  if (!existsSync(entry)) throw new Error('Build apps/live first (pnpm build).');
  const dir = mkdtempSync(join(tmpdir(), 'gamo-scanner-e2e-'));
  const outfile = join(dir, 'live.mjs');
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    external: ['cloudflare:workers', 'node:*'],
    logLevel: 'error',
  });
  const clientRoot = join(ROOT, 'apps/live/dist/client');
  const bindings = { ENVIRONMENT: 'local', PUBLIC_ROOT_DOMAIN: 'localhost', ...SECRETS };
  const worker = {
    name: 'live',
    modules: true,
    script: readFileSync(outfile, 'utf8'),
    compatibilityDate: '2024-09-23',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: { DB: 'scanner-e2e-db' },
    kvNamespaces: { SESSION: 'scanner-e2e-kv', SESSION_KV: 'scanner-e2e-kv' },
    r2Buckets: { MEDIA_BUCKET: 'scanner-e2e-media' },
    bindings,
    serviceBindings: {
      ASSETS: async (request: Request) => {
        const url = new URL(request.url);
        let rel = decodeURIComponent(url.pathname);
        if (rel.endsWith('/')) rel += 'index.html';
        const file = join(clientRoot, normalize(rel));
        if (file.startsWith(clientRoot) && existsSync(file) && statSync(file).isFile())
          return new Response(readFileSync(file), {
            headers: { 'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' },
          });
        return new Response('Not found', { status: 404 });
      },
    },
  };
  const mf = new Miniflare({
    ...convertV4MiniflareOptions({ host: '127.0.0.1', port: 0, workers: [worker] } as never),
    resourcePersistencePath: join(dir, 'state'),
  } as never);
  const url = await mf.ready;
  const db = (await mf.getD1Database('DB')) as unknown as SqlDatabase & { exec(sql: string): Promise<unknown> };
  for (const file of readdirSync(join(ROOT, 'packages/db/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    for (const raw of readFileSync(join(ROOT, 'packages/db/migrations', file), 'utf8').split('--> statement-breakpoint')) {
      const sql = raw.replace(/^\s*--.*$/gm, '').trim();
      if (sql) await db.exec(sql.replace(/\n/g, ' '));
    }
  const bucket = (await mf.getR2Bucket('MEDIA_BUCKET')) as unknown as LiveWorker['bucket'];
  return {
    origin: url.origin,
    db,
    bucket,
    env: { ...bindings },
    dispose: () => mf.dispose(),
  };
}

const now = () => Math.floor(Date.now() / 1000);
const sql = (s: string, ...params: Array<string | number | null>): SqlStatementSpec => ({ sql: s, params });

/** An organizer (owner of Sample Church) with a Gamo Live session; returns the `__session` cookie value. */
export async function seedOrganizer(worker: LiveWorker, id = 'usr_e2e_owner') {
  const t = now();
  await runBatch(worker.db, [
    sql("INSERT OR IGNORE INTO organizations (id, name, slug, type, status, created_at) VALUES ('org_e2e', 'Sample Church', 'sample-church-e2e', 'church', 'active', ?1)", t),
    sql("INSERT OR IGNORE INTO organizer_profiles (id, organization_id, created_at) VALUES ('op_e2e', 'org_e2e', ?1)", t),
    sql("INSERT OR IGNORE INTO users (id, email, verified_email_at, status, created_at, display_name) VALUES (?1, ?2, ?3, 'active', ?3, 'Sample Organizer')", id, `${id}@example.org`, t),
    sql("INSERT OR IGNORE INTO product_accounts (id, user_id, product, status, onboarding_status, created_at, updated_at) VALUES (?1, ?2, 'live', 'active', 'complete', ?3, ?3)", `pacc_${id}`, id, t),
    sql("INSERT OR IGNORE INTO organization_members (id, organization_id, user_id, role, status, created_at) VALUES (?1, 'org_e2e', ?2, 'owner', 'active', ?3)", `om_${id}`, id, t),
  ]);
  const sid = createHmac('sha256', 'sid').update(`${id}${Math.random()}`).digest('hex').slice(0, 48);
  await runBatch(worker.db, [
    sql("INSERT INTO sessions (id, user_id, expires_at, created_at, product) VALUES (?1, ?2, ?3, ?4, 'live')", sid, id, t + 86400, t),
  ]);
  const mac = createHmac('sha256', SECRETS.SESSION_SECRET).update(sid).digest('base64url');
  return `${sid}.${mac}`;
}

/** An approved paid event starting in an hour (scanning open), with categories. */
export async function seedEvent(
  worker: LiveWorker,
  input: { id: string; title: string; tiers: Array<{ id: string; name: string; capacity: number; price?: number }> },
) {
  const t = now();
  await runBatch(worker.db, [
    sql(
      "INSERT INTO events (id, organizer_id, title, slug, category, description, venue_name, city, state, starts_at, ends_at, timezone, admission_type, status, created_at) VALUES (?1, 'op_e2e', ?2, ?1, 'concert', 'Sample event for browser tests', 'Sample Hall', 'Phoenix', 'AZ', ?3, ?4, 'America/Phoenix', 'paid', 'approved', ?5)",
      input.id,
      input.title,
      t + 3600,
      t + 4 * 3600,
      t,
    ),
    ...input.tiers.map((tier) =>
      sql(
        "INSERT INTO ticket_tiers (id, event_id, name, price_cents, capacity, reserved_count, status) VALUES (?1, ?2, ?3, ?4, ?5, 0, 'active')",
        tier.id,
        input.id,
        tier.name,
        tier.price ?? 2500,
        tier.capacity,
      ),
    ),
  ]);
  return input.id;
}

/** Sells and issues tickets with the Phase 1 builders; returns ids and GL1 payloads. */
export async function seedTickets(
  worker: LiveWorker,
  input: { eventId: string; categoryId: string; sectionId?: string | null; quantity: number; holderName: string },
) {
  const t = now();
  const orderId = newPrefixedId('ord');
  const itemId = newPrefixedId('oit');
  await runBatch(
    worker.db,
    buildHoldBatch({
      order: {
        id: orderId,
        reference: newOrderReference(),
        eventId: input.eventId,
        customerProfileId: null,
        purchaserName: input.holderName,
        purchaserEmail: 'sample.buyer@example.org',
        kind: 'paid',
        status: 'pending_payment',
        idempotencyKey: newPrefixedId('idem'),
        holdExpiresAt: t + HOLD_DURATION_SECONDS,
        policySnapshotJson: policySnapshotJson(EVENT_POLICY_DEFAULTS),
        now: t,
      },
      items: [{ item: { id: itemId, categoryId: input.categoryId, sectionId: input.sectionId ?? null, quantity: input.quantity }, holdId: newPrefixedId('hold') }],
    }),
  );
  const issue: SqlStatementSpec[] = [
    transitionOrderStatement({ orderId, from: ['pending_payment'], to: 'paid', now: t }),
    convertOrderHoldsStatement({ orderId, now: t }),
  ];
  const tickets: Array<{ id: string; payload: string }> = [];
  for (let seq = 1; seq <= input.quantity; seq++) {
    const id = newTicketId();
    const salt = newQrSalt();
    const signed = await signTicketQr({ ticketId: id, version: 1, eventId: input.eventId, salt }, { GL1: SECRETS.TICKET_QR_SECRET_GL1 });
    if (!signed.ok) throw new Error('sign');
    issue.push(
      insertTicketStatement({
        id,
        orderId,
        orderItemId: itemId,
        eventId: input.eventId,
        categoryId: input.categoryId,
        sectionId: input.sectionId ?? null,
        holderName: input.holderName,
        holderEmail: 'sample.buyer@example.org',
        seq,
        qrKeyId: signed.keyId,
        qrSalt: salt,
        qrSignatureHash: signed.macDigest,
        now: t,
      }),
    );
    tickets.push({ id, payload: signed.payload });
  }
  await runBatch(worker.db, issue);
  return tickets;
}

export async function count(worker: LiveWorker, query: string, ...params: Array<string | number>) {
  const row = (await worker.db.prepare(query).bind(...params).first()) as { n: number } | null;
  return Number(row?.n ?? 0);
}
