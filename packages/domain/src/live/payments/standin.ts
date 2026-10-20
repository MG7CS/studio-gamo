/**
 * The local Stripe stand-in (docs/LIVE_PAYMENTS.md §9, docs/LIVE_REQUIREMENTS.md §8 item 32). Same `StripeGateway` as
 * the real client, for ENVIRONMENT=local with ALLOW_STRIPE_STANDIN=true and no key (`stripeModeOf(env) === 'standin'`),
 * and for the unit tests (which run with that environment, `PAID_ENV`). It refuses to start anywhere else, unless a
 * test passes `{ testHarness: true }` explicitly.
 *
 * - State lives in Live's own database in a table created on first use (`standin_stripe_objects`), so it survives
 *   across requests of a dev server and is never part of the production schema.
 * - Ids look like Stripe's (`cs_test_…`, `pi_test_…`, `ch_test_…`, `re_test_…`, `tr_test_…`, `txn_test_…`,
 *   `du_test_…`, `acct_…`, `tml_…`, `tmr_…`, `evt_…`). Objects on a connected account are only found with that
 *   account (as with `Stripe-Account`); idempotency keys are honored per account (same key and parameters → the same
 *   object; same key, other parameters → `idempotency_error`).
 * - Checkout Sessions: `url` is `/dev/stripe/checkout/<id>` (on `options.origin` when given). The app's local page
 *   calls `standinCheckoutView` to show it and `standinCompleteCheckout` for Pay / Decline / Cancel / Expire.
 *   `expires_at` must be 30 minutes to 24 hours ahead, as in Stripe.
 * - Connected accounts start not ready; `/dev/stripe/onboard/<acct>` (the Account Link) calls
 *   `standinCompleteOnboarding`, which makes them ready and sends `account.updated`.
 * - Readers: registration code `simulated-s700` or `simulated-wpe`; processing a PaymentIntent puts the action
 *   `in_progress`; `presentPaymentMethod` completes it (`standinPresentCard` can also decline).
 * - Processing costs on balance transactions are a simulation (2.9% + 30¢ online, 2.7% + 5¢ card present), so
 *   reconciliation has something to compare locally; they are never shown as Stripe's real prices.
 * - Events: every state change records the event Stripe would send, with `account` set for connected-account
 *   objects (so it goes to the Connect endpoint), signed with `webhookSecretsOf(env, endpoint)[0]`. Delivery goes to
 *   the `deliver` callback given to the gateway, else the one registered with `registerStandinDelivery`, else the
 *   event just stays recorded. Events caused by API calls are delivered after the call returns (as Stripe does,
 *   on a timer; `deferredDelivery: 'manual'` leaves them for `standinDeliverPending`); events of the simulated outside
 *   world (paying on the hosted page, onboarding, presenting a card, disputes) are delivered before the function
 *   returns. A delivery answered with a non-2xx status stays pending and is retried by `standinDeliverPending`.
 */
import { bytesToHex, randomBytes } from '../../security/crypto.ts';
import { allRows, type SqlDatabase } from '../../security/sql-database.ts';
import type { PaidEnv } from '../paid-types.ts';
import { stripeModeOf, webhookSecretsOf } from './resolve.ts';
import { signStripePayload } from './signature.ts';
import {
  StripeApiError,
  type AccountParams,
  type CheckoutLineItem,
  type CheckoutSessionParams,
  type LocationParams,
  type PaymentIntentParams,
  type RefundParams,
  type RequestOptions,
  type StripeAccount,
  type StripeAccountLink,
  type StripeBalanceTransaction,
  type StripeCheckoutSession,
  type StripeGateway,
  type StripeLocation,
  type StripePaymentIntent,
  type StripeReader,
  type StripeRefund,
  type StripeTransfer,
  type TransferParams,
} from './types.ts';

/**
 * Receives each signed stand-in event: `(rawBody, signatureHeader, endpoint)`. Answer with the webhook's status so a
 * refused delivery stays pending (returning nothing counts as delivered).
 */
export type StandinDelivery = (
  rawBody: string,
  signatureHeader: string,
  endpoint: 'platform' | 'connect',
) => Promise<void | { status: number }>;

let registeredDelivery: StandinDelivery | null = null;

/** The Live app registers its webhook receiver once per isolate; used whenever no `deliver` argument is given. */
export function registerStandinDelivery(deliver: StandinDelivery | null): void {
  registeredDelivery = deliver;
}

export interface StandinOptions {
  deliver?: StandinDelivery;
  /** Seconds since the epoch for API calls (the gateway interface carries no `now`); defaults to the clock. */
  clock?: () => number;
  /** Prefix for hosted-page URLs, for example `http://localhost:4323`; default relative. */
  origin?: string;
  /** `timer` (default): API-caused events are delivered right after the call; `manual`: only by `standinDeliverPending`. */
  deferredDelivery?: 'timer' | 'manual';
  /** Lets a test run the stand-in with an environment that is not `standin`. Never set by app code. */
  testHarness?: boolean;
}

export const STANDIN_READER_CODES: Readonly<Record<string, string>> = {
  'simulated-s700': 'stripe_s700',
  'simulated-wpe': 'bbpos_wisepos_e',
};

/** Simulated processing cost (stand-in only). */
export function standinProcessingFee(amountCents: number, presentment: 'online' | 'card_present'): number {
  const [bps, fixed] = presentment === 'online' ? [290, 30] : [270, 5];
  return Math.floor((2 * amountCents * bps + 10_000) / 20_000) + fixed;
}

const STANDIN_DISPUTE_FEE_CENTS = 1500;

// ── Storage ────────────────────────────────────────────────────────────────────────────────────────────────────

