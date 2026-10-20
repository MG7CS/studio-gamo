import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getOrganizerEvent, listMemberships } from '@gamo/domain';
import { loadDoorTab, permissionsText, runDoorTabAction } from './door-tab';
import { doorOpenDrawer } from './door-sell';
import { NOW, doorFixture, formOf } from './door-testing';

async function setup(options: { available?: boolean } = {}) {
  const fx = await doorFixture(options);
  const [owner] = await listMemberships(fx.db, fx.seed.organizerId);
  const member = { ...owner, role: 'member' as const };
  const event = (await getOrganizerEvent(fx.db, fx.seed.organizationId, fx.seed.eventId, NOW))!;
  return { fx, owner, member, event };
}

test('permissions read as words', () => {
  assert.equal(permissionsText({ checkIn: true, sell: true, comp: false }), 'Check in · Sell');
});

test('creating a link shows its address and PIN once; the list never holds them', async () => {
  const { fx, owner, event } = await setup();
  const result = await runDoorTabAction(fx.deps, {
    active: owner,
    organizerId: fx.seed.organizerId,
    event,
    form: formOf([
      ['action', 'create-link'],
      ['label', ' North   door '],
      ['permissions', 'check_in'],
      ['permissions', 'sell'],
    ]),
    now: NOW,
  });
  assert.equal(result.kind, 'render');
  const created = result.kind === 'render' ? result.state.created! : null;
  assert.equal(created?.label, 'North door');
  assert.match(created?.url ?? '', /^https:\/\/live\.example\/door\/[A-Za-z0-9_-]{43}$/);
  assert.match(created?.pin ?? '', /^\d{6}$/);
  assert.equal(created?.permissions, 'Check in · Sell');
  const view = await loadDoorTab(fx.deps, owner, event, NOW);
  assert.equal(view.links.length, 1);
  assert.equal(view.links[0].state, 'active');
  assert.equal(JSON.stringify(view).includes(created!.pin), false);
});

test('link errors are tied to their field and keep what was typed', async () => {
  const { fx, owner, event } = await setup();
  const none = await runDoorTabAction(fx.deps, {
    active: owner,
    organizerId: fx.seed.organizerId,
    event,
    form: formOf([
      ['action', 'create-link'],
      ['label', 'Side door'],
    ]),
    now: NOW,
  });
  assert.equal(none.kind === 'render' && Boolean(none.state.linkErrors?.permissions), true);
  assert.deepEqual(none.kind === 'render' && none.state.linkValues, { label: 'Side door', permissions: [] });
  const compOnly = await runDoorTabAction(fx.deps, {
    active: owner,
    organizerId: fx.seed.organizerId,
    event,
    form: formOf([
      ['action', 'create-link'],
      ['label', ''],
      ['permissions', 'comp'],
    ]),
    now: NOW,
  });
  assert.ok(compOnly.kind === 'render' && compOnly.state.linkErrors?.label);
});

test('turning a link off redirects with a flash; a second time says it already was', async () => {
  const { fx, owner, event } = await setup();
  fx.staff({ checkIn: true }, 'stf_x');
  const run = () =>
    runDoorTabAction(fx.deps, {
      active: owner,
      organizerId: fx.seed.organizerId,
      event,
      form: formOf([
        ['action', 'revoke-link'],
        ['link', 'stf_x'],
      ]),
      now: NOW,
    });
  assert.deepEqual(await run(), {
    kind: 'redirect',
    location: `/organizer/events/${fx.seed.eventId}/door#links`,
    flash: 'door-ok-link-revoked',
  });
  assert.equal(((await run()) as { flash: string }).flash, 'door-ok-link-already-revoked');
});

test('readers: owners pair (status asked on load), members may not pair or remove', async () => {
  const { fx, owner, member, event } = await setup();
  const pairForm = formOf([
    ['action', 'pair-reader'],
    ['label', 'Box office'],
    ['registrationCode', 'simulated-wpe'],
    ['line1', '1 Main St'],
    ['city', 'Phoenix'],
    ['state', 'AZ'],
    ['postalCode', '85001'],
  ]);
  const denied = await runDoorTabAction(fx.deps, {
    active: member,
    organizerId: 'usr_1',
    event,
    form: pairForm,
    now: NOW,
  });
  assert.equal(denied.kind, 'render');
  assert.match(denied.kind === 'render' ? (denied.state.pairErrors?.form ?? '') : '', /owner/);
  const paired = await runDoorTabAction(fx.deps, {
    active: owner,
    organizerId: 'usr_1',
    event,
    form: pairForm,
    now: NOW,
  });
  assert.equal(paired.kind === 'redirect' && paired.flash, 'door-ok-reader-paired');
  const view = await loadDoorTab(fx.deps, owner, event, NOW);
  assert.equal(view.readers.length, 1);
  assert.equal(view.readers[0].status, 'online');
  assert.equal(view.readers[0].stale, false);
  assert.ok(fx.fake.calls.some((c) => c.method === 'retrieveReader'));
  const removeForm = formOf([
    ['action', 'remove-reader'],
    ['reader', view.readers[0].id],
  ]);
  const notOwner = await runDoorTabAction(fx.deps, {
    active: member,
    organizerId: 'usr_1',
    event,
    form: removeForm,
    now: NOW,
  });
  assert.equal(notOwner.kind === 'redirect' && notOwner.flash, 'door-e-forbidden.owner');
  const removed = await runDoorTabAction(fx.deps, {
    active: owner,
    organizerId: 'usr_1',
    event,
    form: removeForm,
    now: NOW,
  });
  assert.equal(removed.kind === 'redirect' && removed.flash, 'door-ok-reader-removed');
});

test('a bad address is tied to its field; without card payments pairing says why', async () => {
  const { fx, owner, event } = await setup();
  const bad = await runDoorTabAction(fx.deps, {
    active: owner,
    organizerId: 'usr_1',
    event,
    form: formOf([
      ['action', 'pair-reader'],
      ['label', 'Box office'],
      ['registrationCode', 'simulated-wpe'],
      ['line1', '1 Main St'],
      ['city', 'Phoenix'],
      ['state', 'Arizona'],
      ['postalCode', '85001'],
    ]),
    now: NOW,
  });
  assert.ok(bad.kind === 'render' && bad.state.pairErrors?.state);
  const off = await setup({ available: false });
  const view = await loadDoorTab(off.fx.deps, off.owner, off.event, NOW);
  assert.match(view.pairUnavailable ?? '', /card payments are ready/);
});

test('the tab lists dates with their door screens and every cash drawer with its numbers', async () => {
  const { fx, owner, event } = await setup();
  await doorOpenDrawer(fx.deps, fx.organizer, { float: '75', now: NOW });
  const view = await loadDoorTab(fx.deps, owner, event, NOW);
  assert.deepEqual(
    view.dates.map((d) => d.href),
    [`/organizer/door/${fx.seed.occurrenceId}`],
  );
  assert.equal(view.drawers.length, 1);
  assert.equal(view.drawers[0].open, true);
  assert.equal(view.drawers[0].float, '$75.00');
  assert.equal(view.drawers[0].expected, '$75.00');
  assert.equal(view.drawers[0].difference, null);
  assert.equal(view.isOwner, true);
});
