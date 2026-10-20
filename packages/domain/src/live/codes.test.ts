import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  codeUnlocks,
  createEventCode,
  discountOf,
  findUsableCode,
  listEventCodes,
  normalizeCode,
  setEventCodeStatus,
  validateCodeForm,
} from './codes.ts';
import { PAID_NOW, paidTestDatabase, seedPaidEvent } from './paid-testing.ts';
import { PaidError } from './paid-types.ts';

const TYPES = ['tty_general_1', 'tty_vip_1'];
const detailOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof PaidError);
    return e.detail;
  }
  return null;
};

test('normalizeCode: trimmed, upper case, no inner spaces', () => {
  assert.equal(normalizeCode('  grace 10 '), 'GRACE10');
  assert.equal(normalizeCode(''), null);
  assert.equal(normalizeCode(null), null);
});

test('validateCodeForm: promo percent or amount, access codes name hidden types', () => {
  const pct = validateCodeForm(
    { code: 'grace10', kind: 'promo', discountKind: 'percent', percentOff: '10' },
    TYPES,
  );
  assert.deepEqual([pct.code, pct.percentOff, pct.ticketTypeIds, pct.maxUses], ['GRACE10', 10, null, null]);
  const amt = validateCodeForm(
    {
      code: 'FIVE',
      kind: 'promo',
      discountKind: 'amount',
      amountOff: '5',
      ticketTypeIds: ['tty_vip_1'],
      maxUses: '3',
    },
    TYPES,
  );
  assert.deepEqual([amt.amountOffCents, amt.ticketTypeIds, amt.maxUses], [500, ['tty_vip_1'], 3]);
  const access = validateCodeForm(
    { code: 'PRESALE', kind: 'access', ticketTypeIds: ['tty_vip_1', 'tty_vip_1'] },
    TYPES,
  );
  assert.deepEqual([access.discountKind, access.ticketTypeIds], [null, ['tty_vip_1']]);
  assert.equal(
    detailOf(() => validateCodeForm({ code: 'AB', kind: 'promo' }, TYPES)),
    'code',
  );
  assert.equal(
    detailOf(() => validateCodeForm({ code: 'A$B1', kind: 'promo' }, TYPES)),
    'code',
  );
  assert.equal(
    detailOf(() => validateCodeForm({ code: 'ABC', kind: 'gift' }, TYPES)),
    'kind',
  );
  assert.equal(
    detailOf(() =>
      validateCodeForm({ code: 'ABC', kind: 'promo', discountKind: 'percent', percentOff: '101' }, TYPES),
    ),
    'percent_off',
  );
  assert.equal(
    detailOf(() =>
      validateCodeForm({ code: 'ABC', kind: 'promo', discountKind: 'amount', amountOff: '0' }, TYPES),
    ),
    'amount_off',
  );
  assert.equal(
    detailOf(() => validateCodeForm({ code: 'ABC', kind: 'promo' }, TYPES)),
    'discount_kind',
  );
  assert.equal(
    detailOf(() => validateCodeForm({ code: 'ABC', kind: 'access' }, TYPES)),
    'ticket_type_ids',
  );
  assert.equal(
    detailOf(() => validateCodeForm({ code: 'ABC', kind: 'access', ticketTypeIds: ['tty_other'] }, TYPES)),
    'ticket_type_ids',
  );
  assert.equal(
    detailOf(() =>
      validateCodeForm({ code: 'ABC', kind: 'access', ticketTypeIds: TYPES, maxUses: '0' }, TYPES),
    ),
    'max_uses',
  );
  assert.equal(
    detailOf(() =>
      validateCodeForm({ code: 'ABC', kind: 'access', ticketTypeIds: TYPES, startsAt: 5, endsAt: 5 }, TYPES),
    ),
    'ends_at',
  );
});