type Kind =
  | 'checkout_session'
  | 'payment_intent'
  | 'charge'
  | 'refund'
  | 'transfer'
  | 'balance_transaction'
  | 'account'
  | 'location'
  | 'reader'
  | 'dispute'
  | 'idempotency'
  | 'event'
  | 'event_delivered';

interface Stored<T = Record<string, unknown>> {
  id: string;
  kind: Kind;
  account: string | null;
  obj: T;
  meta: Record<string, unknown>;
}

const prepared = new WeakSet<object>();
const timerScheduled = new WeakSet<object>();
const deliveryChains = new WeakMap<object, Promise<unknown>>();

async function ensureTable(db: SqlDatabase): Promise<void> {
  if (prepared.has(db)) return;
  await db
    .prepare(
      'CREATE TABLE IF NOT EXISTS standin_stripe_objects (id TEXT PRIMARY KEY, kind TEXT NOT NULL, account TEXT, ' +
        'data TEXT NOT NULL, created_at INTEGER NOT NULL)',
    )
    .run();
  await db
    .prepare(
      'CREATE INDEX IF NOT EXISTS standin_stripe_objects_kind ON standin_stripe_objects (kind, account)',
    )
    .run();
  prepared.add(db);
}

async function load<T>(db: SqlDatabase, id: string): Promise<Stored<T> | null> {
  const [row] = await allRows<{ id: string; kind: Kind; account: string | null; data: string }>(db, {
    sql: 'SELECT id, kind, account, data FROM standin_stripe_objects WHERE id = ?1',
    params: [id],
  });
  if (!row) return null;
  const data = JSON.parse(row.data) as { obj: T; meta: Record<string, unknown> };
  return { id: row.id, kind: row.kind, account: row.account, obj: data.obj, meta: data.meta ?? {} };
}

async function save(db: SqlDatabase, s: Stored<unknown>, now: number): Promise<void> {
  await db
    .prepare(
      'INSERT INTO standin_stripe_objects (id, kind, account, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5) ' +
        'ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, data = excluded.data',
    )
    .bind(s.id, s.kind, s.account, JSON.stringify({ obj: s.obj, meta: s.meta }), now)
    .run();
}

async function listKind<T>(
  db: SqlDatabase,
  kind: Kind,
  account: string | null | undefined,
): Promise<Stored<T>[]> {
  const rows = await allRows<{ id: string; kind: Kind; account: string | null; data: string }>(db, {
    sql:
      account === undefined
        ? 'SELECT id, kind, account, data FROM standin_stripe_objects WHERE kind = ?1 ORDER BY rowid'
        : 'SELECT id, kind, account, data FROM standin_stripe_objects WHERE kind = ?1 AND account IS ?2 ORDER BY rowid',
    params: account === undefined ? [kind] : [kind, account],
  });
  return rows.map((row) => {
    const data = JSON.parse(row.data) as { obj: T; meta: Record<string, unknown> };
    return { id: row.id, kind: row.kind, account: row.account, obj: data.obj, meta: data.meta ?? {} };
  });
}

const rand = (bytes: number) => bytesToHex(randomBytes(bytes));
const newId = (prefix: string) => `${prefix}${rand(12)}`;
const missing = () => new StripeApiError(404, 'resource_missing');
const invalid = (code: string) => new StripeApiError(400, code);

// ── The simulation ─────────────────────────────────────────────────────────────────────────────────────────────

interface SessionMeta {
  lineItems: CheckoutLineItem[];
  successUrl: string;
  cancelUrl: string;
  intentMetadata: Record<string, string>;
  applicationFeeCents: number;
  transferGroup: string | null;
}

interface ChargeObj {
  id: string;
  object: 'charge';
  amount: number;
  amount_refunded: number;
  currency: string;
  payment_intent: string;
  refunded: boolean;
  balance_transaction: string;
  transfer_group: string | null;
  livemode: false;
}

class Standin {
  constructor(
    readonly db: SqlDatabase,
    readonly env: PaidEnv,
    readonly options: StandinOptions,
  ) {}

  private get deliver(): StandinDelivery | null {
    return this.options.deliver ?? registeredDelivery;
  }

  private url(path: string): string {
    return `${(this.options.origin ?? '').replace(/\/$/, '')}${path}`;
  }

  async get<T>(id: string, kind: Kind, account: string | null | undefined): Promise<Stored<T>> {
    if (typeof id !== 'string' || !id) throw missing();
    const s = await load<T>(this.db, id);
    if (!s || s.kind !== kind) throw missing();
    // `undefined` = look up by id alone (simulated outside world); otherwise the account must match.
    if (account !== undefined && s.account !== (account ?? null)) throw missing();
    return s;
  }

  /** The object an earlier request with this idempotency key created, or null; other parameters are an error. */
  async replay<T>(op: string, opts: RequestOptions, fingerprint: unknown): Promise<T | null> {
    const key = opts.idempotencyKey;
    if (!key) return null;
    const record = await load<{ print: string; objectId: string }>(
      this.db,
      `idem:${opts.account ?? 'platform'}:${key}`,
    );
    if (!record) return null;
    if (record.obj.print !== JSON.stringify([op, fingerprint])) throw invalid('idempotency_error');
    return (await load<T>(this.db, record.obj.objectId))?.obj ?? null;
  }

  /** Runs `create` once per (account, key); a repeat with the same parameters returns the first object. */
  async idempotent<T>(
    op: string,
    opts: RequestOptions,
    fingerprint: unknown,
    now: number,
    create: () => Promise<Stored<T>>,
  ): Promise<T> {
    const earlier = await this.replay<T>(op, opts, fingerprint);
    if (earlier) return earlier;
    const created = await create();
    await save(this.db, created, now);
    const key = opts.idempotencyKey;
    if (key)
      await save(
        this.db,
        {
          id: `idem:${opts.account ?? 'platform'}:${key}`,
          kind: 'idempotency',
          account: opts.account ?? null,
          obj: { print: JSON.stringify([op, fingerprint]), objectId: created.id },
          meta: {},
        },
        now,
      );
    return created.obj;
  }

