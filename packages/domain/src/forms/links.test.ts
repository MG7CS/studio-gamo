import { test } from 'node:test';
import assert from 'node:assert/strict';
import { embedUrl, normalizeLink, vimeoOembedUrl, youtubeOembedUrl } from './links.ts';

const YT = 'dQw4w9WgXcQ';

test('normalizeLink: youtube forms yield the same id and canonical url', () => {
  const canonical = `https://www.youtube.com/watch?v=${YT}`;
  for (const url of [
    `https://youtu.be/${YT}`,
    `https://youtu.be/${YT}?t=10`,
    `https://www.youtube.com/watch?v=${YT}&list=abc`,
    `https://youtube.com/watch?v=${YT}`,
    `https://www.youtube.com/embed/${YT}`,
    `https://www.youtube.com/shorts/${YT}`,
    `  https://youtu.be/${YT}  `,
  ]) {
    assert.deepEqual(normalizeLink(url), { provider: 'youtube', id: YT, canonical }, url);
  }
});

test('normalizeLink: vimeo, drive and dropbox ids are extracted', () => {
  assert.deepEqual(normalizeLink('https://vimeo.com/123456789'), {
    provider: 'vimeo',
    id: '123456789',
    canonical: 'https://vimeo.com/123456789',
  });
  assert.deepEqual(normalizeLink('https://player.vimeo.com/video/123456789?h=abcdef1234'), {
    provider: 'vimeo',
    id: '123456789',
    canonical: 'https://vimeo.com/123456789/abcdef1234',
  });
  const drive = normalizeLink('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing');
  assert.equal(drive?.provider, 'drive');
  assert.equal(drive?.id, '1AbCdEfGhIjKlMnOp');
  assert.equal(drive?.canonical, 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view');
  assert.equal(normalizeLink('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp')?.id, '1AbCdEfGhIjKlMnOp');
  assert.equal(
    normalizeLink('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp')?.canonical,
    'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp',
  );
  const box = normalizeLink(
    'https://www.dropbox.com/scl/fi/abc123xyz/my%20demo.mp4?rlkey=abcdefghij1234&dl=0',
  );
  assert.equal(box?.provider, 'dropbox');
  assert.equal(box?.id, 'abc123xyz');
  assert.equal(box?.canonical, 'https://www.dropbox.com/scl/fi/abc123xyz/my%20demo.mp4?rlkey=abcdefghij1234');
  assert.equal(normalizeLink('https://www.dropbox.com/s/abc123xyz/demo.mp4?dl=0')?.id, 'abc123xyz');
});

test('normalizeLink: rejects http, look-alike hosts, credentials, ports and bad ids', () => {
  for (const url of [
    `http://youtube.com/watch?v=${YT}`,
    'https://evil.com/youtube.com',
    `https://youtube.com.evil.com/watch?v=${YT}`,
    `https://evilyoutube.com/watch?v=${YT}`,
    `https://youtube.com@evil.com/watch?v=${YT}`,
    `https://user:pw@youtube.com/watch?v=${YT}`,
    `https://youtube.com:8443/watch?v=${YT}`,
    `https://m.youtube.com/watch?v=${YT}`,
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/watch?v=<script>alert(1)</script>',
    'https://youtu.be/',
    'https://vimeo.com/not-a-number',
    'https://drive.google.com/file/d/x/view',
    'https://dropbox.com/s/abc123xyz/demo.mp4',
    'javascript:alert(1)',
    'ftp://youtube.com/x',
    'not a url',
    '',
    `https://youtu.be/${YT}\n`.replace(YT, `${YT} extra`),
    `https://youtu.be/${'a'.repeat(3000)}`,
  ]) {
    assert.equal(normalizeLink(url), null, url.slice(0, 80));
  }
  assert.equal(normalizeLink(undefined as never), null);
  assert.equal(normalizeLink(42 as never), null);
});

test('normalizeLink: https only, no credentials, 2048 character ceiling', () => {
  const long = `https://www.youtube.com/watch?v=${YT}&x=${'a'.repeat(2048)}`;
  assert.equal(long.length > 2048, true);
  assert.equal(normalizeLink(long), null);
  const justUnder = `https://www.youtube.com/watch?v=${YT}&x=${'a'.repeat(2048 - 40 - 32)}`;
  assert.ok(justUnder.length <= 2048);
  assert.equal(normalizeLink(justUnder)?.id, YT);
  assert.equal(normalizeLink(`https://admin:secret@youtu.be/${YT}`), null);
  assert.equal(normalizeLink(`https://:secret@youtu.be/${YT}`), null);
  assert.equal(normalizeLink(`HTTP://youtu.be/${YT}`), null);
});

test('oembed and embed builders only use the extracted id', () => {
  assert.equal(
    youtubeOembedUrl(YT),
    `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${YT}`)}&format=json`,
  );
  assert.equal(
    vimeoOembedUrl('123456789'),
    `https://vimeo.com/api/oembed.json?url=${encodeURIComponent('https://vimeo.com/123456789')}`,
  );
  assert.throws(() => youtubeOembedUrl('../etc'));
  assert.throws(() => vimeoOembedUrl('12a'));
  const link = normalizeLink(`https://youtu.be/${YT}`)!;
  assert.equal(embedUrl(link), `https://www.youtube-nocookie.com/embed/${YT}`);
  assert.equal(embedUrl(normalizeLink('https://vimeo.com/123456789')!), null);
});
