import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventDatesView, eventPermissions } from './event-page-view.ts';

test('what an event allows depends on its status, and nothing while the organization is suspended', () => {
  const p = (status: string, active = true) => eventPermissions(status, active);
  assert.deepEqual(p('draft'), { canSubmit: true, canEdit: true, canCancel: false, canDelete: true });
  assert.deepEqual(p('pending_review'), {
    canSubmit: false,
    canEdit: true,
    canCancel: false,
    canDelete: true,
  });
  assert.deepEqual(p('changes_requested'), {
    canSubmit: true,
    canEdit: true,
    canCancel: false,
    canDelete: true,
  });
  assert.deepEqual(p('rejected'), { canSubmit: true, canEdit: true, canCancel: false, canDelete: true });
  assert.deepEqual(p('published'), { canSubmit: false, canEdit: true, canCancel: true, canDelete: false });
  assert.deepEqual(p('canceled'), { canSubmit: false, canEdit: false, canCancel: false, canDelete: false });
  assert.deepEqual(p('hidden'), { canSubmit: false, canEdit: false, canCancel: false, canDelete: false });
  for (const status of ['draft', 'published', 'pending_review'])
    assert.deepEqual(
      p(status, false),
      { canSubmit: false, canEdit: false, canCancel: false, canDelete: false },
      status,
    );
});

const NOW = Date.UTC(2026, 9, 20, 12) / 1000;
const occ = (id: string, iso: string, people = 0) => ({
  id,
  startsAt: Date.parse(`${iso}T19:00:00-07:00`) / 1000,
  endsAt: null,
  canceled: false,
  confirmedPeople: people,
});

test('the dates view opens on the next date, names the chosen day and lists its date ids', () => {
  const event = {
    admission: 'free_registration',
    occurrences: [occ('o1', '2026-10-25', 4), occ('o2', '2026-10-25'), occ('o3', '2026-11-01')],
  } as never;
  const view = eventDatesView({
    event,
    timeZone: 'America/Phoenix',
    now: NOW,
    params: new URLSearchParams(),
  });
  assert.equal(view.chosenDate, '2026-10-25');
  assert.equal(view.chosenLabel, 'Sun, Oct 25, 2026');
  assert.deepEqual(view.selectedIds, ['o1', 'o2']);
  const cell = view.model.weeks!.flat().find((c) => c.iso === '2026-10-25')!;
  assert.equal(cell.data!.items[0].detail, '4 registered');
  const other = eventDatesView({
    event,
    timeZone: 'America/Phoenix',
    now: NOW,
    params: new URLSearchParams('month=2026-11&date=2026-11-01'),
  });
  assert.deepEqual(other.selectedIds, ['o3']);
  assert.ok(other.model.nextHref === undefined || other.model.nextHref.endsWith('#calendar'));
});

test('registrations are not mentioned for events that do not take them', () => {
  const event = { admission: 'free_open', occurrences: [occ('o1', '2026-10-25', 4)] } as never;
  const view = eventDatesView({
    event,
    timeZone: 'America/Phoenix',
    now: NOW,
    params: new URLSearchParams(),
  });
  const cell = view.model.weeks!.flat().find((c) => c.iso === '2026-10-25')!;
  assert.equal(cell.data!.items[0].detail, undefined);
});
