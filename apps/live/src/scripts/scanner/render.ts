/** Fills the result panel (same structure and classes as components/scanner/ScanResultPanel.astro). */
import { TONE_CLASSES, TONE_ICON, TONE_LABEL, toneOf, type ScanTone } from '../../lib/scan-result-style';
import type { ScanOutcomeView } from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';

function icon(tone: ScanTone): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'size-14 shrink-0');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '10.5');
  circle.setAttribute('stroke-width', '1.6');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', TONE_ICON[tone]);
  svg.append(circle, path);
  return svg;
}

function el(tag: string, cls: string, text?: string) {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderOutcome(panel: HTMLElement, outcome: ScanOutcomeView | { error: string }) {
  const isError = 'error' in outcome;
  const tone: ScanTone = isError ? 'stop' : toneOf(outcome.result);
  panel.className = `rounded-[24px] p-5 transition-colors ${TONE_CLASSES[tone]}`;
  const row = el('div', 'flex items-start gap-4');
  row.dataset.result = isError ? 'error' : outcome.result;
  const body = el('div', 'min-w-0');
  body.append(
    el('p', 'text-xs font-bold tracking-[0.2em] uppercase', TONE_LABEL[tone]),
    el('p', 'text-3xl leading-tight font-black uppercase', isError ? 'Not recorded' : outcome.title),
    el('p', 'mt-1 text-base', isError ? outcome.error : outcome.message),
  );
  if (!isError && outcome.ticket) {
    const t = outcome.ticket;
    const parts = [
      t.holder,
      t.category,
      t.section,
      t.zone ? `Zone ${t.zone}` : null,
      t.seatsPerTicket > 1 ? `Group of ${t.seatsPerTicket}` : null,
    ];
    body.append(el('p', 'mt-2 text-base font-semibold', parts.filter(Boolean).join(' · ')));
  }
  if (!isError && outcome.offline)
    body.append(el('p', 'mt-1 text-sm font-semibold', 'Offline — saved on this phone, will sync.'));
  if (!isError && outcome.repeated)
    body.append(el('p', 'mt-1 text-sm', 'Already recorded — showing the earlier result.'));
  row.append(icon(tone), body);
  panel.replaceChildren(row);
}
