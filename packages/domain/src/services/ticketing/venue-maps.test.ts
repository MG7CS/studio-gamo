import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSvg, sniffRaster } from './venue-maps-svg.ts';
import {
  getSectionAvailability,
  listSections,
  parsePoints,
  readVenueMapImage,
  saveSection,
  uploadVenueMap,
} from './venue-maps.ts';
import { createFixture, issueTickets, seedEvent } from './scanning-test-fixtures.ts';

const NOW = 1_900_000_000;
const SVG_NS = 'xmlns="http://www.w3.org/2000/svg"';
const wrap = (body: string, rootAttrs = '') =>
  `<svg ${SVG_NS} viewBox="0 0 400 300"${rootAttrs}>${body}<rect x="1" y="1" width="10" height="10"/></svg>`;

function clean(svg: string): string {
  const r = sanitizeSvg(svg);
  assert.ok(r.ok, `expected sanitised output, got ${!r.ok && r.reason}`);
  return r.svg;
}

describe('SVG sanitiser (malicious samples)', () => {
  const cases: Array<[string, string, RegExp]> = [
    ['script element', wrap('<script>alert(1)</script>'), /script|alert/i],
    ['script with CDATA', wrap('<script><![CDATA[alert(1)]]></script>'), /script|alert/i],
    ['event handler on root', wrap('', ' onload="alert(1)"'), /onload|alert/i],
    ['event handler mixed case', wrap('<circle cx="5" cy="5" r="2" OnClick="alert(1)"/>'), /onclick|alert/i],
    [
      'foreignObject with HTML',
      wrap(
        '<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script><iframe src="https://evil.example"/></body></foreignObject>',
      ),
      /foreignObject|iframe|evil|script/i,
    ],
    [
      'javascript link',
      wrap('<a href="javascript:alert(1)"><circle cx="5" cy="5" r="2"/></a>'),
      /javascript|<a[\s>]/i,
    ],
    [
      'entity-encoded javascript',
      wrap('<a xlink:href="&#106;avascript:alert(1)"><circle cx="5" cy="5" r="2"/></a>'),
      /javascript|alert/i,
    ],
    ['external use', wrap('<use href="https://evil.example/sprite.svg#x"/>'), /evil/i],
    ['external xlink use', wrap('<use xlink:href="//evil.example/sprite.svg#x"/>'), /evil/i],
    [
      'external CSS url in style',
      wrap('<rect x="0" y="0" width="5" height="5" style="fill:url(https://evil.example/x.png)"/>'),
      /evil/i,
    ],
    [
      'CSS import in style element',
      wrap('<style>@import url(https://evil.example/a.css); rect{fill:red}</style>'),
      /evil|@import|<style/i,
    ],
    [
      'CSS expression',
      wrap('<rect x="0" y="0" width="5" height="5" style="width:expression(alert(1))"/>'),
      /expression|alert/i,
    ],
    [
      'data URI image',
      wrap('<image href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" width="5" height="5"/>'),
      /data:|<image/i,
    ],
    [
      'external image',
      wrap('<image href="https://evil.example/track.png" width="5" height="5"/>'),
      /evil|<image/i,
    ],
    [
      'animation rewriting href',
      wrap(
        '<a href="#ok"><set attributeName="href" to="javascript:alert(1)"/><circle cx="1" cy="1" r="1"/></a>',
      ),
      /javascript|<set/i,
    ],
    [
      'stylesheet processing instruction',
      `<?xml-stylesheet href="https://evil.example/x.css"?>${wrap('')}`,
      /evil|stylesheet/i,
    ],
    [
      'external fill url',
      wrap('<rect x="0" y="0" width="5" height="5" fill="url(https://evil.example/#g)"/>'),
      /evil/i,
    ],
    ['foreign xmlns:xlink value', wrap('', ' xmlns:xlink="https://evil.example/ns"'), /evil/i],
    [
      'namespaced vendor element',
      wrap('<sodipodi:namedview id="x"><script>alert(1)</script></sodipodi:namedview>'),
      /sodipodi|script/i,
    ],
  ];
  for (const [name, input, forbidden] of cases)
    test(`strips ${name}`, () => {
      const out = clean(input);
      assert.doesNotMatch(out, forbidden, out);
      assert.match(out, /<rect x="1" y="1" width="10" height="10"\/>/, 'drawing kept');
      assert.match(
        out,
        /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/,
      );
    });

  test('keeps same-document references and text (escaped)', () => {
    const out = clean(
      wrap(
        '<defs><linearGradient id="g"><stop offset="0" stop-color="#b34e24"/></linearGradient><symbol id="seat"><circle cx="1" cy="1" r="1"/></symbol></defs><use xlink:href="#seat" x="5"/><rect x="0" y="0" width="5" height="5" fill="url(#g)"/><text x="1" y="1">Stage &amp; <![CDATA[<b>front</b>]]></text>',
        ' xmlns:xlink="http://www.w3.org/1999/xlink"',
      ),
    );
    assert.match(out, /<use xlink:href="#seat" x="5"\/>/);
    assert.match(out, /fill="url\(#g\)"/);
    assert.match(out, /Stage &amp; &lt;b&gt;front&lt;\/b&gt;/);
  });

  test('rejects DOCTYPE/entities, malformed XML, non-SVG roots and empty or unsized drawings', () => {
    const bad: Array<[string, string]> = [
      [
        `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY lol "lol">]><svg ${SVG_NS} viewBox="0 0 1 1"><text>&lol;</text></svg>`,
        'doctype',
      ],
      [`<svg ${SVG_NS} viewBox="0 0 1 1"><rect></svg>`, 'malformed'],
      [`<svg ${SVG_NS} viewBox="0 0 1 1"><rect x="1" x="2"/></svg>`, 'malformed'],
      [`<svg ${SVG_NS} viewBox="0 0 1 1"><rect width=5/></svg>`, 'malformed'],
      [`<svg ${SVG_NS} viewBox="0 0 1 1"><text>&nbsp;</text><rect/></svg>`, 'malformed'],
      [`<html><svg ${SVG_NS}/></html>`, 'not_svg'],
      [`<svg ${SVG_NS} viewBox="0 0 1 1"><script>alert(1)</script></svg>`, 'empty'],
      [`<svg ${SVG_NS}><rect width="1" height="1"/></svg>`, 'no_size'],
      [`<svg ${SVG_NS} viewBox="0 0 1 1"><rect/></svg><svg ${SVG_NS}/>`, 'malformed'],
      ['x'.repeat(1024 * 1024 + 1), 'too_large'],
    ];
    for (const [input, reason] of bad) {
      const r = sanitizeSvg(input);
      assert.equal(r.ok, false, input.slice(0, 80));
      if (!r.ok) {
        assert.equal(r.reason, reason, input.slice(0, 80));
        assert.ok(r.message.length > 20, 'tells the organizer what to do');
      }
    }
    assert.equal(sanitizeSvg(new Uint8Array([0x3c, 0xff, 0xfe])).ok, false);
  });

  test('reports what was removed and the drawing size', () => {
    const r = sanitizeSvg(wrap('<script>x</script>', ' onload="x" width="800" height="600"'));
    assert.ok(r.ok);
    assert.equal(r.width, 800);
    assert.equal(r.height, 600);
    assert.deepEqual(r.removed, ['<script>', 'event handler attributes']);
  });
});