  // Events.

  async emit(type: string, object: unknown, account: string | null, now: number): Promise<void> {
    const event = {
      id: newId('evt_test_'),
      object: 'event',
      type,
      created: now,
      livemode: false,
      ...(account ? { account } : {}),
      pending_webhooks: 1,
      data: { object },
    };
    await save(
      this.db,
      {
        id: event.id,
        kind: 'event',
        account,
        obj: { body: JSON.stringify(event), type, endpoint: account ? 'connect' : 'platform', attempts: 0 },
        meta: {},
      },
      now,
    );
  }

  /** After an API call: deliver soon, outside the caller's flow (as Stripe does). One timer per database at a time. */
  later(): void {
    if (this.options.deferredDelivery === 'manual' || !this.deliver || timerScheduled.has(this.db)) return;
    timerScheduled.add(this.db);
    const clock = this.options.clock ?? (() => Math.floor(Date.now() / 1000));
    setTimeout(() => {
      timerScheduled.delete(this.db);
      this.deliverPending(clock()).catch(() => undefined);
    }, 0);
  }

  /** Deliveries for one database run one after another, so an event is never sent twice at once. */
  deliverPending(now: number): Promise<{ delivered: number; pending: number }> {
    const previous = deliveryChains.get(this.db) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => this.deliverPendingNow(now));
    deliveryChains.set(this.db, next);
    return next;
  }

  private async deliverPendingNow(now: number): Promise<{ delivered: number; pending: number }> {
    const deliver = this.deliver;
    const events = await listKind<{
      body: string;
      type: string;
      endpoint: 'platform' | 'connect';
      attempts: number;
    }>(this.db, 'event', undefined);
    if (!deliver) return { delivered: 0, pending: events.length };
    let delivered = 0;
    for (const e of events) {
      const [secret] = webhookSecretsOf(this.env, e.obj.endpoint);
      let ok = false;
      if (secret) {
        try {
          const answer = await deliver(
            e.obj.body,
            await signStripePayload(e.obj.body, secret, now),
            e.obj.endpoint,
          );
          const status = answer && typeof answer === 'object' ? answer.status : 200;
          ok = status >= 200 && status < 300;
        } catch {
          ok = false;
        }
      }
      if (ok) delivered++;
      await save(
        this.db,
        { ...e, kind: ok ? 'event_delivered' : 'event', obj: { ...e.obj, attempts: e.obj.attempts + 1 } },
        now,
      );
    }
    return { delivered, pending: events.length - delivered };
  }

  // Money movements.

  async balanceTransaction(
    account: string | null,
    fields: { amount: number; fee: number; type: string; source: string },
    now: number,
  ): Promise<string> {
    const bt: StripeBalanceTransaction = {
      id: newId('txn_test_'),
      amount: fields.amount,
      fee: fields.fee,
      net: fields.amount - fields.fee,
      currency: 'usd',
      type: fields.type,
      source: fields.source,
      created: now,
    };
    await save(this.db, { id: bt.id, kind: 'balance_transaction', account, obj: bt, meta: {} }, now);
    return bt.id;
  }

  /** A PaymentIntent succeeds: its charge, balance transactions and status. Returns the updated intent. */
  async succeedIntent(
    pi: Stored<StripePaymentIntent>,
    presentment: 'online' | 'card_present',
    now: number,
  ): Promise<StripePaymentIntent> {
    const chargeId = newId('ch_test_');
    const amount = pi.obj.amount;
    const appFee = Number(pi.meta.applicationFeeCents ?? 0);
    const processing = standinProcessingFee(amount, presentment);
    // Direct charges: the connected account's balance transaction fee includes the application fee, as in Stripe.
    const btId = await this.balanceTransaction(
      pi.account,
      { amount, fee: processing + appFee, type: 'charge', source: chargeId },
      now,
    );
    if (appFee > 0 && pi.account)
      await this.balanceTransaction(
        null,
        { amount: appFee, fee: 0, type: 'application_fee', source: newId('fee_test_') },
        now,
      );
    const charge: ChargeObj = {
      id: chargeId,
      object: 'charge',
      amount,
      amount_refunded: 0,
      currency: pi.obj.currency,
      payment_intent: pi.id,
      refunded: false,
      balance_transaction: btId,
      transfer_group: (pi.meta.transferGroup as string | null) ?? null,
      livemode: false,
    };
    await save(
      this.db,
      {
        id: chargeId,
        kind: 'charge',
        account: pi.account,
        obj: charge,
        meta: { applicationFeeCents: appFee },
      },
      now,
    );
    pi.obj = { ...pi.obj, status: 'succeeded', amount_received: amount, latest_charge: chargeId };
    await save(this.db, pi, now);
    return pi.obj;
  }

  newIntent(
    params: {
      amount: number;
      metadata: Record<string, string>;
      applicationFeeCents: number;
      transferGroup: string | null;
      cardPresent: boolean;
    },
    account: string | null,
  ): Stored<StripePaymentIntent> {
    const id = newId('pi_test_');
    return {
      id,
      kind: 'payment_intent',
      account,
      obj: {
        id,
        object: 'payment_intent',
        amount: params.amount,
        amount_received: 0,
        currency: 'usd',
        status: 'requires_payment_method',
        latest_charge: null,
        metadata: { ...params.metadata },
        livemode: false,
      },
      meta: {
        applicationFeeCents: params.applicationFeeCents,
        transferGroup: params.transferGroup,
        cardPresent: params.cardPresent,
      },
    };
  }

  // Checkout.

  async createCheckoutSession(
    p: CheckoutSessionParams,
    opts: RequestOptions,
    now: number,
  ): Promise<StripeCheckoutSession> {
    if (p.currency !== 'usd') throw invalid('currency_invalid');
    if (p.lineItems.length === 0) throw invalid('line_items_missing');
    let total = 0;
    for (const line of p.lineItems) {
      if (
        !Number.isInteger(line.unitAmountCents) ||
        line.unitAmountCents < 0 ||
        !Number.isInteger(line.quantity) ||
        line.quantity < 1
      )
        throw invalid('parameter_invalid_integer');
      total += line.unitAmountCents * line.quantity;
    }
    if (!Number.isInteger(p.expiresAt) || p.expiresAt < now + 30 * 60 || p.expiresAt > now + 24 * 3600)
      throw invalid('expires_at_invalid');
    const fee = p.applicationFeeCents ?? 0;
    if (fee > 0 && (!opts.account || fee >= total)) throw invalid('application_fee_invalid');
    return this.idempotent('checkout', opts, p, now, async () => {
      const id = newId('cs_test_');
      const meta: SessionMeta = {
        lineItems: p.lineItems.map((l) => ({ ...l })),
        successUrl: p.successUrl,
        cancelUrl: p.cancelUrl,
        intentMetadata: { ...p.metadata },
        applicationFeeCents: fee,
        transferGroup: p.transferGroup ?? null,
      };
      const obj: StripeCheckoutSession = {
        id,
        object: 'checkout.session',
        url: this.url(`/dev/stripe/checkout/${id}`),
        status: 'open',
        payment_status: 'unpaid',
        amount_total: total,
        currency: 'usd',
        client_reference_id: p.clientReferenceId,
        payment_intent: null,
        expires_at: p.expiresAt,
        metadata: { ...p.metadata },
        livemode: false,
      };
      return {
        id,
        kind: 'checkout_session',
        account: opts.account ?? null,
        obj,
        meta: meta as unknown as Record<string, unknown>,
      };
    });
  }

  /** Loads a session, expiring it first when its time has passed (as Stripe does on its own). */
  async session(
    id: string,
    account: string | null | undefined,
    now: number,
  ): Promise<Stored<StripeCheckoutSession>> {
    const s = await this.get<StripeCheckoutSession>(id, 'checkout_session', account);
    if (s.obj.status === 'open' && s.obj.expires_at <= now) await this.expireSession(s, now);
    return s;
  }

  async expireSession(s: Stored<StripeCheckoutSession>, now: number): Promise<void> {
    s.obj = { ...s.obj, status: 'expired', url: null };
    await save(this.db, s, now);
    await this.emit('checkout.session.expired', s.obj, s.account, now);
  }

  async expireCheckoutSession(id: string, opts: RequestOptions, now: number): Promise<StripeCheckoutSession> {
    const s = await this.session(id, opts.account ?? null, now);
    if (s.obj.status !== 'open') throw invalid('checkout_session_not_open');
    await this.expireSession(s, now);
    return s.obj;
  }

  // Payment intents.

  async createPaymentIntent(
    p: PaymentIntentParams,
    opts: RequestOptions,
    now: number,
  ): Promise<StripePaymentIntent> {
    if (!Number.isInteger(p.amountCents) || p.amountCents < 50) throw invalid('amount_too_small');
    const fee = p.applicationFeeCents ?? 0;
    if (fee > 0 && (!opts.account || fee >= p.amountCents)) throw invalid('application_fee_invalid');
    return this.idempotent('payment_intent', opts, p, now, async () =>
      this.newIntent(
        {
          amount: p.amountCents,
          metadata: { ...p.metadata },
          applicationFeeCents: fee,
          transferGroup: p.transferGroup ?? null,
          cardPresent: p.cardPresent,
        },
        opts.account ?? null,
      ),
    );
  }

  async cancelPaymentIntent(id: string, opts: RequestOptions, now: number): Promise<StripePaymentIntent> {
    const pi = await this.get<StripePaymentIntent>(id, 'payment_intent', opts.account ?? null);
    if (pi.obj.status === 'succeeded' || pi.obj.status === 'canceled')
      throw invalid('payment_intent_unexpected_state');
    pi.obj = { ...pi.obj, status: 'canceled' };
    await save(this.db, pi, now);
    await this.emit('payment_intent.canceled', pi.obj, pi.account, now);
    return pi.obj;
  }

  // Refunds and transfers.

  async createRefund(p: RefundParams, opts: RequestOptions, now: number): Promise<StripeRefund> {
    const pi = await this.get<StripePaymentIntent>(p.paymentIntentId, 'payment_intent', opts.account ?? null);
    if (pi.obj.status !== 'succeeded' || !pi.obj.latest_charge) throw invalid('charge_not_refundable');
    const charge = await this.get<ChargeObj>(pi.obj.latest_charge, 'charge', pi.account);
    const fingerprint = { p, charge: charge.id };
    // A retried request returns the first refund even when nothing is left to refund now.
    const earlier = await this.replay<StripeRefund>('refund', opts, fingerprint);
    if (earlier) return earlier;
    const remaining = charge.obj.amount - charge.obj.amount_refunded;
    if (!Number.isInteger(p.amountCents) || p.amountCents < 1) throw invalid('parameter_invalid_integer');
    if (p.amountCents > remaining) throw invalid('amount_too_large');
    return this.idempotent('refund', opts, fingerprint, now, async () => {
      const id = newId('re_test_');
      await this.balanceTransaction(
        pi.account,
        { amount: -p.amountCents, fee: 0, type: 'refund', source: id },
        now,
      );
      const appFee = Number(charge.meta.applicationFeeCents ?? 0);
      let feeRefunded = 0;
      if (p.refundApplicationFee && appFee > 0 && pi.account) {
        feeRefunded = Math.floor((appFee * p.amountCents) / charge.obj.amount);
        if (feeRefunded > 0)
          await this.balanceTransaction(
            null,
            { amount: -feeRefunded, fee: 0, type: 'application_fee_refund', source: newId('fr_test_') },
            now,
          );
      }
      const refunded = charge.obj.amount_refunded + p.amountCents;
      charge.obj = { ...charge.obj, amount_refunded: refunded, refunded: refunded === charge.obj.amount };
      await save(this.db, charge, now);
      const refund: StripeRefund = {
        id,
        object: 'refund',
        amount: p.amountCents,
        currency: 'usd',
        payment_intent: pi.id,
        status: 'succeeded',
        metadata: { ...p.metadata },
      };
      const stored: Stored<StripeRefund> = {
        id,
        kind: 'refund',
        account: pi.account,
        obj: { ...refund },
        meta: { charge: charge.id, applicationFeeRefunded: feeRefunded },
      };
      await this.emit('refund.created', { ...refund, charge: charge.id }, pi.account, now);
      await this.emit('charge.refunded', charge.obj, pi.account, now);
      return stored;
    });
  }

  async createTransfer(p: TransferParams, opts: RequestOptions, now: number): Promise<StripeTransfer> {
    if (opts.account) throw invalid('transfer_from_connected_account');
    if (!Number.isInteger(p.amountCents) || p.amountCents < 1) throw invalid('parameter_invalid_integer');
    if (!/^acct_[A-Za-z0-9_]+$/.test(p.destination)) throw invalid('destination_invalid');
    if (p.sourceTransaction) {
      const charge = await this.get<ChargeObj>(p.sourceTransaction, 'charge', null);
      if (p.amountCents > charge.obj.amount - charge.obj.amount_refunded) throw invalid('amount_too_large');
    }
    return this.idempotent('transfer', opts, p, now, async () => {
      const id = newId('tr_test_');
      await this.balanceTransaction(
        null,
        { amount: -p.amountCents, fee: 0, type: 'transfer', source: id },
        now,
      );
      const obj: StripeTransfer = {
        id,
        object: 'transfer',
        amount: p.amountCents,
        currency: 'usd',
        destination: p.destination,
      };
      await this.emit(
        'transfer.created',
        { ...obj, transfer_group: p.transferGroup ?? null, metadata: { ...p.metadata } },
        null,
        now,
      );
      return {
        id,
        kind: 'transfer',
        account: null,
        obj,
        meta: { transferGroup: p.transferGroup ?? null, sourceTransaction: p.sourceTransaction ?? null },
      };
    });
  }

  // Accounts.

  async createAccount(p: AccountParams, opts: RequestOptions, now: number): Promise<StripeAccount> {
    return this.idempotent('account', { idempotencyKey: opts.idempotencyKey }, p, now, async () => {
      const id = `acct_${rand(8)}`;
      const obj: StripeAccount = {
        id,
        object: 'account',
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        requirements: {
          currently_due: ['business_profile', 'external_account', 'representative', 'tos_acceptance'],
          disabled_reason: 'requirements.past_due',
        },
      };
      return { id, kind: 'account', account: null, obj, meta: { purpose: p.purpose } };
    });
  }

  async createAccountLink(
    input: { account: string; refreshUrl: string; returnUrl: string },
    now: number,
  ): Promise<StripeAccountLink> {
    const acct = await this.get<StripeAccount>(input.account, 'account', null);
    acct.meta = { ...acct.meta, returnUrl: input.returnUrl, refreshUrl: input.refreshUrl };
    await save(this.db, acct, now);
    return { object: 'account_link', url: this.url(`/dev/stripe/onboard/${acct.id}`), expires_at: now + 300 };
  }

  async completeOnboarding(
    accountId: string,
    now: number,
  ): Promise<{ account: StripeAccount; returnUrl: string | null }> {
    const acct = await this.get<StripeAccount>(accountId, 'account', null);
    acct.obj = {
      ...acct.obj,
      charges_enabled: acct.meta.purpose === 'direct_charges',
      payouts_enabled: true,
      details_submitted: true,
      requirements: { currently_due: [], disabled_reason: null },
    };
    await save(this.db, acct, now);
    // Events about a connected account itself arrive on the Connect endpoint with `account` set.
    await this.emit('account.updated', acct.obj, acct.id, now);
    return { account: acct.obj, returnUrl: (acct.meta.returnUrl as string | undefined) ?? null };
  }

  // Terminal.

  async createLocation(p: LocationParams, opts: RequestOptions, now: number): Promise<StripeLocation> {
    if (!p.displayName.trim()) throw invalid('display_name_missing');
    return this.idempotent('location', opts, p, now, async () => {
      const id = newId('tml_');
      return {
        id,
        kind: 'location',
        account: opts.account ?? null,
        obj: { id, object: 'terminal.location', display_name: p.displayName } satisfies StripeLocation,
        meta: {},
      };
    });
  }

  async registerReader(
    input: { registrationCode: string; label: string; location: string },
    opts: RequestOptions,
    now: number,
  ): Promise<StripeReader> {
    const deviceType = STANDIN_READER_CODES[input.registrationCode];
    if (!deviceType) throw invalid('terminal_reader_registration_code_invalid');
    await this.get(input.location, 'location', opts.account ?? null);
    return this.idempotent('reader', opts, input, now, async () => {
      const id = newId('tmr_');
      const obj: StripeReader = {
        id,
        object: 'terminal.reader',
        label: input.label,
        device_type: deviceType,
        status: 'online',
        location: input.location,
        action: null,
      };
      return { id, kind: 'reader', account: opts.account ?? null, obj, meta: {} };
    });
  }

  async processOnReader(
    readerId: string,
    paymentIntentId: string,
    opts: RequestOptions,
    now: number,
  ): Promise<StripeReader> {
    const reader = await this.get<StripeReader>(readerId, 'reader', opts.account ?? null);
    if (reader.obj.action?.status === 'in_progress') throw invalid('terminal_reader_busy');
    const pi = await this.get<StripePaymentIntent>(paymentIntentId, 'payment_intent', opts.account ?? null);
    if (pi.obj.status !== 'requires_payment_method') throw invalid('intent_invalid_state');
    reader.obj = {
      ...reader.obj,
      action: {
        type: 'process_payment_intent',
        status: 'in_progress',
        failure_code: null,
        failure_message: null,
        process_payment_intent: { payment_intent: pi.id },
      },
    };
    await save(this.db, reader, now);
    return reader.obj;
  }

  async cancelReaderAction(readerId: string, opts: RequestOptions, now: number): Promise<StripeReader> {
    const reader = await this.get<StripeReader>(readerId, 'reader', opts.account ?? null);
    // Stripe sends no event for cancel_action; the reader is simply reset.
    if (reader.obj.action?.status === 'in_progress') reader.obj = { ...reader.obj, action: null };
    await save(this.db, reader, now);
    return reader.obj;
  }

  async deleteReader(readerId: string, opts: RequestOptions): Promise<void> {
    await this.get(readerId, 'reader', opts.account ?? null);
    await this.db.prepare('DELETE FROM standin_stripe_objects WHERE id = ?1').bind(readerId).run();
  }

  async presentCard(
    readerId: string,
    account: string | null | undefined,
    outcome: 'success' | 'declined',
    now: number,
  ): Promise<StripeReader> {
    const reader = await this.get<StripeReader>(readerId, 'reader', account);
    const action = reader.obj.action;
    if (!action || action.status !== 'in_progress' || !action.process_payment_intent)
      throw invalid('terminal_reader_no_action');
    const pi = await this.get<StripePaymentIntent>(
      action.process_payment_intent.payment_intent,
      'payment_intent',
      reader.account,
    );
    if (outcome === 'success') {
      const intent = await this.succeedIntent(pi, 'card_present', now);
      reader.obj = { ...reader.obj, action: { ...action, status: 'succeeded' } };
      await save(this.db, reader, now);
      await this.emit('payment_intent.succeeded', intent, reader.account, now);
      await this.emit('terminal.reader.action_succeeded', reader.obj, reader.account, now);
    } else {
      reader.obj = {
        ...reader.obj,
        action: {
          ...action,
          status: 'failed',
          failure_code: 'card_declined',
          failure_message: 'The card was declined.',
        },
      };
      await save(this.db, reader, now);
      await this.emit(
        'payment_intent.payment_failed',
        { ...pi.obj, last_payment_error: { code: 'card_declined' } },
        reader.account,
        now,
      );
      await this.emit('terminal.reader.action_failed', reader.obj, reader.account, now);
    }
    return reader.obj;
  }

  async listBalanceTransactions(
    filter: { source?: string; payout?: string; limit?: number },
    opts: RequestOptions,
  ): Promise<StripeBalanceTransaction[]> {
    if (filter.payout) return [];
    const all = await listKind<StripeBalanceTransaction>(
      this.db,
      'balance_transaction',
      opts.account ?? null,
    );
    return all
      .map((s) => s.obj)
      .filter((bt) => !filter.source || bt.source === filter.source)
      .reverse()
      .slice(0, Math.min(Math.max(filter.limit ?? 10, 1), 100));
  }
}

