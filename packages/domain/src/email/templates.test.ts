import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatUsd,
  renderApplicationApproved,
  renderApplicationDeclined,
  renderFormReceived,
  renderFormStaffNotice,
  renderInvoicePaidReceipt,
  renderInvoiceSent,
  renderOfferAcceptedChurch,
  renderOfferAcceptedStaff,
  renderOfferDeclinedStaff,
  renderOfferSent,
  type InvoiceSentPayload,
} from './templates.ts';

const XSS = '<script>alert(1)</script>';

test('formatUsd formats integer cents', () => {
  assert.equal(formatUsd(0), '$0.00');
  assert.equal(formatUsd(5), '$0.05');
  assert.equal(formatUsd(15000), '$150.00');
  assert.equal(formatUsd(123456789), '$1,234,567.89');
  assert.equal(formatUsd(-2550), '-$25.50');
  assert.throws(() => formatUsd(1.5), RangeError);
  assert.throws(() => formatUsd(Number.NaN), RangeError);
});

test('form_received: reference, next steps, contact; no answers; escaped; no name or email in the subject', () => {
  const m = renderFormReceived({
    reference: 'GW-2026-0001',
    formTitle: 'Musician application',
    program: 'worship',
    submitterName: XSS,
  });
  assert.match(m.subject, /GW-2026-0001/);
  assert.ok(!m.subject.includes('script'));
  assert.match(m.text, /GW-2026-0001/);
  assert.match(m.text, /hello@gamostudio\.org/);
  assert.match(m.text, /What happens next/i);
  assert.ok(m.html.includes('GW-2026-0001'));
  assert.ok(!m.html.includes('<script>'));
  assert.ok(m.html.includes('&lt;script&gt;'));
  assert.ok(!/answers?:/i.test(m.text));
});

test('form_staff_notice: subject has no personal data, body links to the admin record, Reply-To is the submitter', () => {
  const m = renderFormStaffNotice({
    reference: 'GW-2026-0001',
    formTitle: 'Musician application',
    program: 'worship',
    adminUrl: 'https://admin.gamostudio.org/submissions/sub_1',
    submitterEmail: 'ana@example.org',
    submitterName: 'Ana Reyes',
  });
  assert.equal(m.subject, 'New Musician application #GW-2026-0001');
  assert.ok(!m.subject.includes('Ana') && !m.subject.includes('@'));
  assert.match(m.text, /https:\/\/admin\.gamostudio\.org\/submissions\/sub_1/);
  assert.ok(m.html.includes('href="https://admin.gamostudio.org/submissions/sub_1"'));
  assert.equal(m.replyTo, 'ana@example.org');
});

test('form_staff_notice: subject strips line breaks (no header injection) and rejects a non-http link', () => {
  const m = renderFormStaffNotice({
    reference: 'GW-1',
    formTitle: 'Bad\r\nBcc: x@y.z',
    program: 'worship',
    adminUrl: 'https://admin.gamostudio.org/s/1',
    submitterEmail: 'a@example.org',
  });
  assert.ok(!/[\r\n]/.test(m.subject));
  assert.throws(
    () =>
      renderFormStaffNotice({
        reference: 'GW-1',
        formTitle: 'T',
        program: 'worship',
        adminUrl: 'javascript:alert(1)',
        submitterEmail: 'a@example.org',
      }),
    RangeError,
  );
});

test('application_approved / declined are kind; declined shows a reason only when staff supplied a note', () => {
  const approved = renderApplicationApproved({ program: 'worship', recipientName: `Ana ${XSS}` });
  assert.match(approved.text, /approved|welcome/i);
  assert.ok(!approved.html.includes('<script>'));
  const bare = renderApplicationDeclined({ program: 'worship' });
  assert.ok(!/reason|because/i.test(bare.text));
  assert.match(bare.text, /thank/i);
  const noted = renderApplicationDeclined({
    program: 'worship',
    staffNote: `We need a drummer ${XSS}`,
  });
  assert.match(noted.text, /We need a drummer/);
  assert.ok(!noted.html.includes('<script>'));
  for (const m of [approved, bare, noted])
    assert.ok(!/nonprofit|non-profit|donat|tax-exempt|charit/i.test(m.text));
});

const offer = {
  musicianName: 'Ana Reyes',
  churchName: `Grace <b>Church</b>`,
  city: 'Austin',
  role: 'Keys',
  serviceDate: 'Sunday, March 8, 2026',
  startTime: '10:00 AM',
  arrivalTime: '9:15 AM',
  payCents: 15000,
  offerUrl: 'https://worship.gamostudio.org/offers/tok_abc',
  expiresAtText: 'Thursday, March 5 at 6:00 PM',
};

test('offer_sent: details, pay, link, explains nothing happens until a button is pressed; no PII in subject', () => {
  const m = renderOfferSent(offer);
  for (const needle of [
    'Keys',
    'Austin',
    '10:00 AM',
    '9:15 AM',
    '$150.00',
    'https://worship.gamostudio.org/offers/tok_abc',
  ]) {
    assert.ok(m.text.includes(needle), needle);
  }
  assert.match(m.text, /nothing happens until you press/i);
  assert.ok(!m.subject.includes('Ana') && !m.subject.includes('Grace'));
  assert.ok(!m.html.includes('<b>Church</b>'));
  assert.ok(m.html.includes('&lt;b&gt;Church&lt;/b&gt;'));
});