function png(width: number, height: number) {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

describe('raster sniffing', () => {
  test('reads PNG, JPEG and WebP sizes from their headers', () => {
    assert.deepEqual(sniffRaster(png(800, 600)), { type: 'image/png', width: 800, height: 600 });
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0x02, 0x58, 0x03, 0x20, 3, 0, 0, 0, 0,
    ]);
    assert.deepEqual(sniffRaster(jpeg), { type: 'image/jpeg', width: 800, height: 600 });
    const webp = new Uint8Array(30);
    webp.set(
      [...'RIFF'].map((c) => c.charCodeAt(0)),
      0,
    );
    webp.set(
      [...'WEBPVP8X'].map((c) => c.charCodeAt(0)),
      8,
    );
    webp.set([0x1f, 0x03, 0x00, 0x57, 0x02, 0x00], 24); // 800 − 1, 600 − 1
    assert.deepEqual(sniffRaster(webp), { type: 'image/webp', width: 800, height: 600 });
    assert.equal(sniffRaster(new TextEncoder().encode('GIF89a......')), null);
    assert.equal(sniffRaster(png(0, 10)), null);
    assert.equal(sniffRaster(new Uint8Array([0x4d, 0x5a, 0, 0])), null, 'an executable is not an image');
  });
});

function memoryBucket() {
  const store = new Map<string, Uint8Array>();
  return {
    store,
    async get(key: string) {
      const v = store.get(key);
      return v ? { arrayBuffer: async () => v.slice().buffer, customMetadata: {} } : null;
    },
    async put(key: string, value: string | ArrayBuffer | Uint8Array | ReadableStream) {
      store.set(key, value instanceof Uint8Array ? value : new TextEncoder().encode(String(value)));
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

describe('blueprints, sections and buyer availability', () => {
  test('upload stores a sanitised SVG by content hash and archives the previous blueprint', async () => {
    const f = await createFixture();
    const eventId = seedEvent(f, { startsAt: NOW + 86400 });
    const bucket = memoryBucket();
    const svg = new TextEncoder().encode(wrap('<script>alert(1)</script>'));
    const first = await uploadVenueMap(f.db, bucket, {
      eventId,
      bytes: svg,
      altText: 'Sample hall',
      now: NOW,
    });
    assert.ok(first.ok);
    assert.deepEqual(first.removed, ['<script>']);
    const [key] = [...bucket.store.keys()];
    assert.match(key!, new RegExp(`^venue_map/${eventId}/[0-9a-f]{64}\\.svg$`));
    assert.ok(!new TextDecoder().decode(bucket.store.get(key!)).includes('script'));
    assert.match(first.map.url, /^\/api\/venue-maps\/vmap_[0-9a-z]+\?v=[0-9a-f]{16}$/);
    const image = await readVenueMapImage(f.db, bucket, first.map.id);
    assert.equal(image?.contentType, 'image/svg+xml');

    const second = await uploadVenueMap(f.db, bucket, {
      eventId,
      bytes: png(1200, 800),
      altText: 'Sample hall v2',
      now: NOW + 5,
    });
    assert.ok(second.ok);
    assert.equal(second.map.mediaType, 'image/png');
    assert.equal(f.q('SELECT venue_map_id AS m FROM events WHERE id = ?', eventId).m, second.map.id);
    assert.equal(f.q('SELECT status FROM venue_maps WHERE id = ?', first.map.id).status, 'archived');
    assert.equal(
      await readVenueMapImage(f.db, bucket, first.map.id),
      null,
      'archived blueprints are not served',
    );

    const fake = await uploadVenueMap(f.db, bucket, {
      eventId,
      bytes: new TextEncoder().encode('MZ this is not an image'),
      altText: 'Sample',
      now: NOW,
    });
    assert.equal(fake.ok, false);
    const noAlt = await uploadVenueMap(f.db, bucket, { eventId, bytes: png(10, 10), altText: ' ', now: NOW });
    assert.equal(noAlt.ok, false);
  });

  test('sections: validation, capacity cannot drop below reserved, availability labels', async () => {
    const f = await createFixture();
    const eventId = seedEvent(f, {
      startsAt: NOW + 86400,
      tiers: [
        { id: 'tier_vip', capacity: 20, price: 4000, name: 'VIP' },
        { id: 'tier_ga', capacity: 100, price: 1500, name: 'General' },
      ],
    });
    const bucket = memoryBucket();
    const up = await uploadVenueMap(f.db, bucket, {
      eventId,
      bytes: png(1000, 500),
      altText: 'Sample hall',
      now: NOW,
    });
    assert.ok(up.ok);
    const points = parsePoints('10,10 200,10 200,150 10,150');
    assert.equal(points?.length, 4);
    assert.equal(parsePoints('10,10 nope'), null);
    const b = await saveSection(f.db, {
      eventId,
      code: 'B',
      name: 'Section B',
      categoryId: 'tier_vip',
      priceCents: null,
      capacity: 12,
      accessible: true,
      points,
      now: NOW,
    });
    assert.ok(b.ok);
    const c = await saveSection(f.db, {
      eventId,
      code: 'C',
      name: 'Section C',
      categoryId: 'tier_ga',
      priceCents: 1000,
      capacity: 2,
      now: NOW,
    });
    assert.ok(c.ok);
    const dup = await saveSection(f.db, {
      eventId,
      code: 'B',
      name: 'Again',
      categoryId: 'tier_ga',
      priceCents: null,
      capacity: 5,
      now: NOW,
    });
    assert.deepEqual(dup.ok ? null : dup.field, 'code');
    const off = await saveSection(f.db, {
      eventId,
      code: 'D',
      name: 'Off map',
      categoryId: 'tier_ga',
      priceCents: null,
      capacity: 5,
      points: [
        [0, 0],
        [2000, 0],
        [0, 10],
      ],
      now: NOW,
    });
    assert.equal(off.ok ? null : off.field, 'points');
    const wrongCat = await saveSection(f.db, {
      eventId,
      code: 'E',
      name: 'E',
      categoryId: 'tier_elsewhere',
      priceCents: null,
      capacity: 5,
      now: NOW,
    });
    assert.equal(wrongCat.ok ? null : wrongCat.field, 'category');

    await issueTickets(f, {
      eventId,
      categoryId: 'tier_vip',
      sectionId: b.ok ? b.id : '',
      quantity: 3,
      now: NOW,
    });
    await issueTickets(f, {
      eventId,
      categoryId: 'tier_ga',
      sectionId: c.ok ? c.id : '',
      quantity: 2,
      now: NOW,
    });
    const lower = await saveSection(f.db, {
      eventId,
      id: b.ok ? b.id : '',
      code: 'B',
      name: 'Section B',
      categoryId: 'tier_vip',
      priceCents: null,
      capacity: 2,
      now: NOW,
    });
    assert.equal(lower.ok, false);
    if (!lower.ok) {
      assert.equal(lower.field, 'capacity');
      assert.match(lower.message, /cannot go below 3/);
    }
    assert.equal((await listSections(f.db, eventId)).find((s) => s.code === 'B')?.capacity, 12);

    const availability = await getSectionAvailability(f.db, eventId);
    assert.equal(availability.map?.width, 1000);
    const [sb, sc] = availability.sections;
    assert.equal(sb.label, 'Section B — VIP — $40.00 — 9 left — wheelchair accessible');
    assert.equal(sb.points?.length, 4);
    assert.equal(sc.soldOut, true);
    assert.equal(sc.label, 'Section C — General — $10.00 — sold out');
  });
});
