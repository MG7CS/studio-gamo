/**
 * Video/file link allow-list for form `link` questions (design: "Uploads (cheap video)").
 * Pure string handling: this module never fetches anything. oEmbed helpers only build URLs from an
 * already-extracted id so callers never request an applicant-supplied URL.
 */

export const LINK_PROVIDERS = ['youtube', 'vimeo', 'drive', 'dropbox'] as const;
export type LinkProvider = (typeof LINK_PROVIDERS)[number];

export interface NormalizedLink {
  provider: LinkProvider;
  id: string;
  canonical: string;
}

const MAX_URL_LENGTH = 2048;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{1,12}$/;
const VIMEO_HASH = /^[a-f0-9]{6,20}$/;
const DRIVE_ID = /^[A-Za-z0-9_-]{10,100}$/;
const DROPBOX_ID = /^[A-Za-z0-9_-]{5,100}$/;
const DROPBOX_NAME = /^[A-Za-z0-9._%()~+-]{1,200}$/;
const DROPBOX_RLKEY = /^[a-z0-9]{10,50}$/;

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'youtu.be']);
const VIMEO_HOSTS = new Set(['vimeo.com', 'player.vimeo.com']);

function segments(pathname: string): string[] {
  return pathname
    .split('/')
    .filter((part, i) => part !== '' || i === 0)
    .slice(1);
}

function youtube(url: URL): NormalizedLink | null {
  const parts = segments(url.pathname);
  let id: string | undefined;
  if (url.hostname === 'youtu.be') {
    if (parts.length === 1) id = parts[0];
  } else if (parts.length === 1 && parts[0] === 'watch') {
    id = url.searchParams.get('v') ?? undefined;
  } else if (parts.length === 2 && ['embed', 'shorts', 'live', 'v'].includes(parts[0]!)) {
    id = parts[1];
  }
  if (!id || !YOUTUBE_ID.test(id)) return null;
  return { provider: 'youtube', id, canonical: `https://www.youtube.com/watch?v=${id}` };
}

function vimeo(url: URL): NormalizedLink | null {
  const parts = segments(url.pathname);
  let id: string | undefined;
  let hash: string | undefined = url.searchParams.get('h') ?? undefined;
  if (url.hostname === 'player.vimeo.com') {
    if (parts.length === 2 && parts[0] === 'video') id = parts[1];
  } else if (parts.length === 1) {
    id = parts[0];
  } else if (parts.length === 2) {
    id = parts[0];
    hash = parts[1];
  }
  if (!id || !VIMEO_ID.test(id)) return null;
  if (hash !== undefined && !VIMEO_HASH.test(hash)) hash = undefined;
  return { provider: 'vimeo', id, canonical: `https://vimeo.com/${id}${hash ? `/${hash}` : ''}` };
}

function drive(url: URL): NormalizedLink | null {
  const parts = segments(url.pathname);
  if (parts[0] === 'file' && parts[1] === 'd' && parts[2] && DRIVE_ID.test(parts[2])) {
    return { provider: 'drive', id: parts[2], canonical: `https://drive.google.com/file/d/${parts[2]}/view` };
  }
  const folderAt = parts.indexOf('folders');
  if (parts[0] === 'drive' && folderAt > 0 && parts.length === folderAt + 2) {
    const id = parts[folderAt + 1]!;
    if (DRIVE_ID.test(id)) {
      return { provider: 'drive', id, canonical: `https://drive.google.com/drive/folders/${id}` };
    }
  }
  if ((parts[0] === 'open' || parts[0] === 'uc') && parts.length === 1) {
    const id = url.searchParams.get('id');
    if (id && DRIVE_ID.test(id)) {
      return { provider: 'drive', id, canonical: `https://drive.google.com/file/d/${id}/view` };
    }
  }
  return null;
}

function dropbox(url: URL): NormalizedLink | null {
  const parts = segments(url.pathname);
  const rlkey = url.searchParams.get('rlkey');
  const query = rlkey && DROPBOX_RLKEY.test(rlkey) ? `?rlkey=${rlkey}` : '';
  let id: string | undefined;
  let rest: string[];
  if (parts[0] === 's' || parts[0] === 'sh') {
    id = parts[1];
    rest = parts.slice(2);
  } else if (parts[0] === 'scl' && (parts[1] === 'fi' || parts[1] === 'fo')) {
    if (!query) return null; // new-style links are unusable without their key
    id = parts[2];
    rest = parts.slice(3);
  } else {
    return null;
  }
  if (!id || !DROPBOX_ID.test(id) || rest.length > 3) return null;
  if (rest.some((part) => !DROPBOX_NAME.test(part))) return null;
  const prefix = parts[0] === 'scl' ? `scl/${parts[1]}` : parts[0];
  const path = [prefix, id, ...rest].join('/');
  return { provider: 'dropbox', id, canonical: `https://www.dropbox.com/${path}${query}` };
}

/** Normalize an applicant-supplied link; `null` unless it is a well-formed https link to an allowed host. */
export function normalizeLink(input: string): NormalizedLink | null {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  // eslint-disable-next-line no-control-regex
  if (text === '' || text.length > MAX_URL_LENGTH || /[\s\u0000-\u001f\u007f]/.test(text)) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') return null;
  const host = url.hostname;
  if (YOUTUBE_HOSTS.has(host)) return youtube(url);
  if (VIMEO_HOSTS.has(host)) return vimeo(url);
  if (host === 'drive.google.com') return drive(url);
  if (host === 'www.dropbox.com') return dropbox(url);
  return null;
}

/** oEmbed endpoint for a YouTube video id (URL construction only; the caller does the guarded fetch). */
export function youtubeOembedUrl(id: string): string {
  if (!YOUTUBE_ID.test(id)) throw new Error('Invalid YouTube id.');
  return `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;
}

/** oEmbed endpoint for a Vimeo video id (URL construction only). */
export function vimeoOembedUrl(id: string): string {
  if (!VIMEO_ID.test(id)) throw new Error('Invalid Vimeo id.');
  return `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${id}`)}`;
}

/** Privacy-enhanced embed URL; only YouTube links are embeddable in admin, everything else is `null`. */
export function embedUrl(link: NormalizedLink): string | null {
  if (link.provider !== 'youtube' || !YOUTUBE_ID.test(link.id)) return null;
  return `https://www.youtube-nocookie.com/embed/${link.id}`;
}
