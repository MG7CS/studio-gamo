import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMAIL_KINDS,
  EmailPayloadError,
  createRetryRenderer,
  emailIdempotencyKey,
  isEmailKind,
  renderEmail,
  type PayloadLoader,
} from './registry.ts';

test('every kind is a valid outbox kind and is recognised', () => {
  for (const k of EMAIL_KINDS) {
    assert.match(k, /^[a-z0-9_]{1,64}$/);
    assert.equal(isEmailKind(k), true);
  }
  assert.equal(isEmailKind('academy_receipt'), false);
  assert.equal(emailIdempotencyKey('form_received', 'sub_1'), 'form_received:sub_1');
});

test('renderEmail dispatches and validates payloads', () => {
  const m = renderEmail('form_received', { reference: 'GW-1', formTitle: 'T', program: 'worship' });
  assert.match(m.subject, /GW-1/);
  assert.throws(() => renderEmail('form_received', { formTitle: 'T' }), EmailPayloadError);
  assert.throws(() => renderEmail('form_received', null), EmailPayloadError);
  assert.throws(() => renderEmail('nope' as never, {}), EmailPayloadError);
  assert.throws(
    () =>
      renderEmail('invoice_sent', {
        billToName: 'x',
        number: 'GS-1',
        dueDate: 'd',
        lines: [
          { kind: 'musician_pay', description: 'k', quantity: 1, unitAmountCents: 100, amountCents: 100 },
        ],
        totalCents: 999,
        hostedUrl: 'https://example.org/p',
      }),
    EmailPayloadError,
  );
});

test('retry renderer rebuilds from kind + relatedId through the loader and gives up cleanly', async () => {
  const seen: unknown[] = [];
  const loader: PayloadLoader = {
    async load(kind, relatedId, relatedType) {
      seen.push([kind, relatedId, relatedType]);
      if (relatedId === 'sub_1') return { reference: 'GW-1', formTitle: 'T', program: 'worship' };
      if (relatedId === 'bad') return { nope: true };
      return null;
    },
  };
  const render = createRetryRenderer(loader);
  const row = (kind: string, relatedId: string | null) => ({
    id: 'eml_1',
    kind,
    idempotencyKey: `${kind}:${relatedId}`,
    recipientEmail: 'a@example.org',
    relatedType: 'form_submission',
    relatedId,
    attempts: 1,
  });
  const ok = await render(row('form_received', 'sub_1'));
  assert.ok(ok && /GW-1/.test(ok.subject) && ok.text && ok.html);
  assert.equal(ok?.relatedId, 'sub_1');
  assert.deepEqual(seen[0], ['form_received', 'sub_1', 'form_submission']);
  assert.equal(await render(row('form_received', 'missing')), null);
  assert.equal(await render(row('form_received', 'bad')), null);
  assert.equal(await render(row('academy_receipt', 'sub_1')), null);
  assert.equal(await render(row('form_received', null)), null);
});