async function standinFor(db: SqlDatabase, env: PaidEnv, options: StandinOptions): Promise<Standin> {
  if (stripeModeOf(env) !== 'standin' && options.testHarness !== true)
    throw new Error('stripe_standin_not_allowed');
  await ensureTable(db);
  return new Standin(db, env, options);
}

// ── The gateway ────────────────────────────────────────────────────────────────────────────────────────────────

export function createStandinGateway(
  db: SqlDatabase,
  env: PaidEnv,
  deliver?: StandinDelivery,
  options: Omit<StandinOptions, 'deliver'> = {},
): StripeGateway {
  if (stripeModeOf(env) !== 'standin' && options.testHarness !== true)
    throw new Error('stripe_standin_not_allowed');
  const opts: StandinOptions = { ...options, deliver };
  const clock = options.clock ?? (() => Math.floor(Date.now() / 1000));
  /** Runs one API call; events it recorded are delivered afterwards. */
  const api = async <T>(fn: (s: Standin, now: number) => Promise<T>): Promise<T> => {
    const s = await standinFor(db, env, opts);
    const result = await fn(s, clock());
    s.later();
    return result;
  };
  return {
    kind: 'standin',
    livemode: false,
    createCheckoutSession: (p, o) => api((s, now) => s.createCheckoutSession(p, o, now)),
    retrieveCheckoutSession: (id, o) =>
      api(async (s, now) => (await s.session(id, o.account ?? null, now)).obj),
    expireCheckoutSession: (id, o) => api((s, now) => s.expireCheckoutSession(id, o, now)),
    createPaymentIntent: (p, o) => api((s, now) => s.createPaymentIntent(p, o, now)),
    retrievePaymentIntent: (id, o) =>
      api(async (s) => (await s.get<StripePaymentIntent>(id, 'payment_intent', o.account ?? null)).obj),
    cancelPaymentIntent: (id, o) => api((s, now) => s.cancelPaymentIntent(id, o, now)),
    createRefund: (p, o) => api((s, now) => s.createRefund(p, o, now)),
    createTransfer: (p, o) => api((s, now) => s.createTransfer(p, o, now)),
    createAccount: (p, o) => api((s, now) => s.createAccount(p, o, now)),
    retrieveAccount: (id) => api(async (s) => (await s.get<StripeAccount>(id, 'account', null)).obj),
    createAccountLink: (input) => api((s, now) => s.createAccountLink(input, now)),
    createLocation: (p, o) => api((s, now) => s.createLocation(p, o, now)),
    registerReader: (input, o) => api((s, now) => s.registerReader(input, o, now)),
    retrieveReader: (id, o) =>
      api(async (s) => (await s.get<StripeReader>(id, 'reader', o.account ?? null)).obj),
    processPaymentIntentOnReader: (readerId, piId, o) =>
      api((s, now) => s.processOnReader(readerId, piId, o, now)),
    cancelReaderAction: (readerId, o) => api((s, now) => s.cancelReaderAction(readerId, o, now)),
    deleteReader: (readerId, o) => api((s) => s.deleteReader(readerId, o)),
    presentPaymentMethod: (readerId, o) =>
      api((s, now) => s.presentCard(readerId, o.account ?? null, 'success', now)),
    listBalanceTransactions: (filter, o) => api((s) => s.listBalanceTransactions(filter, o)),
  };
}

