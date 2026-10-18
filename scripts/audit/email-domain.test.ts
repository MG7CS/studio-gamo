/**
 * The verified sending domain is gamostudio.org. A misspelling with an extra "s" once appeared in
 * the booklet and in code, so this test fails if it appears in ANY tracked text file.
 * (The needle is assembled so this file does not contain it.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createResendClient } from '../../packages/integrations/src/resend.ts';

const root = resolve(import.meta.dirname, '../..');
const WRONG = `gamostudio${'s'}.org`;

test('the misspelled email domain appears nowhere in the repository', () => {
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
  assert.ok(files.length > 100, 'file list looks wrong');

  const offenders: string[] = [];
  for (const file of files) {
    let buf: Buffer;
    try {
      buf = readFileSync(resolve(root, file));
    } catch {
      continue; // deleted in the working tree but still listed
    }
    if (buf.includes(0)) continue; // binary (images, PDFs, fonts)
    const lines = buf.toString('utf8').split('\n');
    lines.forEach((line, i) => {
      if (line.toLowerCase().includes(WRONG)) offenders.push(`${file}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [], `use the verified domain (gamostudio.org):\n${offenders.join('\n')}`);
});

test('email defaults to hello@gamostudio.org as From and Reply-To; explicit values win', async () => {
  const realFetch = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 });
  }) as typeof fetch;
  try {
    const client = createResendClient({ apiKey: 're_live_example_key' });
    await client.send({ to: 'a@example.test', subject: 's', text: 't' });
    await client.send({
      to: 'a@example.test',
      subject: 's',
      text: 't',
      from: 'Gamo Live <live@gamostudio.org>',
      replyTo: 'support@gamostudio.org',
    });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(bodies[0].from, 'Gamo Studios <hello@gamostudio.org>');
  assert.equal(bodies[0].reply_to, 'hello@gamostudio.org');
  assert.equal(bodies[1].from, 'Gamo Live <live@gamostudio.org>');
  assert.equal(bodies[1].reply_to, 'support@gamostudio.org');
});
