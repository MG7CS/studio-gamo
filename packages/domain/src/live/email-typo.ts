/**
 * A typo hint for the buyer's email at checkout (docs/LIVE_REQUIREMENTS.md §8.2 item 9): "Did you mean …?". The hint is
 * only shown; it is never applied automatically, and the buyer's address is kept exactly as typed (lower-cased).
 *
 * It catches slips of the top-level domain (`.con`, `.cmo`, `.ocm`, `.nte`, `.ogr` …) and near misses of a short list
 * of common mail domains (`gmial.com`, `hotmal.com`), while real look-alike domains (`ymail.com`, `mail.com`,
 * `live.com`, `me.com` …) are left alone.
 */
import { normalizeEmail } from '../security/pii-hash.ts';

/** Domains people commonly use; a near miss of one of these gets a hint. */
export const COMMON_EMAIL_DOMAINS: readonly string[] = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'aol.com',
  'live.com',
  'msn.com',
  'comcast.net',
  'att.net',
  'verizon.net',
  'sbcglobal.net',
  'bellsouth.net',
  'charter.net',
  'cox.net',
  'me.com',
  'mac.com',
  'protonmail.com',
  'proton.me',
];

/** Real domains that look like typos of a common one: never "corrected". */
export const REAL_LOOKALIKE_DOMAINS: readonly string[] = [
  'ymail.com',
  'mail.com',
  'gmx.com',
  'gmx.net',
  'aim.com',
  'email.com',
  'hotmail.co.uk',
  'yahoo.co.uk',
  'googlemail.com',
  'pm.me',
  'hey.com',
  'fastmail.com',
  'zoho.com',
];

/** Top-level domain slips and what was meant. */
const TLD_SLIPS: Readonly<Record<string, string>> = {
  con: 'com',
  cmo: 'com',
  cpm: 'com',
  ocm: 'com',
  vom: 'com',
  xom: 'com',
  comm: 'com',
  coom: 'com',
  cm: 'com',
  om: 'com',
  nte: 'net',
  ent: 'net',
  nett: 'net',
  ogr: 'org',
  rog: 'org',
  orgg: 'org',
};

/** Optimal string alignment distance (Levenshtein plus adjacent transpositions). */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i += 1)
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

/** The address the buyer probably meant, or null when nothing looks wrong. */
export function emailTypoHint(email: string): string | null {
  const e = normalizeEmail(email);
  const at = e.lastIndexOf('@');
  if (at < 1 || at === e.length - 1) return null;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (COMMON_EMAIL_DOMAINS.includes(domain) || REAL_LOOKALIKE_DOMAINS.includes(domain)) return null;

  const labels = domain.split('.');
  const tld = labels[labels.length - 1];
  const fixedTld = labels.length > 1 && TLD_SLIPS[tld] ? TLD_SLIPS[tld] : null;
  const candidate = fixedTld ? [...labels.slice(0, -1), fixedTld].join('.') : domain;
  if (COMMON_EMAIL_DOMAINS.includes(candidate) || REAL_LOOKALIKE_DOMAINS.includes(candidate))
    return `${local}@${candidate}`;

  let best: { domain: string; distance: number } | null = null;
  for (const known of COMMON_EMAIL_DOMAINS) {
    const distance = editDistance(candidate, known);
    const allowed = known.length >= 9 ? 2 : 1;
    if (distance <= allowed && (!best || distance < best.distance)) best = { domain: known, distance };
  }
  if (best) return `${local}@${best.domain}`;
  return fixedTld ? `${local}@${candidate}` : null;
}
