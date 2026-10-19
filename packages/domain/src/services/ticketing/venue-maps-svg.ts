/**
 * Venue blueprint file checks (design §5.6): a strict, allow-list SVG sanitiser and raster image
 * sniffing. Works on bytes/strings only (no DOM), so it runs the same on Workers and in Node tests.
 *
 * SVG: the file is tokenised and **re-serialised** from the tokens, so nothing the sanitiser did not
 * understand reaches the output. Removed: <script>, <style>, <foreignObject>, <image>, animation
 * elements, unknown and namespaced elements (with their content); every `on*` attribute; `href` /
 * `xlink:href` that is not a same-document `#id`; any attribute (including `style`) that references
 * an external `url(…)`, `javascript:`, `data:`, `@import` or CSS expressions; comments and processing
 * instructions. Rejected outright: DOCTYPE / ENTITY declarations, malformed XML, a root that is not
 * <svg>, very deep or very large documents, no drawable content, and no usable size.
 *
 * The result is still served only as an image (`Content-Security-Policy: sandbox`, `nosniff`) and
 * never inlined into a page.
 */

export const SVG_MAX_BYTES = 1024 * 1024;
export const RASTER_MAX_BYTES = 5 * 1024 * 1024;
const MAX_DEPTH = 64;
const MAX_ELEMENTS = 20_000;
export const MAP_MAX_DIMENSION = 20_000;

const ELEMENTS = new Set([
  'svg',
  'g',
  'defs',
  'title',
  'desc',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'symbol',
  'use',
  'marker',
  'pattern',
  'mask',
]);
/** Removed tag only; children kept. */
const UNWRAP = new Set(['a', 'switch']);
const DRAWABLE = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'use']);

const ATTRIBUTES = new Set([
  'id',
  'class',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'fx',
  'fy',
  'dx',
  'dy',
  'width',
  'height',
  'd',
  'points',
  'transform',
  'viewBox',
  'preserveAspectRatio',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-miterlimit',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'letter-spacing',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientUnits',
  'gradientTransform',
  'spreadMethod',
  'clip-path',
  'clip-rule',
  'clipPathUnits',
  'mask',
  'maskUnits',
  'maskContentUnits',
  'marker-start',
  'marker-mid',
  'marker-end',
  'markerWidth',
  'markerHeight',
  'markerUnits',
  'refX',
  'refY',
  'orient',
  'patternUnits',
  'patternContentUnits',
  'patternTransform',
  'visibility',
  'display',
  'vector-effect',
  'shape-rendering',
  'text-rendering',
  'lengthAdjust',
  'textLength',
  'rotate',
  'version',
  'style',
  'href',
  'xlink:href',
  'xmlns',
  'xmlns:xlink',
  'xml:space',
]);

export type SvgRejection =
  'not_utf8' | 'too_large' | 'doctype' | 'malformed' | 'not_svg' | 'too_complex' | 'empty' | 'no_size';

export type SanitizeSvgResult =
  | { ok: true; svg: string; width: number; height: number; removed: string[] }
  | { ok: false; reason: SvgRejection; message: string };

const MESSAGES: Record<SvgRejection, string> = {
  not_utf8: 'The SVG file is not valid UTF-8 text. Export it again from your drawing program.',
  too_large:
    'SVG blueprints can be at most 1 MB. Simplify the drawing or upload a PNG, JPEG or WebP (up to 5 MB).',
  doctype:
    'SVG files with DOCTYPE or ENTITY declarations are not accepted. Export a plain SVG and try again.',
  malformed: 'The SVG file could not be read (the XML is not well-formed). Export it again and try again.',
  not_svg: 'That file is not an SVG drawing. Upload an SVG, PNG, JPEG or WebP blueprint.',
  too_complex: 'The SVG drawing is too complex. Simplify it or upload a PNG, JPEG or WebP image.',
  empty:
    'Nothing drawable was left in the SVG after removing unsupported content. Upload a PNG, JPEG or WebP image instead.',
  no_size: 'The SVG needs a viewBox or a width and height. Add one and try again.',
};

