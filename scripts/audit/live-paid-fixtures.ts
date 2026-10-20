/** Shared set-up for the Live organizer paid-ticketing tests: a database, a paid event and real orders. */
import assert from 'node:assert/strict';
import {
  issueCompOrder,
  paymentsRuntime,
  standinCompleteCheckout,
  startOnlineCheckout,
  type FundsFlow,
} from '../../packages/domain/index.ts';
import {
  PAID_ENV,
  paidTestDatabase,
  seedPaidEvent,
  type SeedPaidEventOptions,
} from '../../packages/domain/src/live/paid-testing.ts';

/** Webhooks run on the real clock, so tests use it too (the event starts 30 days from now). */
export const NOW = Math.floor(Date.now() / 1000);
export const ENV = PAID_ENV;

export async function paidSetup(options: SeedPaidEventOptions & { flow?: FundsFlow } = {}) {
  const { d1, db } = await paidTestDatabase();
  const seeded = seedPaidEvent(d1, {
    flow: 'organizer_account',
    startsAt: NOW + 30 * 86_400,
    ...options,
  });
  const runtime = paymentsRuntime(db, PAID_ENV);
  /** A card order through the real checkout and the local stand-in; `pay` false leaves it waiting. */
  const buy = async (email: string, quantity = 2, pay = true) => {
    const resolved = await runtime.routingForOrganization(seeded.organizationId);
    assert.ok(resolved.available, 'card sales available');
    const started = await startOnlineCheckout(db, PAID_ENV, {
      input: {
        eventId: seeded.eventId,
        occurrenceId: seeded.occurrenceId,
        lines: [{ ticketTypeId: seeded.generalTypeId, quantity }],
        buyerName: 'Ruth Buyer',
        buyerEmail: email,
        now: NOW,
      },
      routing: resolved.routing,
      origin: 'https://live.example.org',
      eventTitle: 'Gospel Night 1',
      now: NOW,
    });
    assert.equal(started.kind, 'redirect');
    if (pay && started.kind === 'redirect') {
      const sessionId = new URL(started.url, 'https://x.test').pathname.split('/').pop()!;
      await standinCompleteCheckout(db, PAID_ENV, sessionId, 'paid', NOW);
    }
    return started.orderId;
  };
  const comp = async (quantity = 1, email: string | null = 'comp@example.org') =>
    (
      await issueCompOrder(db, PAID_ENV, {
        organizationId: seeded.organizationId,
        eventId: seeded.eventId,
        occurrenceId: seeded.occurrenceId,
        lines: [{ ticketTypeId: seeded.generalTypeId, quantity }],
        compReason: 'Worship team',
        buyerName: 'Comp Guest',
        buyerEmail: email,
        now: NOW,
      })
    ).orderId;
  return { d1, db, seeded, runtime, buy, comp };
}

/** A form from plain pairs (repeated keys allowed). */
export function formOf(entries: Array<[string, string]> | Record<string, string>): FormData {
  const form = new FormData();
  for (const [k, v] of Array.isArray(entries) ? entries : Object.entries(entries)) form.append(k, v);
  return form;
}