// ── The simulated outside world (the app's /dev/stripe pages and tests) ────────────────────────────────────────

export interface StandinCallOptions {
  deliver?: StandinDelivery;
  testHarness?: boolean;
}

export type StandinCheckoutOutcome = 'paid' | 'declined' | 'async_failed' | 'canceled' | 'expired';

/** What the local hosted page shows. Null when there is no such session. */
export async function standinCheckoutView(
  db: SqlDatabase,
  env: PaidEnv,
  sessionId: string,
  now: number,
  options: StandinCallOptions = {},
): Promise<{
  id: string;
  status: StripeCheckoutSession['status'];
  paymentStatus: StripeCheckoutSession['payment_status'];
  amountTotal: number;
  currency: string;
  lineItems: CheckoutLineItem[];
  expiresAt: number;
  connectedAccount: string | null;
  cancelUrl: string;
} | null> {
  const s = await standinFor(db, env, options);
  try {
    const session = await s.session(sessionId, undefined, now);
    const meta = session.meta as unknown as SessionMeta;
    return {
      id: session.id,
      status: session.obj.status,
      paymentStatus: session.obj.payment_status,
      amountTotal: session.obj.amount_total ?? 0,
      currency: session.obj.currency ?? 'usd',
      lineItems: meta.lineItems,
      expiresAt: session.obj.expires_at,
      connectedAccount: session.account,
      cancelUrl: meta.cancelUrl,
    };
  } catch (error) {
    if (error instanceof StripeApiError && error.status === 404) return null;
    throw error;
  } finally {
    await s.deliverPending(now);
  }
}