const reject = (reason: SvgRejection): SanitizeSvgResult => ({
  ok: false,
  reason,
  message: MESSAGES[reason],
});

function decodeEntities(value: string): string | null {
  let bad = false;
  const out = value.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z]+);?/g, (whole, body: string) => {
    if (!whole.endsWith(';')) {
      bad = true;
      return whole;
    }
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code > 0x10ffff || code === 0) {
        bad = true;
        return '';
      }
      return String.fromCodePoint(code);
    }
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (!(body in named)) {
      bad = true;
      return whole;
    }
    return named[body];
  });
  return bad ? null : out;
}

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, '&quot;');

/** True when a decoded value is unsafe anywhere in an SVG attribute. */
function unsafeValue(name: string, value: string): boolean {
  const compact = [...value]
    .filter((ch) => ch.charCodeAt(0) > 0x20)
    .join('')
    .toLowerCase();
  if (compact.includes('javascript:') || compact.includes('vbscript:') || compact.includes('data:'))
    return true;
  if (/@import|expression\(|behavior:|-moz-binding|\\/.test(compact)) return true;
  // Only same-document references: url(#id) / url('#id').
  for (const m of compact.matchAll(/url\(([^)]*)\)?/g))
    if (!/^['"]?#[a-z0-9_.:-]+['"]?$/i.test(m[1] ?? '')) return true;
  if ((name === 'href' || name === 'xlink:href') && !/^#[A-Za-z0-9_.:-]+$/.test(value.trim())) return true;
  return false;
}

interface Token {
  kind: 'open' | 'close' | 'text';
  name?: string;
  attrs?: Array<[string, string]>;
  selfClosing?: boolean;
  text?: string;
}

const NAME = /^[A-Za-z_][-A-Za-z0-9_.:]*/;

function tokenize(src: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) {
      tokens.push({ kind: 'text', text: src.slice(i) });
      break;
    }
    if (lt > i) tokens.push({ kind: 'text', text: src.slice(i, lt) });
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      if (end === -1) return null;
      i = end + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9);
      if (end === -1) return null;
      tokens.push({ kind: 'text', text: escapeText(src.slice(lt + 9, end)) });
      i = end + 3;
      continue;
    }
    if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt + 2);
      if (end === -1) return null;
      i = end + 2;
      continue;
    }
    if (src.startsWith('<!', lt)) return null; // DOCTYPE/ENTITY are rejected earlier; anything else is malformed
    if (src[lt + 1] === '/') {
      const m = NAME.exec(src.slice(lt + 2));
      if (!m) return null;
      const end = src.indexOf('>', lt + 2 + m[0].length);
      if (end === -1 || src.slice(lt + 2 + m[0].length, end).trim() !== '') return null;
      tokens.push({ kind: 'close', name: m[0] });
      i = end + 1;
      continue;
    }
    const m = NAME.exec(src.slice(lt + 1));
    if (!m) return null;
    let j = lt + 1 + m[0].length;
    const attrs: Array<[string, string]> = [];
    let selfClosing = false;
    for (;;) {
      while (j < src.length && /\s/.test(src[j]!)) j++;
      if (j >= src.length) return null;
      if (src[j] === '>') {
        j++;
        break;
      }
      if (src[j] === '/' && src[j + 1] === '>') {
        selfClosing = true;
        j += 2;
        break;
      }
      const an = NAME.exec(src.slice(j));
      if (!an) return null;
      j += an[0].length;
      while (/\s/.test(src[j] ?? '')) j++;
      if (src[j] !== '=') return null;
      j++;
      while (/\s/.test(src[j] ?? '')) j++;
      const quote = src[j];
      if (quote !== '"' && quote !== "'") return null;
      const close = src.indexOf(quote, j + 1);
      if (close === -1) return null;
      const raw = src.slice(j + 1, close);
      if (raw.includes('<')) return null;
      attrs.push([an[0], raw]);
      j = close + 1;
    }
    tokens.push({ kind: 'open', name: m[0], attrs, selfClosing });
    i = j;
  }
  return tokens;
}

