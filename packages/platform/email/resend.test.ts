import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResendClient } from './resend.ts';

function recorder(responses: Array<() => Response>) {
  const calls: { url: string; init: RequestInit; body: any }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {}, body: JSON.parse(String(init?.body)) });
    const next = responses.shift();
    if (!next) throw new Error('unexpected fetch');
    return next();
  }) as typeof fetch;
  return { impl, calls };
}

test('attachments and headers map to Resend field names (content_type, content_id); omitted when empty', async () => {
  const r = recorder([() => Response.json({ id: 'msg_1' }), () => Response.json({ id: 'msg_2' })]);
  const client = createResendClient({ apiKey: 're_live_example_key', fetchImpl: r.impl });
  const result = await client.send({
    to: 'guest@example.test',
    subject: 'Your tickets (Sample)',
    html: '<img src="cid:qr-1" alt="Ticket QR code">',
    text: 'Your tickets',
    idempotencyKey: 'ticket_email:ord_1',
    attachments: [
      { filename: 'tickets.pdf', content: 'JVBERi0=', contentType: 'application/pdf' },
      { filename: 'qr-1.png', content: 'iVBORw0=', contentType: 'image/png', contentId: 'qr-1' },
      { filename: 'event.ics', content: 'QkVHSU4=' },
    ],
    headers: { 'X-Entity-Ref-ID': 'ord_1' },
  });
  assert.deepEqual(result, { success: true, id: 'msg_1', mock: false });
  const { url, init, body } = r.calls[0];
  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal((init.headers as Record<string, string>)['Idempotency-Key'], 'ticket_email:ord_1');
  assert.deepEqual(body.attachments, [
    { filename: 'tickets.pdf', content: 'JVBERi0=', content_type: 'application/pdf' },
    { filename: 'qr-1.png', content: 'iVBORw0=', content_type: 'image/png', content_id: 'qr-1' },
    { filename: 'event.ics', content: 'QkVHSU4=' },
  ]);
  assert.deepEqual(body.headers, { 'X-Entity-Ref-ID': 'ord_1' });
  assert.deepEqual(body.to, ['guest@example.test']);
  assert.equal(body.reply_to, 'hello@gamostudio.org');

  await client.send({ to: 'guest@example.test', subject: 's', text: 't', attachments: [], headers: {} });
  assert.ok(!('attachments' in r.calls[1].body));
  assert.ok(!('headers' in r.calls[1].body));
});

test('failures carry a short error code; no key and no mock → not_configured without a request', async () => {
  const r = recorder([() => new Response('{}', { status: 422 })]);
  const failed = await createResendClient({ apiKey: 're_live_example_key', fetchImpl: r.impl }).send({
    to: 'a@example.test',
    subject: 's',
    text: 't',
  });
  assert.equal(failed.success, false);
  assert.equal(failed.status, 422);
  assert.equal(failed.errorCode, 'http_422');

  const none = recorder([]);
  const off = await createResendClient({ fetchImpl: none.impl }).send({ to: 'a@example.test', subject: 's' });
  assert.equal(off.notConfigured, true);
  assert.equal(off.errorCode, 'not_configured');
  assert.equal(none.calls.length, 0);
  const mocked = await createResendClient({ allowMock: true, fetchImpl: none.impl }).send({
    to: 'a@example.test',
    subject: 's',
  });
  assert.equal(mocked.mock, true);
  assert.equal(none.calls.length, 0);
});
