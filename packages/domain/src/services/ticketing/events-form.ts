/**
 * Reads the organizer event form (plain HTML form post) into `EventInput`.
 * Field names: top-level (`title`, `startDate`, `startTime`, `timezone` …), `policy.<field>` and
 * `cat.<n>.<field>`. Rows without a name, capacity or id are ignored by the validator.
 */
import type { CategoryInput, EventInput } from './events.ts';
import { MAX_CATEGORIES } from './events.ts';

type Getter = { get(name: string): FormDataEntryValue | null; getAll(name: string): FormDataEntryValue[] };

const str = (g: Getter, name: string): string => {
  const v = g.get(name);
  return typeof v === 'string' ? v : '';
};

/** `cat.<n>.<field>` rows present in the form, in order. */
export function categoryRowCount(entries: Iterable<[string, unknown]>): number {
  let max = -1;
  for (const [k] of entries) {
    const m = /^cat\.(\d{1,2})\./.exec(k);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return Math.min(MAX_CATEGORIES, max + 1);
}

export function parseEventForm(form: FormData): EventInput {
  const rows = categoryRowCount(form.entries());
  const categories: CategoryInput[] = [];
  for (let i = 0; i < rows; i++) {
    const f = (name: string) => str(form, `cat.${i}.${name}`);
    const when = (prefix: string) => {
      const date = f(`${prefix}Date`);
      return date ? { date, time: f(`${prefix}Time`) } : null;
    };
    categories.push({
      id: f('id') || null,
      name: f('name'),
      kind: f('kind') || 'general',
      description: f('description'),
      price: f('price'),
      capacity: f('capacity'),
      perOrderLimit: f('perOrderLimit') || null,
      maxAge: f('maxAge') || null,
      seatsPerTicket: f('seatsPerTicket') || null,
      validDays: f('validDays') || null,
      salesStart: when('salesStart'),
      salesEnd: when('salesEnd'),
      companionOf: f('companionOf') || null,
      status: f('status') || 'active',
    });
  }
  const p = (name: string) => str(form, `policy.${name}`);
  return {
    organizationId: str(form, 'organizationId'),
    title: str(form, 'title'),
    category: str(form, 'category'),
    tagline: str(form, 'tagline'),
    description: str(form, 'description'),
    venueName: str(form, 'venueName'),
    address: str(form, 'address'),
    city: str(form, 'city'),
    state: str(form, 'state'),
    timezone: str(form, 'timezone'),
    start: { date: str(form, 'startDate'), time: str(form, 'startTime') },
    end: str(form, 'endDate') ? { date: str(form, 'endDate'), time: str(form, 'endTime') } : null,
    admissionType: str(form, 'admissionType'),
    categories,
    policy: {
      reentryAllowed: p('reentryAllowed'),
      reentryLimit: p('reentryLimit'),
      refundPolicy: p('refundPolicy'),
      transferAllowed: p('transferAllowed'),
      transferCutoffHours: p('transferCutoffHours'),
      maxTransfersPerTicket: p('maxTransfersPerTicket'),
      attendeeNamesRequired: p('attendeeNamesRequired'),
      maxTicketsPerOrder: p('maxTicketsPerOrder'),
      doorSalesEnabled: p('doorSalesEnabled'),
      doorSalesMethods: form
        .getAll('policy.doorSalesMethods')
        .filter((v): v is string => typeof v === 'string'),
      agePolicy: p('agePolicy'),
      minAge: p('minAge'),
      scanOpensMinutesBefore: p('scanOpensMinutesBefore'),
    },
  };
}
