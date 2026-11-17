/**
 * Flash notices for post-redirect-get. A write answers `303` to a page with `?notice=<key>`; the page maps
 * the key to its own wording with `noticeFrom`. Only keys the page declares produce a notice, so a crafted
 * link can never put text of its own on a staff screen.
 */

export type Notice = { kind: 'ok' | 'error'; text: string };

/** The notice for `?notice=<key>`, or null. Own keys only (`__proto__`, `toString` and the like never match). */
export function noticeFrom(url: URL, table: Record<string, Notice>): Notice | null {
  const key = url.searchParams.get('notice');
  if (!key || !Object.prototype.hasOwnProperty.call(table, key)) return null;
  return table[key] ?? null;
}