test('offer_accepted_church shows the first name only', () => {
  const m = renderOfferAcceptedChurch({
    churchName: 'Grace Church',
    contactName: 'Pastor Sam',
    musicianFirstName: 'Ana',
    role: 'Keys',
    serviceDate: 'Sunday, March 8, 2026',
    arrivalTime: '9:15 AM',
  });
  assert.match(m.text, /Ana/);
  assert.ok(!/Reyes/.test(m.text));
  assert.match(m.text, /9:15 AM/);
  assert.match(m.text, /Keys/);
});

test('offer staff notices link to admin and keep names out of the subject', () => {
  const base = {
    musicianName: 'Ana Reyes',
    churchName: 'Grace Church',
    role: 'Keys',
    serviceDate: 'Sunday, March 8, 2026',
    adminUrl: 'https://admin.gamostudio.org/requests/req_1',
  };
  for (const m of [renderOfferAcceptedStaff(base), renderOfferDeclinedStaff(base)]) {
    assert.ok(!m.subject.includes('Ana') && !m.subject.includes('Grace'));
    assert.match(m.text, /requests\/req_1/);
    assert.match(m.text, /Ana Reyes/);
  }
  assert.match(renderOfferAcceptedStaff(base).subject, /accepted/i);
  assert.match(renderOfferDeclinedStaff(base).subject, /declined/i);
  assert.match(renderOfferDeclinedStaff(base).text, /matching/i);
});

const invoice: InvoiceSentPayload = {
  billToName: `Grace ${XSS}`,
  number: 'GS-2026-0001',
  dueDate: 'March 22, 2026',
  lines: [
    {
      kind: 'musician_pay',
      description: 'Keys, March 8',
      quantity: 1,
      unitAmountCents: 15000,
      amountCents: 15000,
    },
    {
      kind: 'musician_pay',
      description: 'Drums, March 8',
      quantity: 1,
      unitAmountCents: 12000,
      amountCents: 12000,
    },
    {
      kind: 'gamo_admin',
      description: 'Gamo administrative contribution',
      quantity: 1,
      unitAmountCents: 2700,
      amountCents: 2700,
    },
  ],
  totalCents: 29700,
  hostedUrl: 'https://invoice.stripe.com/i/acct_x/test_1',
};

test('invoice_sent: every line in text and html, Gamo administrative line separate from musician pay, total, pay link', () => {
  const m = renderInvoiceSent(invoice);
  for (const needle of [
    'Keys, March 8',
    'Drums, March 8',
    '$150.00',
    '$120.00',
    '$27.00',
    '$297.00',
    'GS-2026-0001',
    'March 22, 2026',
  ]) {
    assert.ok(m.text.includes(needle), `text ${needle}`);
    assert.ok(m.html.includes(needle), `html ${needle}`);
  }
  assert.match(m.text, /Musician pay[\s\S]*Keys[\s\S]*Drums[\s\S]*Gamo administrative[\s\S]*Total/i);
  assert.match(m.text, /Musician pay subtotal: \$270\.00/);
  assert.match(m.text, /Gamo administrative contribution subtotal: \$27\.00/);
  assert.ok(m.text.includes('https://invoice.stripe.com/i/acct_x/test_1'));
  assert.ok(m.html.includes('href="https://invoice.stripe.com/i/acct_x/test_1"'));
  assert.ok(!m.html.includes('<script>'));
  assert.ok(!m.subject.includes('Grace'));
  assert.match(m.subject, /GS-2026-0001/);
});

test('invoice_sent: no admin line means no admin section; manual instructions are used without a pay link', () => {
  const m = renderInvoiceSent({
    ...invoice,
    lines: invoice.lines.slice(0, 2),
    totalCents: 27000,
    hostedUrl: undefined,
    manualInstructions: `Zelle to pay@example.org\nMemo: GS-2026-0001 ${XSS}`,
  });
  assert.ok(!/Gamo administrative/i.test(m.text));
  assert.match(m.text, /Zelle to pay@example\.org/);
  assert.ok(m.html.includes('Zelle to pay@example.org'));
  assert.ok(!m.html.includes('<script>'));
});

test('invoice_sent rejects a total that does not equal the lines, fractional cents and a missing payment route', () => {
  assert.throws(() => renderInvoiceSent({ ...invoice, totalCents: 1 }), RangeError);
  assert.throws(
    () =>
      renderInvoiceSent({ ...invoice, lines: [{ ...invoice.lines[0]!, amountCents: 1.5 }], totalCents: 1.5 }),
    RangeError,
  );
  assert.throws(() => renderInvoiceSent({ ...invoice, hostedUrl: undefined }), RangeError);
});

test('invoice_paid_receipt', () => {
  const m = renderInvoicePaidReceipt({
    billToName: `Grace ${XSS}`,
    number: 'GS-2026-0001',
    paidDate: 'March 10, 2026',
    totalCents: 29700,
    method: 'Card',
    reference: 'ch_123',
  });
  assert.match(m.subject, /GS-2026-0001/);
  assert.match(m.text, /\$297\.00/);
  assert.match(m.text, /March 10, 2026/);
  assert.ok(!m.html.includes('<script>'));
});
