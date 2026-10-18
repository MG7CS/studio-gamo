/**
 * "Did you mean …?" for email addresses (design §4.2). Pure and dependency-free so the same rules run
 * in the browser (`forms-client.ts`) and on the server (`emailTypoSuggestion` in validation messages).
 *
 * It only ever *suggests*: callers show a button that fills the field, never an automatic correction.
 * A suggestion is made only when the domain is close to one of a short list of very common mailbox
 * providers, or when its top-level domain is a well-known slip (`.con`, `.cmo`, `.nte`, `.ogr`, …).
 * Unknown but valid-looking domains (a church's own domain, a school, a regional provider) get nothing,
 * and Gamo's own domain is never "corrected".
 */

interface KnownDomain {
  name: string;
  tld: string;
}

/** Most common providers first: ties go to the earlier entry. */
const KNOWN_DOMAINS: readonly KnownDomain[] = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'aol.com',
  'live.com',
  'msn.com',
  'comcast.net',
  'verizon.net',
  'att.net',
  'googlemail.com',
].map((d) => {
  const dot = d.lastIndexOf('.');
  return { name: d.slice(0, dot), tld: d.slice(dot + 1) };
});

/** Real mailbox domains that sit one edit away from a provider above; never suggest for these. */
const VALID_LOOKALIKES = new Set([
  'mail.com',
  'email.com',
  'ymail.com',
  'gmx.com',
  'me.com',
  'mac.com',
  'aim.com',
  'love.com',
  'live.ca',
  'yahoo.ca',
  'hotmail.ca',
]);

/** Our own domain: never suggest anything for it or its subdomains. */
const OWN_DOMAIN = 'gamostudio.org';

/** Top-level-domain slips that are never real TLDs in practice. */
const TLD_TYPOS: Readonly<Record<string, string>> = {
  con: 'com',
  cmo: 'com',
  ocm: 'com',
  vom: 'com',
  xom: 'com',
  cpm: 'com',
  comm: 'com',
  coom: 'com',
  nte: 'net',
  ent: 'net',
  nett: 'net',
  ogr: 'org',
  rog: 'org',
  orgg: 'org',
};

/**
 * Optimal-string-alignment edit distance (insert, delete, substitute, swap adjacent), capped:
 * returns `cap + 1` as soon as the distance is known to exceed `cap`.
 */
export function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    rows.push([i]);
    for (let j = 1; j <= b.length; j++) rows[i].push(i === 0 ? j : 0);
  }
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d = Math.min(d, rows[i - 2][j - 2] + 1);
      rows[i][j] = d;
      rowMin = Math.min(rowMin, d);
    }
    if (rowMin > cap) return cap + 1;
  }
  return Math.min(rows[a.length][b.length], cap + 1);
}

/** How many edits a provider's name tolerates: 1 for short names, 2 for names of 6+ letters. */
function allowedEdits(name: string): number {
  return name.length >= 6 ? 2 : 1;
}

/** The corrected domain for a likely typo, or null. `domain` is compared lower-cased. */
export function suggestEmailDomain(input: string): string | null {
  const domain = String(input).trim().toLowerCase().replace(/\.+$/, '');
  if (!domain || domain.length > 253 || /[^a-z0-9.-]/.test(domain)) return null;
  if (domain === OWN_DOMAIN || domain.endsWith(`.${OWN_DOMAIN}`)) return null;
  if (VALID_LOOKALIKES.has(domain)) return null;
  if (KNOWN_DOMAINS.some((k) => `${k.name}.${k.tld}` === domain)) return null;

  // "gmailcom": the dot was dropped.
  const undotted = domain.replace(/\./g, '');
  for (const k of KNOWN_DOMAINS) if (undotted === `${k.name}${k.tld}`) return `${k.name}.${k.tld}`;

  const dot = domain.lastIndexOf('.');
  if (dot < 1 || dot === domain.length - 1) return null;
  const name = domain.slice(0, dot);
  const typedTld = domain.slice(dot + 1);
  const fixedTld = TLD_TYPOS[typedTld];
  const tld = fixedTld ?? typedTld;

  let best: { domain: string; score: number } | null = null;
  for (const k of KNOWN_DOMAINS) {
    const nameEdits = name === k.name ? 0 : editDistance(name, k.name, 2);
    let score: number;
    if (tld === k.tld) {
      if (nameEdits === 0)
        score = 1; // only the TLD slip (`gmail.con`)
      else if (nameEdits <= allowedEdits(k.name) && (nameEdits === 1 || name[0] === k.name[0]))
        score = nameEdits + (fixedTld ? 1 : 0);
      else continue;
    } else if (nameEdits === 0 && !fixedTld && editDistance(typedTld, k.tld, 1) === 1) {
      score = 1; // `gmail.co`, `yahoo.cm`
    } else continue;
    if (!best || score < best.score) best = { domain: `${k.name}.${k.tld}`, score };
  }
  if (best) return best.domain;

  // A TLD slip on any other domain (`firstchurch.ogr` → `firstchurch.org`).
  return fixedTld ? `${name}.${fixedTld}` : null;
}

/**
 * The full corrected address for a likely typo ("name@gmial.com" → "name@gmail.com"), or null.
 * The local part is kept exactly as typed (trimmed). Use for the client hint and server messages alike.
 */
export function emailTypoSuggestion(email: string): string | null {
  const value = String(email ?? '').trim();
  const at = value.lastIndexOf('@');
  if (at < 1 || at === value.length - 1 || value.length > 320 || /\s/.test(value)) return null;
  const local = value.slice(0, at);
  if (local.includes('@')) return null;
  const domain = suggestEmailDomain(value.slice(at + 1));
  return domain ? `${local}@${domain}` : null;
}

/** Case-insensitive, trimmed comparison used for "Confirm email" (client and server). */
export function emailsMatch(a: string, b: string): boolean {
  return (
    String(a ?? '')
      .trim()
      .toLowerCase() ===
    String(b ?? '')
      .trim()
      .toLowerCase()
  );
}