/**
 * The buyer's choice on the local hosted page. `paid` completes the session (`payment_intent.succeeded`,
 * `checkout.session.completed`); `declined` keeps it open (`payment_intent.payment_failed`, the buyer may try again);
 * `async_failed` completes it unpaid and then fails (`checkout.session.completed`,
 * `checkout.session.async_payment_failed`); `canceled` changes nothing (Stripe sends nothing when the buyer goes
 * back); `expired` lets the time run out (`checkout.session.expired`). Returns where the browser goes next.
 */
export async function standinCompleteCheckout(
  db: SqlDatabase,
  env: PaidEnv,
  sessionId: string,
  outcome: StandinCheckoutOutcome,
  now: number,
  options: StandinCallOptions = {},
): Promise<{ outcome: StandinCheckoutOutcome; redirectUrl: string; session: StripeCheckoutSession }> {
  const s = await standinFor(db, env, options);
  const session = await s.session(sessionId, undefined, now);
  const meta = session.meta as unknown as SessionMeta;
  const success = meta.successUrl.replace('{CHECKOUT_SESSION_ID}', session.id);
  if (session.obj.status !== 'open') {
    await s.deliverPending(now);
    return {
      outcome: session.obj.status === 'expired' ? 'expired' : outcome,
      redirectUrl: session.obj.status === 'complete' ? success : meta.cancelUrl,
      session: session.obj,
    };
  }
  const intentFor = async (): Promise<Stored<StripePaymentIntent>> => {
    if (session.obj.payment_intent)
      return s.get<StripePaymentIntent>(session.obj.payment_intent, 'payment_intent', session.account);
    const pi = s.newIntent(
      {
        amount: session.obj.amount_total ?? 0,
        metadata: meta.intentMetadata,
        applicationFeeCents: meta.applicationFeeCents,
        transferGroup: meta.transferGroup,
        cardPresent: false,
      },
      session.account,
    );
    await save(db, pi, now);
    session.obj = { ...session.obj, payment_intent: pi.id };
    return pi;
  };
  let redirectUrl = meta.cancelUrl;
  if (outcome === 'paid') {
    const pi = await intentFor();
    const intent = await s.succeedIntent(pi, 'online', now);
    session.obj = { ...session.obj, status: 'complete', payment_status: 'paid', url: null };
    await save(db, session, now);
    await s.emit('payment_intent.succeeded', intent, session.account, now);
    await s.emit('checkout.session.completed', session.obj, session.account, now);
    redirectUrl = success;
  } else if (outcome === 'declined') {
    const pi = await intentFor();
    await save(db, session, now);
    await s.emit(
      'payment_intent.payment_failed',
      { ...pi.obj, last_payment_error: { code: 'card_declined' } },
      session.account,
      now,
    );
    redirectUrl = session.obj.url ?? meta.cancelUrl;
  } else if (outcome === 'async_failed') {
    const pi = await intentFor();
    session.obj = { ...session.obj, status: 'complete', payment_status: 'unpaid', url: null };
    await save(db, session, now);
    await s.emit('checkout.session.completed', session.obj, session.account, now);
    await s.emit(
      'payment_intent.payment_failed',
      { ...pi.obj, last_payment_error: { code: 'payment_method_failed' } },
      session.account,
      now,
    );
    await s.emit('checkout.session.async_payment_failed', session.obj, session.account, now);
    redirectUrl = success;
  } else if (outcome === 'expired') {
    await s.expireSession(session, now);
  }
  await s.deliverPending(now);
  return { outcome, redirectUrl, session: session.obj };
}

