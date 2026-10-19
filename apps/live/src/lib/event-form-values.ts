/**
 * Flat field map for the organizer event form: from a posted form (after a failed save) or from the
 * stored event (edit page). Field names match `parseEventForm` and `EventForm.astro`.
 */
import { eventEditorValues, loadPolicy } from '@gamo/domain';
import type { SqlDatabase } from '@gamo/domain/security';

export function valuesFromForm(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  const methods: string[] = [];
  for (const [k, v] of form.entries()) {
    if (typeof v !== 'string') continue;
    if (k === 'policy.doorSalesMethods') methods.push(v);
    else out[k] = v;
  }
  out['policy.doorSalesMethods'] = methods.join(',');
  return out;
}

export async function valuesFromEvent(db: SqlDatabase, eventId: string) {
  const editor = await eventEditorValues(db, eventId);
  if (!editor) return null;
  const { event, start, end, categories } = editor;
  const policy = await loadPolicy(db, eventId);
  const values: Record<string, string> = {
    organizationId: '',
    title: event.title,
    tagline: event.tagline ?? '',
    category: event.category,
    description: event.description,
    timezone: event.timezone,
    startDate: start.date,
    startTime: start.time,
    endDate: end?.date ?? '',
    endTime: end?.time ?? '',
    venueName: event.venue_name,
    address: event.address ?? '',
    city: event.city,
    state: event.state,
    admissionType: event.admission_type,
    'policy.refundPolicy': policy.refundPolicy,
    'policy.transferAllowed': String(policy.transferAllowed),
    'policy.transferCutoffHours': String(policy.transferCutoffHours),
    'policy.maxTransfersPerTicket': String(policy.maxTransfersPerTicket),
    'policy.reentryAllowed': String(policy.reentryAllowed),
    'policy.reentryLimit': policy.reentryLimit === null ? '' : String(policy.reentryLimit),
    'policy.attendeeNamesRequired': String(policy.attendeeNamesRequired),
    'policy.maxTicketsPerOrder': String(policy.maxTicketsPerOrder),
    'policy.agePolicy': policy.agePolicy,
    'policy.minAge': policy.minAge === null ? '' : String(policy.minAge),
    'policy.scanOpensMinutesBefore': String(policy.scanOpensMinutesBefore),
    'policy.doorSalesEnabled': String(policy.doorSalesEnabled),
    'policy.doorSalesMethods': policy.doorSalesMethods.join(','),
  };
  const reserved: Record<number, number> = {};
  categories.forEach((c, i) => {
    const p = (n: string, val: string) => (values[`cat.${i}.${n}`] = val);
    p('id', c.id);
    p('name', c.name);
    p('kind', c.kind);
    p('description', c.description);
    p('price', c.price);
    p('capacity', c.capacity);
    p('perOrderLimit', c.perOrderLimit);
    p('maxAge', c.maxAge);
    p('seatsPerTicket', c.seatsPerTicket === '1' ? '' : c.seatsPerTicket);
    p('validDays', c.validDays);
    p('salesStartDate', c.salesStart?.date ?? '');
    p('salesStartTime', c.salesStart?.time ?? '');
    p('salesEndDate', c.salesEnd?.date ?? '');
    p('salesEndTime', c.salesEnd?.time ?? '');
    p('companionOf', c.companionOf);
    p('status', c.status);
    reserved[i] = c.reserved;
  });
  return { event, values, reserved };
}
