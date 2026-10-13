// Generates Gamo Studios favicons for every app from the official waveform symbol
// (design-reference/branding/svg/gamo-studios-symbol-*.svg). Geometry and colors
// are copied verbatim; only the viewBox is tightened for small sizes.
// Usage: node scripts/generate-favicons.mjs
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const RUST = '#BE5B32';
const CREAM = '#F6EFE4';
const BARS =
	'<rect x="0" y="54" width="22" height="68" rx="11"/><rect x="33" y="25" width="22" height="126" rx="11"/><rect x="66" y="0" width="22" height="176" rx="11"/><rect x="99" y="25" width="22" height="126" rx="11"/><rect x="132" y="54" width="22" height="68" rx="11"/>';
// Square viewBox centred on the 154x176 symbol with minimal padding.
const VIEWBOX = '-15 -4 184 184';

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}"><title>Gamo Studios</title><style>g{fill:${RUST}}@media (prefers-color-scheme:dark){g{fill:${CREAM}}}</style><g>${BARS}</g></svg>\n`;
const flatSvg = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}"><g fill="${fill}">${BARS}</g></svg>`;
// Apple touch icon: iOS ignores transparency, so use the official rust-on-cream pairing.
const appleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-41 -30 236 236"><rect x="-41" y="-30" width="236" height="236" fill="${CREAM}"/><g fill="${RUST}">${BARS}</g></svg>`;

const png = (svg, size) => sharp(Buffer.from(svg), { density: 1200 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

function ico(images) {
	const header = Buffer.alloc(6 + 16 * images.length);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(images.length, 4);
	let offset = header.length;
	images.forEach(({ size, data }, i) => {
		const o = 6 + i * 16;
		header.writeUInt8(size >= 256 ? 0 : size, o);
		header.writeUInt8(size >= 256 ? 0 : size, o + 1);
		header.writeUInt16LE(1, o + 4);
		header.writeUInt16LE(32, o + 6);
		header.writeUInt32LE(data.length, o + 8);
		header.writeUInt32LE(offset, o + 12);
		offset += data.length;
	});
	return Buffer.concat([header, ...images.map((im) => im.data)]);
}

const apps = ['web', 'worship', 'academy', 'live', 'production', 'admin'];
const flat = flatSvg(RUST);
const files = {
	'favicon.svg': Buffer.from(faviconSvg),
	'favicon-16x16.png': await png(flat, 16),
	'favicon-32x32.png': await png(flat, 32),
	'apple-touch-icon.png': await png(appleSvg, 180),
};
files['favicon.ico'] = ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(flat, size) }))));

for (const app of apps) {
	const dir = join(root, 'apps', app, 'public');
	mkdirSync(dir, { recursive: true });
	for (const [name, data] of Object.entries(files)) writeFileSync(join(dir, name), data);
}
console.log(`Wrote ${Object.keys(files).length} files to ${apps.length} apps.`);