/** The local onboarding page: the account becomes ready and `account.updated` is sent. */
export async function standinCompleteOnboarding(
  db: SqlDatabase,
  env: PaidEnv,
  accountId: string,
  now: number,
  options: StandinCallOptions = {},
): Promise<{ account: StripeAccount; returnUrl: string | null }> {
  const s = await standinFor(db, env, options);
  const result = await s.completeOnboarding(accountId, now);
  await s.deliverPending(now);
  return result;
}

/** A simulated card on a reader that is processing a payment: approved, or declined. */
export async function standinPresentCard(
  db: SqlDatabase,
  env: PaidEnv,
  readerId: string,
  outcome: 'success' | 'declined',
  now: number,
  options: StandinCallOptions = {},
): Promise<StripeReader> {
  const s = await standinFor(db, env, options);
  const reader = await s.presentCard(readerId, undefined, outcome, now);
  await s.deliverPending(now);
  return reader;
}

/** Opens a dispute on a paid PaymentIntent (`charge.dispute.created`). */
export async function standinOpenDispute(
  db: SqlDatabase,
  env: PaidEnv,
  paymentIntentId: string,
  now: number,
  options: StandinCallOptions = {},
): Promise<{ disputeId: string; amount: number }> {
  const s = await standinFor(db, env, options);
  const pi = await s.get<StripePaymentIntent>(paymentIntentId, 'payment_intent', undefined);
  if (pi.obj.status !== 'succeeded' || !pi.obj.latest_charge) throw invalid('charge_not_disputable');
  const charge = await s.get<ChargeObj>(pi.obj.latest_charge, 'charge', pi.account);
  const id = newId('du_test_');
  const dispute = {
    id,
    object: 'dispute',
    amount: charge.obj.amount,
    currency: 'usd',
    charge: charge.id,
    payment_intent: pi.id,
    reason: 'fraudulent',
    status: 'needs_response',
    created: now,
    livemode: false,
  };
  await save(db, { id, kind: 'dispute', account: pi.account, obj: dispute, meta: {} }, now);
  await s.balanceTransaction(
    pi.account,
    { amount: -dispute.amount, fee: STANDIN_DISPUTE_FEE_CENTS, type: 'adjustment', source: id },
    now,
  );
  await s.emit('charge.dispute.created', dispute, pi.account, now);
  await s.deliverPending(now);
  return { disputeId: id, amount: dispute.amount };
}

