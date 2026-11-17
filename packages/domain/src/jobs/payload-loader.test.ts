import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRetryRenderer, renderEmail, EMAIL_KINDS, type EmailKind } from '../email/registry.ts';
import {
  approveApplication,
  createRequestFromSubmission,
  declineApplication,
  respondToOffer,
  sendOffer,
  withdrawOffer,
  type WorshipEnv,
} from '../worship/index.ts';
import {
  all,
  ENV,
  fakeResend,
  get,
  musicianBinds,
  newDb,
  NOW,
  requestBinds,
  run,
  seedSubmission,
} from '../worship/test-support.ts';
import { createPayloadLoader } from './payload-loader.ts';

const staffId = 'staff_1';
const ORIGIN = 'https://gamostudio.org';
const tokenOf = (url: string) => url.slice(url.lastIndexOf('/') + 1);
const INSTRUCTIONS = 'Make checks payable to Gamo Studios.';

type Db = Awaited<ReturnType<typeof newDb>>;

/** Loads a payload and proves it also validates and renders (what the retry job does next). */
async function loadRendered(d1: Db, kind: EmailKind, id: string, env: WorshipEnv = ENV) {
  const payload = (await createPayloadLoader(d1, env).load(kind, id, null)) as Record<string, unknown> | null;
  if (payload) renderEmail(kind, payload);
  return payload;
}

async function scenario() {
  const d1 = await newDb();
  const r = fakeResend();
  const apply = (name: string, email: string) => {
    const submissionId = seedSubmission(d1, {
      kind: 'musician_application',
      program: 'worship',
      binds: musicianBinds({ 'contact.name': name, 'contact.email': email, 'roster.roles': ['Drums'] }),
    });
    return approveApplication(d1, ENV, { submissionId, staffId, now: NOW }, r.options).then((m) => ({
      memberId: m.id,
      submissionId,
    }));
  };
  const ana = await apply('Ana Reyes', 'ana@example.org');
  const ben = await apply('Ben Brooks', 'ben@example.org');
  const request = await createRequestFromSubmission(d1, {
    submissionId: seedSubmission(d1, { kind: 'church_request', program: 'worship', binds: requestBinds() }),
    now: NOW,
  });
  const offer = (memberId: string) =>
    sendOffer(
      d1,
      ENV,
      {
        requestId: request.id,
        rosterMemberId: memberId,
        role: 'Drums',
        payCents: 15_000,
        staffId,
        siteOrigin: ORIGIN,
        now: NOW,
      },
      r.options,
    );
  return { d1, r, ana, ben, request, offer };
}

test('every EmailKind is handled and unknown ids load as null', async () => {
  const d1 = await newDb();
  const loader = createPayloadLoader(d1, ENV);
  for (const kind of EMAIL_KINDS) {
    assert.equal(await loader.load(kind, 'does_not_exist', null), null, kind);
  }
});

test('form_received and form_staff_notice: payload from the submission, null when spam or gone', async () => {
  const d1 = await newDb();
  const id = seedSubmission(d1, {
    kind: 'contact',
    program: 'web',
    binds: { 'contact.name': 'Pat Lee', 'contact.email': 'pat@example.org' },
    id: 'sub_contact',
  });
  const received = await loadRendered(d1, 'form_received', id);
  assert.deepEqual(received, {
    reference: String(get(d1, 'SELECT reference FROM form_submissions WHERE id = ?', id)!.reference),
    formTitle: 'Form contact',
    program: 'web',
    submitterName: 'Pat Lee',
  });
  const notice = await loadRendered(d1, 'form_staff_notice', id);
  assert.equal(notice!.adminUrl, 'https://admin.gamostudio.org/submissions/sub_contact');
  assert.equal(notice!.submitterEmail, 'pat@example.org');
  assert.equal(notice!.submitterName, 'Pat Lee');

  run(d1, "UPDATE form_submissions SET status = 'spam' WHERE id = ?", id);
  assert.equal(await loadRendered(d1, 'form_received', id), null);
  assert.equal(await loadRendered(d1, 'form_staff_notice', id), null);
});

