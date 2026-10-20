/** Reads one cookie from a `Cookie` header. Pure and dependency-free so it can be tested on its own. */

/** `decodeURIComponent` that never throws: malformed input (a lone `%`, `%E0%A4%A`) yields null. */
export function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** The cookie's decoded value, or null when it is absent or its value is not valid percent-encoding. */
export function parseCookie(header: string | null | undefined, name: string): string | null {
  for (const part of String(header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return safeDecode(part.slice(eq + 1).trim());
  }
  return null;
}
