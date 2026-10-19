/**
 * Ticket rendering (design T-06): QR matrix, PNG encoder (signature, CRCs, decodes back to the matrix),
 * SVG and PDF output, WinAnsi fallback, `.ics`, DST-safe time conversion. Also prints rough per-render
 * timings (reported in docs/TICKETING.md).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { qrMatrix, QR_QUIET_ZONE } from './render-qr.ts';
import { pngCrc32, renderQrPng } from './render-png.ts';
import { renderTicketSvg } from './render-svg.ts';
import { renderTicketsPdf, toWinAnsi } from './render-pdf.ts';
import { buildCalendarIcs, escapeIcs, foldIcsLine } from './calendar.ts';
import { formatEventDateTime, utcToZonedLocal, venueDayKey, zonedLocalToUtc } from './events-time.ts';
import type { TicketRenderModel } from './render-model.ts';

const PAYLOAD = 'GL1.0123456789ABCDEFGHJKMNPQ.1.0123456789ABCDEFGHJKMNPQ';

const model: TicketRenderModel = {
  ticketId: 'tkt_0123456789abcdefghjkmnpq',
  version: 1,
  status: 'valid',
  qrPayload: PAYLOAD,
  eventId: 'evt_sample',
  eventTitle: 'Sample Worship Night with a very long title that wraps',
  dateLine: 'Sat, Mar 20, 2027',
  timeLine: '7:00 PM MST',
  venueName: 'Sample Fellowship Hall',
  venueAddress: '100 Sample Street, Phoenix, AZ',
  gateLabel: 'A',
  sectionName: 'Balcony',
  categoryName: 'Family table',
  categoryBadge: 'Table of 8',
  holderName: 'Zoë Łukasz-Nguyễn',
  orderId: 'ord_sample',
  orderReference: 'GL-7K4M-92QX',
  ageNote: null,
  validDays: null,
  startsAt: 1_900_000_000,
  endsAt: null,
  timezone: 'America/Phoenix',
};

test('QR: alphanumeric payload fits version 4 with error correction M', () => {
  const m = qrMatrix(PAYLOAD);
  assert.ok(m.version <= 4, `version ${m.version}`);
  assert.equal(m.size, 17 + 4 * m.version);
  assert.equal(m.modules.length, m.size);
});

test('PNG: valid signature and CRCs, decodes to the QR matrix with a quiet zone', async () => {
  const scale = 4;
  const png = await renderQrPng(PAYLOAD, scale);
  assert.deepEqual([...png.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let at = 8;
  const chunks: Array<{ type: string; data: Uint8Array }> = [];
  while (at < png.length) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(...png.slice(at + 4, at + 8));
    const data = png.slice(at + 8, at + 8 + len);
    assert.equal(view.getUint32(at + 8 + len), pngCrc32(png.slice(at + 4, at + 8 + len)), `CRC of ${type}`);
    chunks.push({ type, data });
    at += 12 + len;
  }
  assert.deepEqual(
    chunks.map((c) => c.type),
    ['IHDR', 'IDAT', 'IEND'],
  );
  const ihdr = new DataView(chunks[0].data.buffer, chunks[0].data.byteOffset);
  const m = qrMatrix(PAYLOAD);
  const width = (m.size + 2 * QR_QUIET_ZONE) * scale;
  assert.equal(ihdr.getUint32(0), width);
  const raw = inflateSync(chunks[1].data);
  const rowBytes = Math.ceil(width / 8) + 1;
  assert.equal(raw.length, rowBytes * width);
  const pixel = (x: number, y: number) => ((raw[y * rowBytes + 1 + (x >> 3)] >> (7 - (x & 7))) & 1) === 0; // dark
  assert.equal(pixel(0, 0), false, 'quiet zone is white');
  for (let y = 0; y < m.size; y++)
    for (let x = 0; x < m.size; x++)
      assert.equal(pixel((x + QR_QUIET_ZONE) * scale + 1, (y + QR_QUIET_ZONE) * scale + 1), m.modules[y][x]);
});

test('SVG: escaped text, terms line, QR runs; dead tickets show no code', () => {
  const svg = renderTicketSvg({ ...model, holderName: '<script>x</script>' });
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.ok(!svg.includes('<script>'));
  assert.match(svg, /Personal ticket · no resale · first scan admits/);
  assert.match(svg, /GL-7K4M-92QX/);
  assert.ok((svg.match(/<rect x="\d+" y="\d+" width="\d+" height="1"\/>/g) ?? []).length > 50);
  const dead = renderTicketSvg({ ...model, status: 'refunded', qrPayload: null });
  assert.match(dead, /REFUNDED/);
  assert.ok(!/height="1"\/>/.test(dead));
});

test('PDF: one page per ticket, WinAnsi-safe names', async () => {
  const started = performance.now();
  const pdf = await renderTicketsPdf([model, { ...model, ticketId: 'tkt_x', holderName: '李雷 Sample' }]);
  const ms = performance.now() - started;
  const text = new TextDecoder('latin1').decode(pdf);
  assert.ok(text.startsWith('%PDF-'));
  assert.ok(pdf.length < 60_000, `${pdf.length} bytes`);
  assert.equal(toWinAnsi('Zoë Łukasz-Nguyễn'), 'Zoë Lukasz-Nguyen');
  assert.equal(toWinAnsi('李雷 “Sample”'), '?? “Sample”');
  console.log(`[render timing] PDF (2 tickets): ${ms.toFixed(1)} ms, ${pdf.length} bytes`);
  const t1 = performance.now();
  for (let i = 0; i < 20; i++) renderTicketSvg(model);
  console.log(`[render timing] SVG: ${((performance.now() - t1) / 20).toFixed(2)} ms per ticket`);
  const t2 = performance.now();
  for (let i = 0; i < 10; i++) await renderQrPng(PAYLOAD, 6);
  console.log(`[render timing] QR PNG: ${((performance.now() - t2) / 10).toFixed(2)} ms per code`);
});

test('ics: stable UID, SEQUENCE, venue zone, CRLF and folding', () => {
  const ics = buildCalendarIcs({
    uid: 'order-ord_sample@live.example.test',
    sequence: 2,
    title: 'Sample, Worship; Night',
    description: 'Line one\nLine two '.repeat(10),
    location: 'Sample Hall, Phoenix, AZ',
    url: 'http://127.0.0.1:4324/events/sample',
    startsAt: 1_900_000_000,
    endsAt: 1_900_007_200,
    timezone: 'America/Phoenix',
    now: 1_800_000_000,
  });
  assert.match(ics, /UID:order-ord_sample@live\.example\.test\r\n/);
  assert.match(ics, /SEQUENCE:2\r\n/);
  assert.match(ics, /DTSTART;TZID=America\/Phoenix:20300317T\d{6}\r\n/);
  assert.match(ics, /TZOFFSETTO:-0700/);
  assert.match(ics, /SUMMARY:Sample\\, Worship\\; Night/);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
});

test('time: DST gap moves forward, overlap takes the earlier instant, day key is venue-local', () => {
  const gap = zonedLocalToUtc({ date: '2027-03-14', time: '02:30', zone: 'America/New_York' });
  assert.ok(gap.ok && gap.adjusted === 'gap_forward');
  if (gap.ok)
    assert.deepEqual(utcToZonedLocal(gap.epochSeconds, 'America/New_York'), {
      date: '2027-03-14',
      time: '03:30',
    });
  const overlap = zonedLocalToUtc({ date: '2027-11-07', time: '01:30', zone: 'America/New_York' });
  assert.ok(overlap.ok && overlap.adjusted === 'overlap_earlier');
  if (overlap.ok)
    assert.equal(new Date(overlap.epochSeconds * 1000).toISOString(), '2027-11-07T05:30:00.000Z');
  const normal = zonedLocalToUtc({ date: '2027-07-04', time: '19:00', zone: 'America/Phoenix' });
  assert.ok(normal.ok && normal.adjusted === 'none');
  if (normal.ok) {
    assert.equal(new Date(normal.epochSeconds * 1000).toISOString(), '2027-07-05T02:00:00.000Z');
    assert.equal(venueDayKey(normal.epochSeconds, 'America/Phoenix'), '2027-07-04');
    assert.match(
      formatEventDateTime(normal.epochSeconds, 'America/Phoenix'),
      /Sun, Jul 4, 2027 · 7:00 PM MST/,
    );
  }
  assert.deepEqual(zonedLocalToUtc({ date: '2027-02-30', time: '10:00', zone: 'UTC' }), {
    ok: false,
    reason: 'invalid_date',
  });
  assert.deepEqual(zonedLocalToUtc({ date: '2027-02-10', time: '10:00', zone: 'Nowhere/City' }), {
    ok: false,
    reason: 'invalid_zone',
  });
});

test('ics: control characters and lone CR cannot inject properties; long multibyte lines fold safely', () => {
  assert.equal(escapeIcs('a\rATTENDEE:evil'), 'a\\nATTENDEE:evil');
  assert.equal(escapeIcs('a\r\nb\nc'), 'a\\nb\\nc');
  assert.equal(escapeIcs('x\u0000y\u0008z\u007f;,\\'), 'xyz\\;\\,\\\\');
  const ics = buildCalendarIcs({
    uid: 'order-ord_sample@live.example.test\r\nX-INJECT:1',
    sequence: 0,
    title: 'Sample\rDTSTART:19990101T000000Z',
    description: 'Line\u0000one\rBEGIN:VALARM',
    location: 'Sample\tHall\r\nORGANIZER:mailto:x@example.invalid   Phoenix',
    url: 'http://127.0.0.1:4324/events/sample\r\nX: 1',
    startsAt: 1_900_000_000,
    endsAt: null,
    timezone: 'America/Phoenix',
    now: 1_800_000_000,
  });
  const lines = ics.split('\r\n');
  for (const line of lines) {
    // eslint-disable-next-line no-control-regex
    assert.ok(!/[\u0000-\u0008\u000a-\u001f\u007f]/.test(line), JSON.stringify(line));
    assert.ok(!/^(X-INJECT|ORGANIZER|BEGIN:VALARM|DTSTART:1999)/.test(line), line);
  }
  assert.ok(lines.includes('LOCATION:Sample Hall ORGANIZER:mailto:x@example.invalid Phoenix'));
  assert.ok(!ics.includes('\u0000'));
  const long = `DESCRIPTION:${'é'.repeat(100)}${'😀'.repeat(30)}`;
  const folded = foldIcsLine(long);
  for (const part of folded.split('\r\n')) assert.ok(new TextEncoder().encode(part).length <= 75);
  assert.equal(
    folded
      .split('\r\n')
      .map((p, i) => (i ? p.slice(1) : p))
      .join(''),
    long,
  );
});