test('form_staff_notice without any submitter email cannot be rendered', async () => {
  const d1 = await newDb();
  const id = seedSubmission(d1, { kind: 'contact', program: 'web', binds: {}, email: undefined });
  assert.equal(await loadRendered(d1, 'form_staff_notice', id), null);
  assert.ok(
    await loadRendered(d1, 'form_received', id),
    'the receipt needs no email field (the outbox has it)',
  );
});

test('application_approved: roster name and program; null without a roster row or once removed', async () => {
  const { d1, ana } = await scenario();
  assert.deepEqual(await loadRendered(d1, 'application_approved', ana.submissionId), {
    program: 'worship',
    recipientName: 'Ana Reyes',
    reference: String(
      get(d1, 'SELECT reference FROM form_submissions WHERE id = ?', ana.submissionId)!.reference,
    ),
  });
  const unapproved = seedSubmission(d1, {
    kind: 'musician_application',
    program: 'worship',
    binds: musicianBinds(),
  });
  assert.equal(await loadRendered(d1, 'application_approved', unapproved), null);
  run(d1, "UPDATE roster_members SET status = 'removed' WHERE id = ?", ana.memberId);
  assert.equal(await loadRendered(d1, 'application_approved', ana.submissionId), null);
  run(d1, "UPDATE roster_members SET status = 'paused' WHERE id = ?", ana.memberId);
  assert.ok(await loadRendered(d1, 'application_approved', ana.submissionId), 'paused members still get it');
});

test('application_declined: only while declined, and the staff note is never re-sent', async () => {
  const d1 = await newDb();
  const submissionId = seedSubmission(d1, {
    kind: 'musician_application',
    program: 'worship',
    binds: musicianBinds(),
  });
  assert.equal(await loadRendered(d1, 'application_declined', submissionId), null, 'not declined yet');
  await declineApplication(
    d1,
    ENV,
    { submissionId, staffId, now: NOW, note: 'Private: audition tape was weak' },
    fakeResend().options,
  );
  const payload = await loadRendered(d1, 'application_declined', submissionId);
  assert.equal(payload!.program, 'worship');
  assert.equal(payload!.recipientName, 'Ana Reyes');
  assert.ok(!JSON.stringify(payload).includes('Private'));
  assert.equal('staffNote' in payload!, false);
  run(d1, "UPDATE form_submissions SET status = 'in_review' WHERE id = ?", submissionId);
  assert.equal(await loadRendered(d1, 'application_declined', submissionId), null, 'reopened');
});

test('offer_sent can never be rebuilt (the raw token is not stored)', async () => {
  const { d1, ana, offer } = await scenario();
  const sent = await offer(ana.memberId);
  assert.equal(await createPayloadLoader(d1, ENV).load('offer_sent', sent.offerId, 'offer'), null);
  for (const table of ['offers', 'email_log']) {
    assert.ok(!JSON.stringify(all(d1, `SELECT * FROM ${table}`)).includes(tokenOf(sent.url)));
  }
});

test('offer accepted: church and staff payloads; the church gets the first name only', async () => {
  const { d1, r, ana, offer, request } = await scenario();
  const sent = await offer(ana.memberId);
  for (const kind of ['offer_accepted_church', 'offer_accepted_staff', 'offer_declined_staff'] as const) {
    assert.equal(await loadRendered(d1, kind, sent.offerId), null, `${kind} while pending`);
  }
  await respondToOffer(d1, ENV, { token: tokenOf(sent.url), action: 'accept', now: NOW + 60 }, r.options);

  const church = await loadRendered(d1, 'offer_accepted_church', sent.offerId);
  assert.equal(church!.musicianFirstName, 'Ana');
  assert.equal(church!.churchName, 'Grace Community Church');
  assert.equal(church!.contactName, 'Pastor Sam Lee');
  assert.equal(church!.role, 'Drums');
  assert.equal(church!.serviceDate, 'Sunday, March 24, 2030');
  assert.ok(!JSON.stringify(church).includes('Reyes'));

  const staff = await loadRendered(d1, 'offer_accepted_staff', sent.offerId);
  assert.equal(staff!.musicianName, 'Ana Reyes');
  assert.equal(staff!.adminUrl, `https://admin.gamostudio.org/requests/${request.id}`);
  assert.equal(await loadRendered(d1, 'offer_declined_staff', sent.offerId), null);
});