function parseLength(value: string | undefined): number | null {
  if (!value) return null;
  const m = /^\s*([0-9]*\.?[0-9]+)\s*(px)?\s*$/.exec(value);
  return m ? Number(m[1]) : null;
}

export function sanitizeSvg(input: Uint8Array | string): SanitizeSvgResult {
  let text: string;
  if (typeof input === 'string') text = input;
  else {
    if (input.byteLength > SVG_MAX_BYTES) return reject('too_large');
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(input);
    } catch {
      return reject('not_utf8');
    }
  }
  if (new TextEncoder().encode(text).byteLength > SVG_MAX_BYTES) return reject('too_large');
  text = text.replace(/^\uFEFF/, '');
  if (/<!DOCTYPE|<!ENTITY|<!ELEMENT|<!ATTLIST/i.test(text)) return reject('doctype');
  const tokens = tokenize(text);
  if (!tokens) return reject('malformed');

  const out: string[] = [];
  const removed = new Set<string>();
  const stack: Array<{ name: string; mode: 'keep' | 'drop' | 'unwrap' }> = [];
  let dropDepth = 0;
  let elements = 0;
  let drawable = 0;
  let rootSeen = false;
  let rootClosed = false;
  let width: number | null = null;
  let height: number | null = null;

  for (const t of tokens) {
    if (t.kind === 'text') {
      if (dropDepth > 0) continue;
      const decoded = decodeEntities(t.text!);
      if (decoded === null) return reject('malformed');
      if (stack.length === 0) {
        if (decoded.trim() !== '') return reject(rootSeen ? 'malformed' : 'not_svg');
        continue;
      }
      out.push(escapeText(decoded));
      continue;
    }
    if (t.kind === 'close') {
      const top = stack.pop();
      if (!top || top.name !== t.name) return reject('malformed');
      if (top.mode === 'drop') dropDepth--;
      else if (top.mode === 'keep') out.push(`</${top.name}>`);
      if (stack.length === 0) rootClosed = true;
      continue;
    }
    // open
    const name = t.name!;
    if (rootClosed) return reject('malformed');
    if (!rootSeen) {
      if (name !== 'svg') return reject('not_svg');
      rootSeen = true;
    }
    if (++elements > MAX_ELEMENTS || stack.length >= MAX_DEPTH) return reject('too_complex');
    let mode: 'keep' | 'drop' | 'unwrap';
    if (dropDepth > 0) mode = 'drop';
    else if (ELEMENTS.has(name)) mode = 'keep';
    else if (UNWRAP.has(name)) mode = 'unwrap';
    else {
      mode = 'drop';
      removed.add(`<${name}>`);
    }
    if (mode === 'keep') {
      const attrs: string[] = [];
      const seen = new Set<string>();
      for (const [an, raw] of t.attrs!) {
        const value = decodeEntities(raw);
        if (value === null) return reject('malformed');
        if (seen.has(an)) return reject('malformed');
        seen.add(an);
        if (/^on/i.test(an)) {
          removed.add('event handler attributes');
          continue;
        }
        if (!ATTRIBUTES.has(an)) {
          if (!an.includes(':') || an.startsWith('xlink:')) removed.add(`${an}=`);
          continue;
        }
        if (unsafeValue(an, value)) {
          removed.add(an === 'href' || an === 'xlink:href' ? 'external links' : `unsafe ${an}`);
          continue;
        }
        if (an === 'xmlns' && value !== 'http://www.w3.org/2000/svg') continue;
        if (an === 'xmlns:xlink' && value !== 'http://www.w3.org/1999/xlink') continue;
        attrs.push(`${an}="${escapeAttr(value)}"`);
      }
      if (stack.length === 0) {
        const get = (k: string) => t.attrs!.find(([n]) => n === k)?.[1];
        const vb = get('viewBox')
          ?.trim()
          .split(/[\s,]+/)
          .map(Number);
        width =
          parseLength(get('width')) ?? (vb && vb.length === 4 && vb.every(Number.isFinite) ? vb[2]! : null);
        height =
          parseLength(get('height')) ?? (vb && vb.length === 4 && vb.every(Number.isFinite) ? vb[3]! : null);
        if (!attrs.some((a) => a.startsWith('xmlns='))) attrs.unshift('xmlns="http://www.w3.org/2000/svg"');
      }
      if (DRAWABLE.has(name)) drawable++;
      out.push(`<${name}${attrs.length ? ` ${attrs.join(' ')}` : ''}${t.selfClosing ? '/>' : '>'}`);
    }
    if (t.selfClosing) {
      if (stack.length === 0) rootClosed = true;
      continue;
    }
    if (mode === 'drop') dropDepth++;
    stack.push({ name, mode });
  }
  if (!rootSeen) return reject('not_svg');
  if (stack.length !== 0 || !rootClosed) return reject('malformed');
  if (drawable === 0) return reject('empty');
  if (!width || !height || width < 1 || height < 1 || width > MAP_MAX_DIMENSION || height > MAP_MAX_DIMENSION)
    return reject('no_size');
  return {
    ok: true,
    svg: `<?xml version="1.0" encoding="UTF-8"?>\n${out.join('')}\n`,
    width: Math.round(width),
    height: Math.round(height),
    removed: [...removed].sort(),
  };
}

