/** Reads `.dev.vars` / `.env` style files for the e2e test servers. Values are never logged. */

/** Parses dotenv text: `KEY=value`, `export KEY=value`, quotes, multi-line quoted values, `#` comments, CRLF. */
export function parseDotenv(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const source = text.replace(/\r\n?/g, '\n');
  let i = 0;
  while (i < source.length) {
    const lineEnd = source.indexOf('\n', i);
    const end = lineEnd === -1 ? source.length : lineEnd;
    const line = source.slice(i, end);
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m || /^\s*#/.test(line)) {
      i = end + 1;
      continue;
    }
    const name = m[1];
    const rest = m[2];
    const quote = rest[0];
    if (quote === '"' || quote === "'" || quote === '`') {
      // Quoted: runs to the matching quote, possibly across lines.
      const start = i + line.length - rest.length + 1;
      let close = source.indexOf(quote, start);
      // A double-quoted value may contain \" ; skip escaped quotes.
      while (quote === '"' && close > start && source[close - 1] === '\\')
        close = source.indexOf(quote, close + 1);
      if (close === -1) {
        out.set(name, rest.slice(1));
        i = end + 1;
        continue;
      }
      let value = source.slice(start, close);
      if (quote === '"') value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\"/g, '"');
      out.set(name, value);
      const after = source.indexOf('\n', close);
      i = after === -1 ? source.length : after + 1;
      continue;
    }
    out.set(name, rest.replace(/\s+#.*$/, '').trim());
    i = end + 1;
  }
  return out;
}
