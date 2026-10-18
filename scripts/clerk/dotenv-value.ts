#!/usr/bin/env tsx
/**
 * Reads one Clerk value from a `.dev.vars` / `.env` style file for scripts/set-clerk-secrets.sh,
 * without ever putting a value in a terminal, a log or an argument list.
 *
 *   dotenv-value.ts check       <file> <app> <kind>   prints only: missing | test | live | set
 *   dotenv-value.ts fingerprint <file> <app> <kind>   prints a short one-way hash (to spot a key pasted into two products)
 *   dotenv-value.ts value       <file> <app> <kind>   prints the value; refuses to write to a terminal
 *
 * kind: publishable | secret | jwt | issuer
 * The product-suffixed name (PUBLIC_CLERK_PUBLISHABLE_KEY_WEB) is read first, the un-suffixed name
 * Clerk's own tools print (PUBLIC_CLERK_PUBLISHABLE_KEY) second. A missing issuer is derived from the
 * publishable key. PEM keys are returned with real line breaks whether the file holds them over several
 * lines, in quotes, or as one line with literal "\n" sequences.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CLERK_PRODUCTS,
  clerkVariableNames,
  deriveFrontendApiFromPublishableKey,
  isRealClerkValue,
  normalizePemValue,
  type ClerkProductName,
} from '../../packages/config/clerk-env.ts';

export type ClerkKind = 'publishable' | 'secret' | 'jwt' | 'issuer';
const KINDS: ClerkKind[] = ['publishable', 'secret', 'jwt', 'issuer'];

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

function nameFor(app: ClerkProductName, kind: ClerkKind): { suffixed: string; plain: string } {
  const n = clerkVariableNames(app);
  const suffixed = { publishable: n.publishableKey, secret: n.secretKey, jwt: n.jwtKey, issuer: n.issuer }[
    kind
  ];
  return { suffixed, plain: suffixed.slice(0, -(app.length + 1)) };
}

/** The value for `kind`, or undefined. Never logs. */
export function readClerkValue(
  vars: Map<string, string>,
  app: ClerkProductName,
  kind: ClerkKind,
): string | undefined {
  const { suffixed, plain } = nameFor(app, kind);
  const raw = [vars.get(suffixed), vars.get(plain)].find(isRealClerkValue);
  if (raw) return kind === 'jwt' ? normalizePemValue(raw) : unquote(raw.trim());
  if (kind === 'issuer') {
    const pk = readClerkValue(vars, app, 'publishable');
    return deriveFrontendApiFromPublishableKey(pk) ?? undefined;
  }
  return undefined;
}

function unquote(value: string): string {
  return value.replace(/^(["'`])([\s\S]*)\1$/, '$2');
}

export function classify(kind: ClerkKind, value: string | undefined): 'missing' | 'test' | 'live' | 'set' {
  if (!value) return 'missing';
  if (kind === 'publishable')
    return value.startsWith('pk_test_') ? 'test' : value.startsWith('pk_live_') ? 'live' : 'set';
  if (kind === 'secret')
    return value.startsWith('sk_test_') ? 'test' : value.startsWith('sk_live_') ? 'live' : 'set';
  return 'set';
}

export function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function main(argv: string[]): number {
  const [command, file, app, kind] = argv;
  if (
    !['check', 'fingerprint', 'value'].includes(command ?? '') ||
    !file ||
    !CLERK_PRODUCTS.includes(app as ClerkProductName) ||
    !KINDS.includes(kind as ClerkKind)
  ) {
    process.stderr.write('usage: dotenv-value.ts check|fingerprint|value <file> <app> <kind>\n');
    return 2;
  }
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    process.stdout.write(command === 'check' ? 'missing\n' : '');
    return command === 'check' ? 0 : 3;
  }
  const value = readClerkValue(parseDotenv(text), app as ClerkProductName, kind as ClerkKind);
  if (command === 'check') {
    process.stdout.write(`${classify(kind as ClerkKind, value)}\n`);
    return 0;
  }
  if (!value) return 3;
  if (command === 'fingerprint') {
    process.stdout.write(`${fingerprint(value)}\n`);
    return 0;
  }
  if (process.stdout.isTTY) {
    process.stderr.write('refusing to print a secret value to a terminal; pipe it\n');
    return 4;
  }
  process.stdout.write(value);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
