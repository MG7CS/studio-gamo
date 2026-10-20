/**
 * Test fixtures for the door libraries (used only by `door-*.test.ts`, never by pages): an in-memory Live database
 * with a paid event whose date's check-in is open, a fake payments runtime that records its calls (no network), and
 * door access for an organizer or a staff actor.
 */
import {
  PAID_ENV,
  PAID_NOW,
  paidTestDatabase,
  seedPaidEvent,
  type SeededPaidEvent,
} from '../../../../packages/domain/src/live/paid-testing.ts';
import type {
  LiveEmail,
  PaymentRouting,
  PaymentsRuntime,
  StaffActor,
  StaffPermissions,
  StripeGateway,
} from '@gamo/domain';
import { organizerDoorAccess, type DoorAccess } from './door-access';
import type { DoorDeps } from './door-sell';

export { PAID_ENV, PAID_NOW };
export const NOW = PAID_NOW;

export interface Call {
  method: string;
  args: unknown[];
}

/** A recording routing and gateway on `accountId`; `available: false` makes card sales unavailable. */
export function fakeRuntime(
  accountId: string | null,
  options: { available?: boolean; livemode?: boolean } = {},
) {
  const calls: Call[] = [];
  let n = 0;
  let flushes = 0;
  const gateway = {
    kind: 'standin',
    livemode: options.livemode ?? false,
    async processPaymentIntentOnReader(readerId: string, piId: string) {
      calls.push({ method: 'processPaymentIntentOnReader', args: [readerId, piId] });
      return { id: readerId, object: 'terminal.reader', action: { status: 'in_progress' } };
    },
    async cancelReaderAction(readerId: string) {
      calls.push({ method: 'cancelReaderAction', args: [readerId] });
      return { id: readerId };
    },
    async cancelPaymentIntent(id: string) {
      calls.push({ method: 'cancelPaymentIntent', args: [id] });
      return { id, status: 'canceled' };
    },
    async retrievePaymentIntent(id: string) {
      return { id, status: 'canceled' };
    },
    async presentPaymentMethod(readerId: string) {
      calls.push({ method: 'presentPaymentMethod', args: [readerId] });
      return { id: readerId };
    },
    async retrieveCheckoutSession(id: string) {
      calls.push({ method: 'retrieveCheckoutSession', args: [id] });
      return { id, object: 'checkout.session', url: `https://checkout.example/${id}`, status: 'open' };
    },
    async retrieveReader(id: string) {
      calls.push({ method: 'retrieveReader', args: [id] });
      return { id, object: 'terminal.reader', status: 'online', device_type: 'simulated_wisepos_e' };
    },
    async deleteReader(id: string) {
      calls.push({ method: 'deleteReader', args: [id] });
    },
    async createLocation() {
      calls.push({ method: 'createLocation', args: [] });
      return { id: `tml_stripe_${++n}`, object: 'terminal.location' };
    },
    async registerReader(input: { label: string }) {
      calls.push({ method: 'registerReader', args: [input.label] });
      return {
        id: `tmr_${++n}`,
        object: 'terminal.reader',
        status: 'online',
        device_type: 'simulated_wisepos_e',
      };
    },
  } as unknown as StripeGateway;
  const routing: PaymentRouting = {
    flow: 'organizer_account',
    seller: 'organization',
    chargeAccountId: accountId,
    gateway,
    async createCheckout(input) {
      calls.push({ method: 'createCheckout', args: [input] });
      return {
        id: `cs_test_${++n}`,
        object: 'checkout.session',
        url: `https://checkout.example/cs_test_${n}`,
        status: 'open',
        payment_status: 'unpaid',
        amount_total: input.lines.reduce((s, l) => s + l.unitAmountCents * l.quantity, 0),
        currency: 'usd',
        client_reference_id: input.orderId,
        payment_intent: null,
        expires_at: input.expiresAt,
        metadata: { order_id: input.orderId },
        livemode: false,
      };
    },
    async expireCheckout(sessionId) {
      calls.push({ method: 'expireCheckout', args: [sessionId] });
    },
    async createCardPresentPayment(input) {
      calls.push({ method: 'createCardPresentPayment', args: [input] });
      return {
        id: `pi_test_${++n}`,
        object: 'payment_intent',
        amount: input.amountCents,
        amount_received: 0,
        currency: 'usd',
        status: 'requires_payment_method',
        latest_charge: null,
        metadata: { order_id: input.orderId },
        livemode: false,
      };
    },
    async refund(input) {
      calls.push({ method: 'refund', args: [input] });
      return {
        id: `re_test_${++n}`,
        object: 'refund',
        amount: input.amountCents,
        currency: 'usd',
        payment_intent: input.paymentIntentId,
        status: 'succeeded',
        metadata: {},
      };
    },
  };
  const available = options.available ?? true;
  const runtime: DoorDeps['runtime'] = {
    standin: true,
    gateway: () => (available ? gateway : null),
    routingForOrganization: (async () =>
      available
        ? { available: true, routing }
        : {
            available: false,
            reason: 'mode_not_chosen',
            flow: null,
          }) as PaymentsRuntime['routingForOrganization'],
    routingForOrder: (async () =>
      available
        ? { available: true, routing }
        : { available: false, reason: 'stripe_not_configured' }) as PaymentsRuntime['routingForOrder'],
    async flush() {
      flushes += 1;
    },
  };
  return { runtime, routing, calls, flushes: () => flushes };
}