test('offer declined: staff payload only; a withdrawn offer sends nothing', async () => {
  const { d1, r, ana, ben, offer } = await scenario();
  const declined = await offer(ana.memberId);
  await respondToOffer(
    d1,
    ENV,
    { token: tokenOf(declined.url), action: 'decline', now: NOW + 60 },
    r.options,
  );
  const staff = await loadRendered(d1, 'offer_declined_staff', declined.offerId);
  assert.equal(staff!.musicianName, 'Ana Reyes');
  assert.equal(await loadRendered(d1, 'offer_accepted_staff', declined.offerId), null);
  assert.equal(await loadRendered(d1, 'offer_accepted_church', declined.offerId), null);

  const second = await offer(ben.memberId);
  await withdrawOffer(d1, { offerId: second.offerId, staffId, now: NOW + 120 });
  for (const kind of ['offer_accepted_church', 'offer_accepted_staff', 'offer_declined_staff'] as const) {
    assert.equal(await loadRendered(d1, kind, second.offerId), null, kind);
  }
});

function seedInvoice(
  d1: Db,
  o: {
    id: string;
    status?: string;
    hostedUrl?: string | null;
    dueDate?: string | null;
    total?: number;
    lines?: Array<{
      id: string;
      kind: string;
      description: string;
      qty: number;
      unit: number;
      payee?: string;
    }>;
    paidAt?: number | null;
    method?: string | null;
    reference?: string | null;
  },
) {
  const lines = o.lines ?? [
    { id: `${o.id}_l1`, kind: 'other', description: 'Service', qty: 1, unit: 20_000 },
  ];
  const total = o.total ?? lines.reduce((n, l) => n + l.qty * l.unit, 0);
  const status = o.status ?? 'open';
  run(
    d1,
    `INSERT INTO invoices (id, number, source_type, bill_to_name, bill_to_email_normalized, status, total_cents, due_date,
       hosted_url, paid_at, paid_method, paid_reference, created_at)
     VALUES (?, ?, 'manual', 'Grace Community Church', 'pastor@grace.example.org', ?, ?, ?, ?, ?, ?, ?, ?)`,
    o.id,
    `GS-2030-${o.id.slice(-4).padStart(4, '0')}`,
    status,
    total,
    o.dueDate === undefined ? '2030-04-01' : o.dueDate,
    o.hostedUrl ?? null,
    o.paidAt ?? (status === 'paid' ? NOW : null),
    o.method ?? (status === 'paid' ? 'check' : null),
    o.reference ?? null,
    NOW,
  );
  for (const l of lines) {
    run(
      d1,
      `INSERT INTO invoice_lines (id, invoice_id, kind, description, quantity, unit_amount_cents, amount_cents, payee_roster_member_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      l.id,
      o.id,
      l.kind,
      l.description,
      l.qty,
      l.unit,
      l.qty * l.unit,
      l.payee ?? null,
    );
  }
}

test('invoice_sent: separated lines in order, hosted link or manual instructions, only while open', async () => {
  const { d1, ana } = await scenario();
  const withInstructions = { ...ENV, INVOICE_PAYMENT_INSTRUCTIONS: INSTRUCTIONS } as WorshipEnv;
  seedInvoice(d1, {
    id: 'inv_0001',
    lines: [
      {
        id: 'a',
        kind: 'musician_pay',
        description: 'Drums, March 24',
        qty: 1,
        unit: 15_000,
        payee: ana.memberId,
      },
      { id: 'b', kind: 'gamo_admin', description: 'Gamo administrative allocation', qty: 1, unit: 1_500 },
      { id: 'c', kind: 'lesson', description: 'Trial lesson', qty: 2, unit: 2_500 },
    ],
  });
  const manual = await loadRendered(d1, 'invoice_sent', 'inv_0001', withInstructions);
  assert.deepEqual(manual!.lines, [
    {
      kind: 'musician_pay',
      description: 'Drums, March 24',
      quantity: 1,
      unitAmountCents: 15_000,
      amountCents: 15_000,
    },
    {
      kind: 'gamo_admin',
      description: 'Gamo administrative allocation',
      quantity: 1,
      unitAmountCents: 1_500,
      amountCents: 1_500,
    },
    { kind: 'other', description: 'Trial lesson', quantity: 2, unitAmountCents: 2_500, amountCents: 5_000 },
  ]);
  assert.equal(manual!.totalCents, 21_500);
  assert.equal(manual!.manualInstructions, INSTRUCTIONS);
  assert.equal('hostedUrl' in manual!, false);
  assert.equal(manual!.dueDate, 'April 1, 2030');
  assert.equal(manual!.billToName, 'Grace Community Church');

  assert.equal(
    await loadRendered(d1, 'invoice_sent', 'inv_0001', ENV),
    null,
    'no payment link and no instructions: nothing to tell the payer',
  );

  run(
    d1,
    "UPDATE invoices SET hosted_url = 'https://invoice.stripe.com/i/acct_1/test_abc' WHERE id = 'inv_0001'",
  );
  const hosted = await loadRendered(d1, 'invoice_sent', 'inv_0001', ENV);
  assert.equal(hosted!.hostedUrl, 'https://invoice.stripe.com/i/acct_1/test_abc');
  assert.equal('manualInstructions' in hosted!, false);

  run(d1, "UPDATE invoices SET due_date = NULL WHERE id = 'inv_0001'");
  assert.equal((await loadRendered(d1, 'invoice_sent', 'inv_0001', ENV))!.dueDate, 'On receipt');

  for (const status of ['draft', 'void', 'paid']) {
    run(
      d1,
      "UPDATE invoices SET status = ?, paid_at = ?, paid_method = ? WHERE id = 'inv_0001'",
      status,
      status === 'paid' ? NOW : null,
      status === 'paid' ? 'check' : null,
    );
    assert.equal(await loadRendered(d1, 'invoice_sent', 'inv_0001', ENV), null, `status ${status}`);
  }
});

test('invoice_sent whose total no longer matches its lines is closed by the renderer, not sent', async () => {
  const d1 = await newDb();
  seedInvoice(d1, { id: 'inv_0002', hostedUrl: 'https://invoice.stripe.com/i/x', total: 99_999 });
  const loader = createPayloadLoader(d1, ENV);
  assert.ok(await loader.load('invoice_sent', 'inv_0002', 'invoice'));
  const render = createRetryRenderer(loader);
  const row = {
    id: 'log_1',
    kind: 'invoice_sent',
    idempotencyKey: 'invoice_sent:inv_0002',
    recipientEmail: 'pastor@grace.example.org',
    relatedType: 'invoice',
    relatedId: 'inv_0002',
    attempts: 1,
  };
  const warn = console.warn;
  console.warn = () => undefined;
  try {
    assert.equal(await render(row), null);
  } finally {
    console.warn = warn;
  }
});

test('invoice_paid_receipt: only while paid, with a method label and reference', async () => {
  const d1 = await newDb();
  seedInvoice(d1, { id: 'inv_0003', hostedUrl: 'https://invoice.stripe.com/i/x' });
  assert.equal(await loadRendered(d1, 'invoice_paid_receipt', 'inv_0003'), null, 'open');
  run(
    d1,
    "UPDATE invoices SET status = 'paid', paid_at = ?, paid_method = 'check', paid_reference = 'Check 1042' WHERE id = 'inv_0003'",
    NOW,
  );
  assert.deepEqual(await loadRendered(d1, 'invoice_paid_receipt', 'inv_0003'), {
    billToName: 'Grace Community Church',
    number: 'GS-2030-0003',
    paidDate: 'March 17, 2030',
    totalCents: 20_000,
    method: 'Check',
    reference: 'Check 1042',
  });
  run(d1, "UPDATE invoices SET status = 'void' WHERE id = 'inv_0003'");
  assert.equal(await loadRendered(d1, 'invoice_paid_receipt', 'inv_0003'), null, 'void');
});
