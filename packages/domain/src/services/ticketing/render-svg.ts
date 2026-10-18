/**
 * The canonical ticket image (design T-06): a server-rendered SVG, portrait, phone-sized
 * (360 × 640 user units), with a large vector QR on white with a 4-module quiet zone. Served as an
 * `<img>` (never inline), so it needs no fonts or scripts; system sans-serif fonts are used.
 * The browser island turns it into a PNG for long-press saving.
 */
import { QR_QUIET_ZONE, qrMatrix, qrRuns } from './render-qr.ts';
import { TICKET_TERMS_LINE, type TicketRenderModel } from './render-model.ts';

export const TICKET_SVG_WIDTH = 360;
export const TICKET_SVG_HEIGHT = 640;

const INK = '#18181B';
const TERRACOTTA = '#B34E24';
const CREAM = '#F9F6F0';
const SAND = '#EDE6DA';
const MUTED = '#52525B';

export function escapeXml(text: string): string {
  return String(text ?? '').replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  );
}

/** Greedy word wrap by an approximate character budget (sans-serif averages ~0.55 em per glyph). */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = last.length >= maxChars ? `${last.slice(0, maxChars - 1)}…` : `${last}…`;
  }
  return lines;
}

/** The QR as SVG rects (runs) inside a white square of `size` units at (x, y), quiet zone included. */
export function qrSvgGroup(payload: string, x: number, y: number, size: number): string {
  const matrix = qrMatrix(payload);
  const modules = matrix.size + QR_QUIET_ZONE * 2;
  const unit = size / modules;
  const rects = qrRuns(matrix)
    .map(
      ([mx, my, w]) => `<rect x="${mx + QR_QUIET_ZONE}" y="${my + QR_QUIET_ZONE}" width="${w}" height="1"/>`,
    )
    .join('');
  return `<g transform="translate(${x} ${y})"><rect width="${size}" height="${size}" fill="#FFFFFF"/><g transform="scale(${unit.toFixed(5)})" fill="#000000" shape-rendering="crispEdges">${rects}</g></g>`;
}

/** Renders one ticket. A ticket that is not valid shows its status in place of the QR. */
export function renderTicketSvg(t: TicketRenderModel): string {
  const W = TICKET_SVG_WIDTH;
  const font = 'font-family="Inter, \'Helvetica Neue\', Helvetica, Arial, sans-serif"';
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${TICKET_SVG_HEIGHT}" width="${W}" height="${TICKET_SVG_HEIGHT}" role="img" aria-label="${escapeXml(`Ticket for ${t.eventTitle}, ${t.dateLine}, ${t.holderName}`)}">`,
  );
  parts.push(`<rect width="${W}" height="${TICKET_SVG_HEIGHT}" rx="24" fill="${CREAM}"/>`);
  // Header
  parts.push(`<path d="M0 24a24 24 0 0 1 24-24h${W - 48}a24 24 0 0 1 24 24v118H0z" fill="${INK}"/>`);
  parts.push(
    `<text x="24" y="34" ${font} font-size="11" font-weight="700" letter-spacing="1.5" fill="${SAND}">GAMO LIVE · TICKET</text>`,
  );
  const title = wrapText(t.eventTitle.toUpperCase(), 24, 2);
  title.forEach((line, i) =>
    parts.push(
      `<text x="24" y="${64 + i * 26}" ${font} font-size="22" font-weight="900" fill="#FFFFFF">${escapeXml(line)}</text>`,
    ),
  );
  parts.push(
    `<text x="24" y="${title.length > 1 ? 128 : 102}" ${font} font-size="13" font-weight="600" fill="${SAND}">${escapeXml(`${t.dateLine} · ${t.timeLine}`)}</text>`,
  );
  // QR
  const qrSize = 248;
  const qrX = (W - qrSize) / 2;
  const qrY = 158;
  if (t.qrPayload) {
    parts.push(qrSvgGroup(t.qrPayload, qrX, qrY, qrSize));
  } else {
    parts.push(
      `<rect x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" rx="12" fill="${SAND}"/><text x="${W / 2}" y="${qrY + qrSize / 2}" text-anchor="middle" ${font} font-size="18" font-weight="800" fill="${INK}">${escapeXml(t.status === 'refunded' ? 'REFUNDED' : t.status === 'voided' ? 'CANCELLED' : 'NOT VALID')}</text><text x="${W / 2}" y="${qrY + qrSize / 2 + 24}" text-anchor="middle" ${font} font-size="12" fill="${MUTED}">This ticket can no longer be scanned.</text>`,
    );
  }
  // Category badge
  let y = qrY + qrSize + 30;
  const badge = [
    t.categoryName,
    t.categoryBadge && t.categoryBadge !== t.categoryName ? t.categoryBadge : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const badgeText = wrapText(badge, 40, 1)[0] ?? '';
  const badgeWidth = Math.min(W - 48, 18 + badgeText.length * 7.2);
  parts.push(
    `<rect x="24" y="${y - 16}" width="${badgeWidth.toFixed(1)}" height="24" rx="12" fill="${TERRACOTTA}"/><text x="33" y="${y}" ${font} font-size="12" font-weight="800" fill="#FFFFFF">${escapeXml(badgeText)}</text>`,
  );
  y += 30;
  parts.push(
    `<text x="24" y="${y}" ${font} font-size="11" font-weight="700" letter-spacing="1" fill="${MUTED}">HOLDER</text>`,
  );
  parts.push(
    `<text x="24" y="${y + 20}" ${font} font-size="17" font-weight="800" fill="${INK}">${escapeXml(wrapText(t.holderName, 30, 1)[0] ?? '')}</text>`,
  );
  y += 44;
  const venue = wrapText([t.venueName, t.venueAddress].filter(Boolean).join(' · '), 46, 2);
  venue.forEach((line, i) =>
    parts.push(
      `<text x="24" y="${y + i * 17}" ${font} font-size="13" fill="${INK}">${escapeXml(line)}</text>`,
    ),
  );
  y += venue.length * 17 + 6;
  const details = [
    t.sectionName ? `Section ${t.sectionName}` : null,
    t.gateLabel ? `Gate ${t.gateLabel}` : null,
    t.validDays,
    t.ageNote,
  ].filter(Boolean) as string[];
  if (details.length) {
    parts.push(
      `<text x="24" y="${y}" ${font} font-size="13" font-weight="700" fill="${INK}">${escapeXml(wrapText(details.join(' · '), 46, 1)[0] ?? '')}</text>`,
    );
    y += 20;
  }
  // Footer
  parts.push(
    `<line x1="24" y1="${TICKET_SVG_HEIGHT - 52}" x2="${W - 24}" y2="${TICKET_SVG_HEIGHT - 52}" stroke="${SAND}" stroke-width="2"/>`,
  );
  parts.push(
    `<text x="24" y="${TICKET_SVG_HEIGHT - 32}" ${font} font-size="12" font-weight="700" fill="${INK}">Order ${escapeXml(t.orderReference)}</text>`,
  );
  parts.push(
    `<text x="24" y="${TICKET_SVG_HEIGHT - 14}" ${font} font-size="10.5" fill="${MUTED}">${escapeXml(TICKET_TERMS_LINE)}</text>`,
  );
  parts.push('</svg>');
  return parts.join('');
}
