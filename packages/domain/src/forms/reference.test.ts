import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1 } from '@gamo/db/testing';
import {
  allocateReference,
  counterUpsertSpec,
  formatReference,
  referenceCounterKey,
  referencePrefixFor,
  referenceYear,
} from './reference.ts';
import { runBatch } from '../security/sql-database.ts';

const DEC_31_2026 = Date.UTC(2026, 11, 31, 23, 59, 59) / 1000;
const JAN_1_2027 = Date.UTC(2027, 0, 1, 0, 0, 0) / 1000;

test('prefix per program and UTC year', () => {
  assert.equal(referencePrefixFor('worship'), 'GW');
  assert.equal(referencePrefixFor('production'), 'GP');
  assert.equal(referencePrefixFor('web'), 'GS');
  assert.equal(referencePrefixFor('academy'), 'GA');
  assert.equal(referenceYear(DEC_31_2026), 2026);
  assert.equal(referenceYear(JAN_1_2027), 2027);
  assert.equal(referenceCounterKey('worship', JAN_1_2027), 'GW-2027');
});

test('formatReference pads to four digits and grows past 9999', () => {
  assert.equal(formatReference('GW-2026', 1), 'GW-2026-0001');
  assert.equal(formatReference('GW-2026', 42), 'GW-2026-0042');
  assert.equal(formatReference('GW-2026', 12345), 'GW-2026-12345');
  assert.throws(() => formatReference('GW-2026', 0), RangeError);
});

test('allocateReference is sequential per prefix and year, and restarts on 1 January (UTC)', async () => {
  const db = await createMigratedD1();
  assert.equal(await allocateReference(db, 'worship', DEC_31_2026), 'GW-2026-0001');
  assert.equal(await allocateReference(db, 'worship', DEC_31_2026), 'GW-2026-0002');
  assert.equal(await allocateReference(db, 'production', DEC_31_2026), 'GP-2026-0001');
  assert.equal(await allocateReference(db, 'worship', JAN_1_2027), 'GW-2027-0001');
  assert.equal(await allocateReference(db, 'worship', DEC_31_2026), 'GW-2026-0003');
});

test('a guarded upsert claims nothing when its condition is false', async () => {
  const db = await createMigratedD1();
  await runBatch(db, [counterUpsertSpec('GW-2026', { sql: '1 = 0', params: [] })]);
  const none = db.sqlite.prepare('SELECT count(*) AS c FROM form_reference_counters').get() as { c: number };
  assert.equal(none.c, 0);
  assert.equal(await allocateReference(db, 'worship', DEC_31_2026), 'GW-2026-0001');
});