/** Closes a stand-in dispute (`charge.dispute.closed`); a won dispute returns the money. */
export async function standinCloseDispute(
  db: SqlDatabase,
  env: PaidEnv,
  disputeId: string,
  outcome: 'won' | 'lost',
  now: number,
  options: StandinCallOptions = {},
): Promise<void> {
  const s = await standinFor(db, env, options);
  const d = await s.get<Record<string, unknown>>(disputeId, 'dispute', undefined);
  if (d.obj.status === 'won' || d.obj.status === 'lost') throw invalid('dispute_closed');
  d.obj = { ...d.obj, status: outcome };
  await save(db, d, now);
  if (outcome === 'won')
    await s.balanceTransaction(
      d.account,
      { amount: Number(d.obj.amount), fee: 0, type: 'adjustment', source: disputeId },
      now,
    );
  await s.emit('charge.dispute.closed', d.obj, d.account, now);
  await s.deliverPending(now);
}

/** Delivers every recorded event not yet accepted (oldest first). */
export async function standinDeliverPending(
  db: SqlDatabase,
  env: PaidEnv,
  now: number,
  options: StandinCallOptions = {},
): Promise<{ delivered: number; pending: number }> {
  const s = await standinFor(db, env, options);
  return s.deliverPending(now);
}

/** The recorded events, oldest first (the local developer page and tests). */
export async function standinEvents(
  db: SqlDatabase,
  env: PaidEnv,
  options: StandinCallOptions = {},
): Promise<
  {
    id: string;
    type: string;
    endpoint: 'platform' | 'connect';
    account: string | null;
    delivered: boolean;
    body: string;
  }[]
> {
  await standinFor(db, env, options);
  const rows = await allRows<{ id: string; kind: Kind; account: string | null; data: string }>(db, {
    sql: "SELECT id, kind, account, data FROM standin_stripe_objects WHERE kind IN ('event', 'event_delivered') ORDER BY rowid",
    params: [],
  });
  return rows.map((row) => {
    const obj = (
      JSON.parse(row.data) as { obj: { body: string; type: string; endpoint: 'platform' | 'connect' } }
    ).obj;
    return {
      id: row.id,
      type: obj.type,
      endpoint: obj.endpoint,
      account: row.account,
      delivered: row.kind === 'event_delivered',
      body: obj.body,
    };
  });
}