export type RasterType = 'image/png' | 'image/jpeg' | 'image/webp';

/** Reads the type and pixel size from the file's own header (the declared type is never trusted). */
export function sniffRaster(bytes: Uint8Array): { type: RasterType; width: number; height: number } | null {
  const b = bytes;
  const u16be = (o: number) => (b[o]! << 8) | b[o + 1]!;
  const u32be = (o: number) => ((b[o]! << 24) >>> 0) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!;
  const ascii = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));
  const ok = (type: RasterType, width: number, height: number) =>
    width >= 1 && height >= 1 && width <= MAP_MAX_DIMENSION && height <= MAP_MAX_DIMENSION
      ? { type, width, height }
      : null;

  if (
    b.length >= 24 &&
    b[0] === 0x89 &&
    ascii(1, 3) === 'PNG' &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    ascii(12, 4) === 'IHDR'
  )
    return ok('image/png', u32be(16), u32be(20));
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) return null;
      const marker = b[o + 1]!;
      if (marker === 0xff) {
        o++;
        continue;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        o += 2;
        continue;
      }
      const len = u16be(o + 2);
      if (len < 2) return null;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return ok('image/jpeg', u16be(o + 7), u16be(o + 5));
      o += 2 + len;
    }
    return null;
  }
  if (b.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const chunk = ascii(12, 4);
    if (chunk === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a)
      return ok('image/webp', (b[26]! | (b[27]! << 8)) & 0x3fff, (b[28]! | (b[29]! << 8)) & 0x3fff);
    if (chunk === 'VP8L' && b[20] === 0x2f) {
      const w = 1 + (b[21]! | ((b[22]! & 0x3f) << 8));
      const h = 1 + ((b[22]! >> 6) | (b[23]! << 2) | ((b[24]! & 0x0f) << 10));
      return ok('image/webp', w, h);
    }
    if (chunk === 'VP8X')
      return ok(
        'image/webp',
        1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)),
        1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)),
      );
  }
  return null;
}

/** Heuristic: does this upload look like SVG text (as opposed to a raster)? */
export function looksLikeSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, 2048))
    .replace(/^\uFEFF/, '')
    .trimStart();
  return (
    head.startsWith('<') && /<svg[\s>]/i.test(head + new TextDecoder().decode(bytes.subarray(2048, 8192)))
  );
}
