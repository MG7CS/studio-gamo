import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRequestFromSubmission,
  getRequest,
  listRequests,
  setRequestStatus,
  WorshipError,
} from './index.ts';
import { all, get, newDb, NOW, requestBinds, run, seedSubmission } from './test-support.ts';

const staffId = 'staff_1';
const rejects = (promise: Promise<unknown>, code: string) =>
  assert.rejects(promise, (e) => e instanceof WorshipError && e.code === code);

test('creates one request from the binds; a second call returns the same row', async () => {
  const d1 = await newDb();
  const submissionId = seedSubmission(d1, {
    kind: 'church_request',
    program: 'worship',
    binds: requestBinds(),
  });
  const request = await createRequestFromSubmission(d1, { submissionId, now: NOW });
  assert.equal(request.churchName, 'Grace Community Church');
  assert.equal(request.contactName, 'Pastor Sam Lee');
  assert.equal(request.contactEmail, 'pastor@grace.example.org');
  assert.equal(request.contactPhone, '555-0200');
  assert.equal(request.serviceDate, '2030-03-24');
  assert.equal(request.startTime, '10:00');
  assert.equal(request.address, '12 Main St, Phoenix, AZ 85001');
  assert.deepEqual(request.rolesNeeded, ['Drums', 'Bass']);
  assert.equal(request.status, 'new');
  assert.equal(request.program, 'worship');
  assert.equal(request.createdAt, NOW);

  const again = await createRequestFromSubmission(d1, { submissionId, now: NOW + 500 });
  assert.equal(again.id, request.id);
  assert.equal(again.createdAt, NOW);
  assert.equal(get(d1, 'SELECT COUNT(*) AS n FROM service_requests')!.n, 1);
});

test('production requests use the production program; optional binds may be missing', async () => {
  const d1 = await newDb();
  const submissionId = seedSubmission(d1, {
    kind: 'production_request',
    program: 'production',
    binds: {
      'request.church_name': 'Hope Chapel',
      'contact.email': 'hope@example.org',
      'request.date': '2030-04-01',
      'request.roles_needed': 'Sound, Lights',
    },
  });
  const request = await createRequestFromSubmission(d1, { submissionId, now: NOW });
  assert.equal(request.program, 'production');
  assert.equal(request.contactName, null);
  assert.equal(request.startTime, null);
  assert.equal(request.address, null);
  assert.deepEqual(request.rolesNeeded, ['Sound', 'Lights']);
});

test('refuses other form kinds, unknown submissions and invalid binds', async () => {
  const d1 = await newDb();
  const app = seedSubmission(d1, {
    kind: 'musician_application',
    program: 'worship',
    binds: { 'contact.email': 'a@example.org' },
  });
  await rejects(createRequestFromSubmission(d1, { submissionId: app, now: NOW }), 'NOT_A_REQUEST');
  await rejects(createRequestFromSubmission(d1, { submissionId: 'nope', now: NOW }), 'NOT_FOUND');
  for (const bad of [
    { 'request.date': '2030-02-30' },
    { 'request.date': 'tomorrow' },
    { 'request.start_time': '25:00' },
    { 'contact.email': 'nope' },
    { 'request.church_name': '  ' },
  ]) {
    const id = seedSubmission(d1, { kind: 'church_request', program: 'worship', binds: requestBinds(bad) });
    await rejects(createRequestFromSubmission(d1, { submissionId: id, now: NOW }), 'INVALID_INPUT');
  }
  assert.equal(get(d1, 'SELECT COUNT(*) AS n FROM service_requests')!.n, 0);
});

async function makeRequests(d1: Awaited<ReturnType<typeof newDb>>) {
  const ids: string[] = [];
  for (const [date, church, status] of [
    ['2030-05-02', 'C', 'new'],
    ['2030-04-02', 'A', 'new'],
    ['2030-04-02', 'B', 'matching'],
    ['2030-06-02', 'D', 'cancelled'],
  ] as const) {
    const s = seedSubmission(d1, {
      kind: 'church_request',
      program: 'worship',
      binds: requestBinds({ 'request.date': date, 'request.church_name': church }),
    });
    const r = await createRequestFromSubmission(d1, { submissionId: s, now: NOW });
    run(d1, 'UPDATE service_requests SET status = ? WHERE id = ?', status, r.id);
    ids.push(r.id);
  }
  return ids;
}

test('listRequests: filters by status and date, orders by service date then id, keyset pages', async () => {
  const d1 = await newDb();
  await makeRequests(d1);
  const churches = async (f: Parameters<typeof listRequests>[1]) =>
    (await listRequests(d1, f)).requests.map((r) => r.churchName);
  const sorted = await churches({});
  assert.equal(sorted.length, 4);
  assert.deepEqual(sorted.slice(2), ['C', 'D']);
  assert.deepEqual((await churches({ status: 'new' })).sort(), ['A', 'C']);
  assert.deepEqual((await churches({ status: ['matching', 'cancelled'] })).sort(), ['B', 'D']);
  assert.deepEqual(await churches({ fromDate: '2030-05-01', toDate: '2030-05-31' }), ['C']);
  assert.deepEqual(await churches({ program: 'production' }), []);
  await assert.rejects(listRequests(d1, { fromDate: 'x' }), (e) => e instanceof WorshipError);

  const seen: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await listRequests(d1, { limit: 3, cursor });
    seen.push(...page.requests.map((r) => r.churchName));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  assert.deepEqual(seen, sorted);
});

test('getRequest: returns offers without token hashes; null when unknown', async () => {
  const d1 = await newDb();
  const [id] = await makeRequests(d1);
  assert.equal(await getRequest(d1, 'nope'), null);
  const detail = await getRequest(d1, id!);
  assert.deepEqual(detail!.offers, []);
  assert.equal(detail!.churchName, 'C');
});

test('setRequestStatus: staff may reopen, complete a confirmed request or cancel (withdrawing pending offers)', async () => {
  const d1 = await newDb();
  const [id] = await makeRequests(d1);
  await rejects(
    setRequestStatus(d1, { requestId: id!, status: 'confirmed' as never, staffId, now: NOW }),
    'INVALID_INPUT',
  );
  await rejects(
    setRequestStatus(d1, { requestId: id!, status: 'completed', staffId, now: NOW }),
    'INVALID_STATE',
  );
  await rejects(
    setRequestStatus(d1, { requestId: 'nope', status: 'matching', staffId, now: NOW }),
    'NOT_FOUND',
  );
  assert.equal(
    (await setRequestStatus(d1, { requestId: id!, status: 'matching', staffId, now: NOW })).status,
    'matching',
  );
  run(d1, 'UPDATE service_requests SET status = ? WHERE id = ?', 'confirmed', id!);
  assert.equal(
    (await setRequestStatus(d1, { requestId: id!, status: 'completed', staffId, now: NOW })).status,
    'completed',
  );
  await rejects(
    setRequestStatus(d1, { requestId: id!, status: 'cancelled', staffId, now: NOW }),
    'INVALID_STATE',
  );
  assert.equal(all(d1, "SELECT id FROM audit_logs WHERE action = 'request.status_changed'").length, 2);
});
