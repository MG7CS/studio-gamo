/**
 * Ticket PDFs (design T-06) with `pdf-lib` (MIT, pure JS): one ticket per US Letter page, the QR
 * drawn as vector rectangles (≈ 78 mm, black on white with the quiet zone), text in the built-in
 * Helvetica font — no font files are embedded.
 *
 * Limitation: the standard PDF fonts only cover the Windows-1252 (WinAnsi) character set. Names are
 * passed through `toWinAnsi`: accents outside it are decomposed (Ł → L, ő → o), anything else becomes
 * "?". The on-screen SVG ticket and the email show the original name; the QR never contains names.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { QR_QUIET_ZONE, qrMatrix, qrRuns } from './render-qr.ts';
import { TICKET_TERMS_LINE, type TicketRenderModel } from './render-model.ts';
import { wrapText } from './render-svg.ts';

/** Windows-1252 code points above 0x7F that are not Latin-1 (0x80–0x9F block). */
const WINANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split('').map((c) => c.codePointAt(0)!));
const FALLBACKS: Record<string, string> = {
  Ł: 'L',
  ł: 'l',
  Đ: 'D',
  đ: 'd',
  Ħ: 'H',
  ħ: 'h',
  ı: 'i',
  ſ: 's',
  ẞ: 'SS',
  Ŋ: 'N',
  ŋ: 'n',
  Ŧ: 'T',
  ŧ: 't',
};

function isWinAnsi(cp: number): boolean {
  return (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || WINANSI_EXTRA.has(cp);
}

/** Text the standard Helvetica font can draw (see the module header). */
export function toWinAnsi(text: string): string {
  let out = '';
  for (const ch of String(text ?? '').replace(/[\r\n\t]+/g, ' ')) {
    const cp = ch.codePointAt(0)!;
    if (isWinAnsi(cp)) {
      out += ch;
      continue;
    }
    if (FALLBACKS[ch]) {
      out += FALLBACKS[ch];
      continue;
    }
    const stripped = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    out += [...stripped].every((c) => isWinAnsi(c.codePointAt(0)!)) && stripped ? stripped : '?';
  }
  return out;
}

const INK = rgb(0.094, 0.094, 0.106);
const TERRACOTTA = rgb(0.702, 0.306, 0.141);
const MUTED = rgb(0.32, 0.32, 0.36);
const SAND = rgb(0.929, 0.902, 0.855);

function drawQr(page: PDFPage, payload: string, x: number, y: number, size: number) {
  const matrix = qrMatrix(payload);
  const modules = matrix.size + QR_QUIET_ZONE * 2;
  const unit = size / modules;
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1) });
  for (const [mx, my, w] of qrRuns(matrix)) {
    page.drawRectangle({
      x: x + (mx + QR_QUIET_ZONE) * unit,
      // PDF y grows upwards: module row 0 is at the top.
      y: y + size - (my + QR_QUIET_ZONE + 1) * unit,
      width: w * unit,
      height: unit,
      color: rgb(0, 0, 0),
    });
  }
}

function text(page: PDFPage, value: string, x: number, y: number, size: number, font: PDFFont, color = INK) {
  page.drawText(toWinAnsi(value), { x, y, size, font, color });
}

function drawTicket(page: PDFPage, t: TicketRenderModel, regular: PDFFont, bold: PDFFont) {
  const { width, height } = page.getSize();
  const left = 72;
  let y = height - 84;
  text(page, 'GAMO LIVE · TICKET', left, y, 10, bold, MUTED);
  y -= 30;
  for (const line of wrapText(t.eventTitle.toUpperCase(), 34, 2)) {
    text(page, line, left, y, 22, bold);
    y -= 26;
  }
  text(page, `${t.dateLine} · ${t.timeLine}`, left, y, 13, bold, TERRACOTTA);
  y -= 20;
  for (const line of wrapText([t.venueName, t.venueAddress].filter(Boolean).join(' · '), 70, 2)) {
    text(page, line, left, y, 11, regular);
    y -= 15;
  }
  const qrSize = 220;
  const qrY = y - 24 - qrSize;
  const qrX = (width - qrSize) / 2;
  if (t.qrPayload) drawQr(page, t.qrPayload, qrX, qrY, qrSize);
  else {
    page.drawRectangle({ x: qrX, y: qrY, width: qrSize, height: qrSize, color: SAND });
    const label = t.status === 'refunded' ? 'REFUNDED' : 'CANCELLED';
    text(page, label, qrX + qrSize / 2 - bold.widthOfTextAtSize(label, 18) / 2, qrY + qrSize / 2, 18, bold);
  }
  y = qrY - 36;
  const badge = [
    t.categoryName,
    t.categoryBadge && t.categoryBadge !== t.categoryName ? t.categoryBadge : null,
  ]
    .filter(Boolean)
    .join(' · ');
  text(page, badge, left, y, 13, bold, TERRACOTTA);
  y -= 26;
  text(page, 'HOLDER', left, y, 9, bold, MUTED);
  y -= 18;
  text(page, t.holderName, left, y, 16, bold);
  y -= 24;
  const details = [
    t.sectionName ? `Section ${t.sectionName}` : null,
    t.gateLabel ? `Gate ${t.gateLabel}` : null,
    t.validDays,
    t.ageNote,
  ].filter(Boolean) as string[];
  if (details.length) {
    text(page, details.join(' · '), left, y, 12, bold);
  }
  text(page, `Order ${t.orderReference}`, left, 96, 11, bold);
  text(page, TICKET_TERMS_LINE, left, 80, 10, regular, MUTED);
  text(
    page,
    'Show this page or the QR on your phone at the door. Keep it private.',
    left,
    64,
    9,
    regular,
    MUTED,
  );
}

/** One PDF with one ticket per page ("download all" passes every ticket of the order). */
export async function renderTicketsPdf(
  tickets: TicketRenderModel[],
  title = 'Gamo Live tickets',
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(toWinAnsi(title));
  doc.setProducer('Gamo Live');
  doc.setCreator('Gamo Live');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const t of tickets) drawTicket(doc.addPage([612, 792]), t, regular, bold);
  return doc.save({ useObjectStreams: true });
}