export interface DoorFixture {
  d1: Awaited<ReturnType<typeof paidTestDatabase>>['d1'];
  db: DoorDeps['db'];
  seed: SeededPaidEvent;
  deps: DoorDeps;
  fake: ReturnType<typeof fakeRuntime>;
  emails: LiveEmail[];
  /** Door access for the organization's owner. */
  organizer: DoorAccess;
  /** Door access for a staff link with these permissions (inserted directly; no token). */
  staff(perms: Partial<StaffPermissions>, id?: string): DoorAccess;
}

/** A paid event whose only date starts in one hour (check-in open, door sales on), and its owner's door. */
export async function doorFixture(
  options: { available?: boolean; startsAt?: number; failEmail?: boolean; doorSalesEnabled?: boolean } = {},
): Promise<DoorFixture> {
  const { d1, db } = await paidTestDatabase();
  const seed = seedPaidEvent(d1, {
    flow: 'organizer_account',
    startsAt: options.startsAt ?? NOW + 3600,
    doorSalesEnabled: options.doorSalesEnabled,
  });
  d1.sqlite.exec(`UPDATE payment_settings SET door_sales_enabled = 1 WHERE id = 1;`);
  const fake = fakeRuntime(seed.connectedAccountId, { available: options.available });
  const emails: LiveEmail[] = [];
  const deps: DoorDeps = {
    db,
    env: PAID_ENV,
    runtime: fake.runtime,
    origin: 'https://live.example',
    async sendEmail(email) {
      if (options.failEmail) throw new Error('down');
      emails.push(email);
    },
  };
  const organizer = await organizerDoorAccess(db, {
    organizerId: seed.organizerId,
    organizationId: seed.organizationId,
    occurrenceId: seed.occurrenceId,
  });
  if (!organizer) throw new Error('fixture: no organizer access');
  const staff = (perms: Partial<StaffPermissions>, id = 'stf_test'): DoorAccess => {
    const permissions = { checkIn: false, sell: false, comp: false, ...perms };
    d1.sqlite.exec(`
      INSERT OR IGNORE INTO staff_links (id, organization_id, event_id, label, token_hash, pin_hash, pin_salt, can_check_in, can_sell, can_comp, expires_at)
        VALUES ('${id}', '${seed.organizationId}', '${seed.eventId}', 'Door ${id}', 'h_${id}', 'p', 's',
                ${permissions.checkIn ? 1 : 0}, ${permissions.sell ? 1 : 0}, ${permissions.comp ? 1 : 0}, ${NOW + 90 * 86_400});
    `);
    const actor: StaffActor = {
      kind: 'staff',
      staffLinkId: id,
      organizationId: seed.organizationId,
      scopeId: seed.eventId,
      label: `Door ${id}`,
      permissions,
    };
    return {
      ...organizer,
      actor,
      organizer: false,
      staffLabel: actor.label,
      basePath: `/door/token/${seed.occurrenceId}`,
    };
  };
  return { d1, db, seed, deps, fake, emails, organizer, staff };
}

/** Builds a form from pairs (repeated names allowed). */
export function formOf(entries: Array<[string, string]>): FormData {
  const form = new FormData();
  for (const [k, v] of entries) form.append(k, v);
  return form;
}
