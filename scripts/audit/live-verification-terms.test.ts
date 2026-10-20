/** The Organization area's verification card (O9) and the Organizer Terms page. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { organizationVerificationView, sellingChecklist } from '../../packages/domain/index.ts';
import {
  meetingLink,
  requestVerificationAction,
  verificationCardView,
} from '../../apps/live/src/lib/verification-page.ts';
import {
  acceptOrganizerTerms,
  organizerTermsView,
  runAcceptTerms,
} from '../../apps/live/src/lib/terms-page.ts';
import { runOrganizationAction } from '../../apps/live/src/lib/organization-page.ts';
import { ENV, NOW, formOf, paidSetup } from './live-paid-fixtures.ts';

test('only plain https meeting links become links', () => {
  assert.equal(meetingLink(' https://meet.example.org/abc '), 'https://meet.example.org/abc');
  assert.equal(meetingLink('http://meet.example.org'), null);
  assert.equal(meetingLink('javascript:alert(1)'), null);
  assert.equal(meetingLink('https://user:pw@meet.example.org'), null);
  assert.equal(meetingLink('Grace Hall, room 2'), null);
});

test('an owner requests verification once; a member cannot; the card shows where it stands', async () => {
  const { d1, db, seeded } = await paidSetup({ verified: false });
  d1.sqlite.exec(`
    INSERT INTO organizers (id, clerk_user_id, email, display_name) VALUES ('usr_m', 'clerk_m', 'member@example.org', 'Member');
    INSERT INTO memberships (organization_id, organizer_id, role) VALUES ('${seeded.organizationId}', 'usr_m', 'member');
  `);
  const base = { db, env: ENV, organizationId: seeded.organizationId, now: NOW };
  const member = await requestVerificationAction({ ...base, organizerId: 'usr_m' });
  assert.equal(member.tone, 'error');
  const first = await requestVerificationAction({ ...base, organizerId: seeded.organizerId });
  assert.equal(first.tone, 'info');
  assert.match(first.text, /Verification requested/);
  assert.equal((await verificationCardView(db, seeded.organizationId)).status, 'requested');
  const again = await requestVerificationAction({ ...base, organizerId: seeded.organizerId });
  assert.match(again.text, /already requested or done/);
  assert.equal((await organizationVerificationView(db, seeded.organizationId)).canRequest, false);
});

test('the Organization page posts the request through its one action', async () => {
  const { db, seeded } = await paidSetup({ verified: false });
  const out = await runOrganizationAction({
    live: { db, env: ENV } as never,
    organizer: {
      id: seeded.organizerId,
      email: 'owner1@example.org',
      displayName: 'Owner 1',
      timezone: null,
    },
    active: { organizationId: seeded.organizationId, name: 'Grace Church 1', role: 'owner' } as never,
    form: formOf({ action: 'request_verification' }),
    origin: 'https://live.example.org',
    now: NOW,
  });
  assert.equal(out.notice?.tone, 'info');
});

test('organizer terms: the current version, accepted once by an owner, never by a member', async () => {
  const { d1, db, seeded } = await paidSetup();
  d1.sqlite.exec(`
    DELETE FROM terms_acceptances;
    INSERT INTO organizers (id, clerk_user_id, email, display_name) VALUES ('usr_m', 'clerk_m', 'member@example.org', 'Member');
    INSERT INTO memberships (organization_id, organizer_id, role) VALUES ('${seeded.organizationId}', 'usr_m', 'member');
  `);
  const ids = { organizationId: seeded.organizationId, organizerId: seeded.organizerId };
  let view = await organizerTermsView(db, ids);
  assert.equal(view.acceptedAt, null);
  assert.equal(view.ownerAccepted, false);
  assert.equal(view.path, '/legal/organizer-terms');
  assert.equal((await sellingChecklist(db, ENV, seeded.organizationId)).termsAccepted.ok, false);
  const unticked = await runAcceptTerms({ db, ...ids, isOwner: true, form: formOf({}), now: NOW });
  assert.equal(unticked.kind, 'error');
  const asMember = await acceptOrganizerTerms(db, {
    organizationId: seeded.organizationId,
    organizerId: 'usr_m',
    now: NOW,
  });
  assert.equal(asMember.accepted, false);
  assert.equal(
    (
      await runAcceptTerms({
        db,
        organizationId: seeded.organizationId,
        organizerId: 'usr_m',
        isOwner: false,
        form: formOf({ agree: 'yes' }),
        now: NOW,
      })
    ).kind,
    'error',
  );
  assert.deepEqual(
    await runAcceptTerms({ db, ...ids, isOwner: true, form: formOf({ agree: 'yes' }), now: NOW }),
    {
      kind: 'done',
      flash: 'accepted',
    },
  );
  assert.equal((await acceptOrganizerTerms(db, { ...ids, now: NOW + 5 })).accepted, true);
  view = await organizerTermsView(db, ids);
  assert.equal(view.acceptedAt, NOW);
  assert.equal(view.ownerAccepted, true);
  assert.equal((await sellingChecklist(db, ENV, seeded.organizationId)).termsAccepted.ok, true);
});