test('discountOf and codeUnlocks', () => {
  const base = {
    id: 'cod_1',
    eventId: 'evt_1',
    code: 'X',
    maxUses: null,
    uses: 0,
    startsAt: null,
    endsAt: null,
    status: 'active' as const,
  };
  assert.deepEqual(
    discountOf({
      ...base,
      kind: 'promo',
      discountKind: 'percent',
      percentOff: 10,
      amountOffCents: null,
      ticketTypeIds: null,
    }),
    { kind: 'percent', percentOff: 10, amountOffCents: null, ticketTypeIds: null },
  );
  const access = {
    ...base,
    kind: 'access' as const,
    discountKind: null,
    percentOff: null,
    amountOffCents: null,
    ticketTypeIds: ['tty_vip_1'],
  };
  assert.equal(discountOf(access), null);
  assert.equal(discountOf(null), null);
  assert.equal(codeUnlocks(access, 'tty_vip_1'), true);
  assert.equal(codeUnlocks(access, 'tty_general_1'), false);
  assert.equal(codeUnlocks(null, 'tty_vip_1'), false);
});

test('create, find, disable and list codes', async () => {
  const { d1, db } = await paidTestDatabase();
  seedPaidEvent(d1);
  seedPaidEvent(d1, {}, '2');
  const c = await createEventCode(db, {
    organizationId: 'org_1',
    eventId: 'evt_1',
    form: {
      code: 'grace10',
      kind: 'promo',
      discountKind: 'percent',
      percentOff: '10',
      startsAt: PAID_NOW,
      endsAt: PAID_NOW + 100,
    },
    now: PAID_NOW,
  });
  await assert.rejects(
    createEventCode(db, {
      organizationId: 'org_1',
      eventId: 'evt_1',
      form: { code: 'GRACE10', kind: 'promo', discountKind: 'percent', percentOff: '5' },
      now: PAID_NOW,
    }),
    (e: PaidError) => e.detail === 'code_taken',
  );
  await assert.rejects(
    createEventCode(db, {
      organizationId: 'org_2',
      eventId: 'evt_1',
      form: { code: 'MINE', kind: 'promo', discountKind: 'percent', percentOff: '5' },
      now: PAID_NOW,
    }),
    (e: PaidError) => e.code === 'not_found',
  );
  assert.equal((await findUsableCode(db, 'evt_1', ' grace10 ', PAID_NOW))?.id, c.id);
  assert.equal(await findUsableCode(db, 'evt_1', '', PAID_NOW), null);
  for (const [code, now] of [
    ['GRACE10', PAID_NOW - 1],
    ['GRACE10', PAID_NOW + 100],
    ['OTHER', PAID_NOW],
  ] as const)
    await assert.rejects(findUsableCode(db, 'evt_1', code, now), (e: PaidError) => e.code === 'code_invalid');
  // Another event's code does not work here.
  await assert.rejects(
    findUsableCode(db, 'evt_2', 'GRACE10', PAID_NOW),
    (e: PaidError) => e.code === 'code_invalid',
  );
  await setEventCodeStatus(db, { organizationId: 'org_1', codeId: c.id, status: 'disabled' });
  await assert.rejects(
    findUsableCode(db, 'evt_1', 'GRACE10', PAID_NOW),
    (e: PaidError) => e.code === 'code_invalid',
  );
  await assert.rejects(
    setEventCodeStatus(db, { organizationId: 'org_2', codeId: c.id, status: 'active' }),
    (e: PaidError) => e.code === 'not_found',
  );
  d1.sqlite.exec(`UPDATE event_codes SET status = 'active', max_uses = 2, uses = 2 WHERE id = '${c.id}'`);
  await assert.rejects(
    findUsableCode(db, 'evt_1', 'GRACE10', PAID_NOW),
    (e: PaidError) => e.code === 'code_used_up',
  );
  assert.deepEqual(
    (await listEventCodes(db, 'org_1', 'evt_1')).map((x) => x.code),
    ['GRACE10'],
  );
  assert.deepEqual(await listEventCodes(db, 'org_2', 'evt_1'), []);
});
