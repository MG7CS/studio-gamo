import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inviteAvailability, isOnlyOwner, joinedLabel } from './organization-page.ts';

test('invitations are offered only when they can work, and the reason is plain', () => {
  const base = { suspended: false, firstEventApproved: true, openInvitations: 0 };
  assert.deepEqual(inviteAvailability(base), { state: 'ready', slotsLeft: 20 });
  assert.equal(inviteAvailability({ ...base, openInvitations: 19 }).state, 'ready');
  assert.equal(inviteAvailability({ ...base, openInvitations: 20 }).state, 'limit');
  assert.equal(inviteAvailability({ ...base, firstEventApproved: false }).state, 'not_ready');
  assert.equal(
    inviteAvailability({ ...base, suspended: true, firstEventApproved: false }).state,
    'suspended',
    'suspension is the first reason',
  );
});

test('the only owner cannot leave; with two owners either can', () => {
  const m = (id: string, role: 'owner' | 'member') => ({ organizerId: id, role });
  assert.equal(isOnlyOwner([m('a', 'owner'), m('b', 'member')], 'a'), true);
  assert.equal(isOnlyOwner([m('a', 'owner'), m('b', 'member')], 'b'), false);
  assert.equal(isOnlyOwner([m('a', 'owner'), m('b', 'owner')], 'a'), false);
});

test('the joined date is written in plain words, and is empty when unknown', () => {
  assert.equal(joinedLabel(Date.UTC(2026, 9, 19, 23) / 1000), 'Joined Oct 19, 2026');
  assert.equal(joinedLabel(0), '');
});
