/** The Tickets tab of a paid event: types, deadlines, codes and comps through `runTicketsAction` (O2). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PaidError, listTicketTypes } from '../../packages/domain/index.ts';
import {
  TICKETS_FLASH,
  allFieldErrors,
  compErrors,
  localFields,
  readCompForm,
  readTypeForm,
  runTicketsAction,
  ticketSetupView,
  typeValuesOf,
  zonedField,
} from '../../apps/live/src/lib/ticket-setup.ts';
import { ENV, NOW, formOf, paidSetup } from './live-paid-fixtures.ts';

const TZ = 'America/Phoenix';

async function setup() {
  const s = await paidSetup();
  const run = (entries: Array<[string, string]> | Record<string, string>) =>
    runTicketsAction({
      db: s.db,
      env: ENV,
      organizationId: s.seeded.organizationId,
      eventId: s.seeded.eventId,
      timeZone: TZ,
      origin: 'https://live.example.org',
      form: formOf(entries),
      now: NOW,
    });
  return { ...s, run };
}

test('every field error at once, by replacing each failing field until the validator passes', () => {
  const calls: string[] = [];
  const errors = allFieldErrors(
    (v: { a: string; b: string; c: string }) => {
      calls.push(JSON.stringify(v));
      if (v.a !== 'ok') throw new PaidError('invalid', { detail: 'a' });
      if (v.b !== 'ok') throw new PaidError('invalid', { detail: 'b' });
      return true;
    },
    { a: 'x', b: 'y', c: 'z' },
    { a: { field: 'a', message: 'A is wrong' }, b: { field: 'b', message: 'B is wrong' } },
    { a: 'ok', b: 'ok' },
  );
  assert.deepEqual(errors, { a: 'A is wrong', b: 'B is wrong' });
  assert.equal(calls.length, 3);
  assert.throws(() =>
    allFieldErrors(
      () => {
        throw new Error('boom');
      },
      {},
      {},
      {},
    ),
  );
});

test('dates typed in the venue zone round-trip; half-typed dates are errors', () => {
  const at = zonedField('2026-12-05', '19:30', TZ);
  assert.equal(typeof at, 'number');
  assert.deepEqual(localFields(at, TZ), { date: '2026-12-05', time: '19:30' });
  assert.equal(zonedField('', '', TZ), null);
  assert.ok(Number.isNaN(zonedField('', '10:00', TZ)));
  assert.ok(Number.isNaN(zonedField('2026-13-01', '', TZ)));
  assert.deepEqual(localFields(null, TZ), { date: '', time: '' });
});

test('a quick start fills the kind, people per ticket and the name when none is typed', () => {
  const v = readTypeForm(formOf({ quick: '4', price: '40', capacity: '' }));
  assert.equal(v.kind, 'group');
  assert.equal(v.peoplePerTicket, '4');
  assert.equal(v.name, 'Family pack (4 people)');
  assert.equal(readTypeForm(formOf({ quick: '1', name: 'Front rows', price: '60' })).name, 'Front rows');
  assert.equal(readTypeForm(formOf({ name: 'Plain', price: '1' })).kind, '');
});

test('adding, editing (status kept), hiding, ending and deleting ticket types', async () => {
  const { db, seeded, run } = await setup();
  const bad = await run({ action: 'add_type', quick: '0', price: 'ten', capacity: '-3' });
  assert.equal(bad.kind, 'errors');
  assert.deepEqual(Object.keys(bad.kind === 'errors' ? bad.errors : {}).sort(), ['capacity', 'price']);
  assert.deepEqual(await run({ action: 'add_type', quick: '3', price: '12.50', capacity: '30' }), {
    kind: 'done',
    flash: 'type-added',
  });
  const student = (await listTicketTypes(db, seeded.organizationId, seeded.eventId)).find(
    (t) => t.kind === 'student',
  )!;
  assert.equal(student.priceCents, 1250);
  assert.equal(
    await run({ action: 'type_status', id: student.id, status: 'hidden' }).then((r) => r.kind),
    'done',
  );
  // Editing posts the current status, so saving never puts a hidden type back on sale.
  const values = typeValuesOf({ ...student, status: 'hidden' }, TZ);
  const edit = await run({
    action: 'save_type',
    id: student.id,
    status: 'hidden',
    ...Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, typeof v === 'boolean' ? (v ? 'yes' : '') : v]),
    ),
    price: '15',
  });
  assert.deepEqual(edit, { kind: 'done', flash: 'type-saved' });
  const after = (await listTicketTypes(db, seeded.organizationId, seeded.eventId)).find(
    (t) => t.id === student.id,
  )!;
  assert.equal(after.status, 'hidden');
  assert.equal(after.priceCents, 1500);
  assert.deepEqual(await run({ action: 'type_status', id: student.id, status: 'ended' }), {
    kind: 'done',
    flash: 'type-ended',
  });
  assert.deepEqual(await run({ action: 'delete_type', id: student.id }), {
    kind: 'done',
    flash: 'type-deleted',
  });
  for (const key of ['type-added', 'type-saved', 'type-ended', 'type-deleted']) assert.ok(TICKETS_FLASH[key]);
});

test('a ticket type with orders cannot be deleted, and its capacity cannot drop below what is sold', async () => {
  const { seeded, run, buy } = await setup();
  await buy('ruth@example.org', 3);
  const del = await run({ action: 'delete_type', id: seeded.generalTypeId });
  assert.equal(del.kind, 'errors');
  assert.match(del.kind === 'errors' ? (del.notice ?? '') : '', /End its sales instead/);
  const shrink = await run({
    action: 'save_type',
    id: seeded.generalTypeId,
    name: 'General',
    price: '20',
    capacity: '2',
  });
  assert.equal(shrink.kind, 'errors');
  assert.match(shrink.kind === 'errors' ? shrink.errors.capacity : '', /already sold or held/);
});

test('price deadlines: added in the venue zone, refused in the past, removed', async () => {
  const { db, seeded, run } = await setup();
  const past = await run({
    action: 'add_deadline',
    id: seeded.generalTypeId,
    price: '15',
    endsDate: '2020-01-01',
  });
  assert.equal(past.kind, 'errors');
  const date = localFields(NOW + 7 * 86_400, TZ).date;
  assert.deepEqual(
    await run({
      action: 'add_deadline',
      id: seeded.generalTypeId,
      price: '15',
      endsDate: date,
      endsTime: '23:59',
    }),
    { kind: 'done', flash: 'deadline-added' },
  );
  const type = (await listTicketTypes(db, seeded.organizationId, seeded.eventId)).find(
    (t) => t.id === seeded.generalTypeId,
  )!;
  assert.equal(type.deadlines.length, 1);
  assert.equal(type.deadlines[0].priceCents, 1500);
  assert.deepEqual(await run({ action: 'remove_deadline', id: type.deadlines[0].id }), {
    kind: 'done',
    flash: 'deadline-removed',
  });
});

test('codes: field errors tied to fields, a code used twice is refused, turning off and on', async () => {
  const { db, seeded, run } = await setup();
  const bad = await run({
    action: 'create_code',
    code: 'x',
    kind: 'promo',
    discountKind: 'percent',
    percentOff: '10',
  });
  assert.equal(bad.kind, 'errors');
  assert.ok(bad.kind === 'errors' && bad.errors.code);
  assert.deepEqual(
    await run({
      action: 'create_code',
      code: 'early10',
      kind: 'promo',
      discountKind: 'percent',
      percentOff: '10',
    }),
    { kind: 'done', flash: 'code-created' },
  );
  const again = await run({
    action: 'create_code',
    code: 'EARLY10',
    kind: 'promo',
    discountKind: 'amount',
    amountOff: '5',
  });
  assert.match(again.kind === 'errors' ? again.errors.code : '', /already has that code/);
  const access = await run([
    ['action', 'create_code'],
    ['code', 'PRESALE'],
    ['kind', 'access'],
  ]);
  assert.match(access.kind === 'errors' ? access.errors.ticketTypeIds : '', /at least one ticket type/);
  const view = await ticketSetupView(db, { organizationId: seeded.organizationId, eventId: seeded.eventId });
  assert.equal(view.codes.length, 1);
  assert.deepEqual(await run({ action: 'code_status', id: view.codes[0].id, status: 'disabled' }), {
    kind: 'done',
    flash: 'code-disabled',
  });
  assert.deepEqual(await run({ action: 'code_status', id: view.codes[0].id, status: 'active' }), {
    kind: 'done',
    flash: 'code-enabled',
  });
});

test('comp tickets need a date, a quantity and a reason; issued ones are a paid comp order', async () => {
  const { db, seeded, run } = await setup();
  assert.deepEqual(Object.keys(compErrors(readCompForm(formOf({ email: 'nope' })))).sort(), [
    'email',
    'occurrence',
    'quantities',
    'reason',
  ]);
  const done = await run({
    action: 'issue_comp',
    occurrence: seeded.occurrenceId,
    [`qty_${seeded.generalTypeId}`]: '2',
    reason: 'Volunteers',
    name: 'Volunteer Lead',
  });
  assert.deepEqual(done, { kind: 'done', flash: 'comp-issued' });
  const view = await ticketSetupView(db, { organizationId: seeded.organizationId, eventId: seeded.eventId });
  assert.equal(view.ordersByType[seeded.generalTypeId], 1);
  const emailed = await run({
    action: 'issue_comp',
    occurrence: seeded.occurrenceId,
    [`qty_${seeded.vipTypeId}`]: '1',
    reason: 'Guest speaker',
    email: 'speaker@example.org',
  });
  // The tickets are emailed with the order link built from the Live origin (the local email service logs it).
  assert.deepEqual(emailed, { kind: 'done', flash: 'comp-issued-emailed' });
});
