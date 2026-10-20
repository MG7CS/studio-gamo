import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseOccurrence,
  maskEmail,
  orderedErrors,
  partyLimitFor,
  partySelectMax,
  registerAvailability,
  validateRegisterForm,
  waitPhrase,
  type RegisterDateOption,
} from './register-form.ts';

const dates: RegisterDateOption[] = [
  { id: 'occ_a', label: 'Fri', seatsLeft: 0 },
  { id: 'occ_b', label: 'Sat', seatsLeft: 3 },
  { id: 'occ_c', label: 'Sun', seatsLeft: null },
];
const form = (entries: Record<string, string>) => new Map(Object.entries(entries));

test('chooseOccurrence prefers the requested date when it has room, ignores unknown or full ones', () => {
  assert.equal(chooseOccurrence(dates, 'occ_c'), 'occ_c');
  assert.equal(chooseOccurrence(dates, 'occ_a', 'occ_b'), 'occ_b');
  assert.equal(chooseOccurrence(dates, 'nope', null), 'occ_b');
  assert.equal(chooseOccurrence([{ id: 'x', label: 'x', seatsLeft: 0 }], 'x'), 'x');
  assert.equal(chooseOccurrence([], 'x'), '');
});

test('party limits follow the event limit and the seats left', () => {
  assert.equal(partyLimitFor(6, dates[1]), 3);
  assert.equal(partyLimitFor(6, dates[2]), 6);
  assert.equal(partyLimitFor(6, dates[0]), 0);
  assert.equal(partySelectMax(6, dates), 6);
  assert.equal(partySelectMax(6, [dates[0]]), 1);
});

test('validateRegisterForm reports every problem at once, in form order', () => {
  const result = validateRegisterForm(form({ name: ' ', email: 'not-an-email', partySize: '9' }), {
    options: dates,
    maxParty: 6,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(
    orderedErrors(result.errors).map((e) => e.field),
    ['occurrence', 'name', 'email', 'partySize', 'consent'],
  );
});

test('validateRegisterForm: a good submission passes and keeps the chosen date', () => {
  const result = validateRegisterForm(
    form({
      name: 'Ada Lovelace',
      email: 'ada@example.org',
      partySize: '3',
      occurrence: 'occ_b',
      consent: 'yes',
    }),
    { options: dates, maxParty: 6 },
  );
  assert.equal(result.ok, true);
  assert.equal(result.occurrenceId, 'occ_b');
  assert.equal(result.values.partySize, '3');
});

test('validateRegisterForm: too many people for the seats left, and a full date', () => {
  const base = { name: 'Ada', email: 'ada@example.org', consent: 'yes' };
  const tooMany = validateRegisterForm(form({ ...base, occurrence: 'occ_b', partySize: '4' }), {
    options: dates,
    maxParty: 6,
  });
  assert.equal(tooMany.errors.partySize, 'Only 3 seats are left for that date.');
  const full = validateRegisterForm(form({ ...base, occurrence: 'occ_a', partySize: '1' }), {
    options: dates,
    maxParty: 6,
  });
  assert.equal(full.errors.occurrence, 'That date is full. Choose another date.');
});

test('validateRegisterForm: a single date needs no date field and an invented id is replaced', () => {
  const one = [dates[2]];
  const result = validateRegisterForm(
    form({ name: 'Ada', email: 'ada@example.org', partySize: '1', occurrence: 'forged', consent: 'yes' }),
    { options: one, maxParty: 4 },
  );
  assert.equal(result.ok, true);
  assert.equal(result.occurrenceId, 'occ_c');
  const forged = validateRegisterForm(
    form({ name: 'Ada', email: 'ada@example.org', partySize: '1', occurrence: 'forged', consent: 'yes' }),
    { options: dates, maxParty: 4 },
  );
  assert.equal(forged.errors.occurrence, 'Choose one of the dates.');
});

test('maskEmail and waitPhrase', () => {
  assert.equal(maskEmail('jane@example.org'), 'j•••@example.org');
  assert.equal(maskEmail('nonsense'), '');
  assert.equal(waitPhrase(30), 'about 1 minute');
  assert.equal(waitPhrase(721), 'about 13 minutes');
  assert.equal(waitPhrase(3 * 3600), 'about 3 hours');
  assert.equal(waitPhrase(undefined), 'about 1 minute');
});

test('registerAvailability explains why the form is not shown', () => {
  const open = [{ id: 'a', label: 'x', seatsLeft: 2 }];
  assert.deepEqual(registerAvailability({ eventStatus: 'approved', options: open }), { state: 'open' });
  assert.equal(registerAvailability({ eventStatus: 'canceled', options: open }).state, 'closed');
  assert.equal(registerAvailability({ eventStatus: 'approved', options: [] }).state, 'closed');
  assert.equal(
    registerAvailability({ eventStatus: 'approved', options: [{ id: 'a', label: 'x', seatsLeft: 0 }] }).state,
    'full',
  );
});
