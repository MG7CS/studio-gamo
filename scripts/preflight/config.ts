/**
 * Static checks of apps/<app>/wrangler.toml: placeholder ids and resources shared between
 * environments. Offline, read-only, and prints identifiers only (never secret values).
 *
 * wrangler.toml is parsed with a small reader for the subset these files use (tables, arrays of
 * tables, strings, booleans, inline-table arrays) so the repo needs no extra TOML dependency.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APPS, type PreflightApp } from './requirements.ts';

export type Severity = 'error' | 'warning' | 'info';
export interface Finding {
  severity: Severity;
  app: PreflightApp | 'all';
  env: string;
  code: string;
  message: string;
}

type TomlValue = string | number | boolean | { raw: string } | TomlTable | TomlTable[];
export interface TomlTable {
  [key: string]: TomlValue;
}

function stripComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '#') return line.slice(0, i);
  }
  return line;
}

function descend(root: TomlTable, path: string[], arrayOfTables: boolean): TomlTable {
  let node = root;
  path.forEach((segment, i) => {
    const last = i === path.length - 1;
    const existing = node[segment];
    if (last && arrayOfTables) {
      const list = (Array.isArray(existing) ? existing : []) as TomlTable[];
      const created: TomlTable = {};
      list.push(created);
      node[segment] = list;
      node = created;
    } else if (Array.isArray(existing)) {
      node = existing[existing.length - 1];
    } else {
      node = (existing as TomlTable | undefined) ?? (node[segment] = {} as TomlTable);
    }
  });
  return node;
}

export function parseToml(source: string): TomlTable {
  const root: TomlTable = {};
  let current = root;
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = stripComment(lines[i]).trim();
    if (!line) continue;
    const table = line.match(/^\[\[([^\]]+)\]\]$/) ?? line.match(/^\[([^\]]+)\]$/);
    if (table) {
      const path = table[1].split('.').map((s) => s.trim());
      current = descend(root, path, line.startsWith('[['));
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.startsWith('[')) {
      // Multi-line array: read until brackets balance.
      let depth = 0;
      let raw = '';
      for (let text = value; ; text = stripComment(lines[++i] ?? '').trim()) {
        raw += `${text}\n`;
        for (const c of text) depth += c === '[' ? 1 : c === ']' ? -1 : 0;
        if (depth <= 0 || i >= lines.length - 1) break;
      }
      current[key] = { raw };
      continue;
    }
    if (value === 'true' || value === 'false') current[key] = value === 'true';
    else if (/^-?\d+(\.\d+)?$/.test(value)) current[key] = Number(value);
    else {
      value = value.replace(/^["']|["']$/g, '');
      current[key] = value;
    }
  }
  return root;
}

export interface EnvResources {
  kv: Array<{ binding: string; id: string }>;
  d1: Array<{ binding: string; name: string; id: string }>;
  r2: Array<{ binding: string; bucket: string }>;
  vars: Record<string, string>;
  routes: Array<{ pattern: string; customDomain: boolean }>;
  workerName: string;
  workersDev: boolean | undefined;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const tables = (v: unknown): TomlTable[] => (Array.isArray(v) ? (v as TomlTable[]) : []);

/** `local` is the top level of the file; `preview`/`production` are `[env.<name>]` sections. */
export function resourcesFor(config: TomlTable, env: 'local' | 'preview' | 'production'): EnvResources {
  const section =
    env === 'local' ? config : (((config.env as TomlTable | undefined)?.[env] as TomlTable) ?? {});
  const routesRaw = (section.routes as { raw?: string } | undefined)?.raw ?? '';
  const routes = [...routesRaw.matchAll(/\{[^}]*\}/g)].map((m) => ({
    pattern: m[0].match(/pattern\s*=\s*"([^"]*)"/)?.[1] ?? '',
    customDomain: /custom_domain\s*=\s*true/.test(m[0]),
  }));
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries((section.vars as TomlTable | undefined) ?? {})) vars[k] = String(v);
  return {
    kv: tables(section.kv_namespaces).map((t) => ({ binding: str(t.binding), id: str(t.id) })),
    d1: tables(section.d1_databases).map((t) => ({
      binding: str(t.binding),
      name: str(t.database_name),
      id: str(t.database_id),
    })),
    r2: tables(section.r2_buckets).map((t) => ({ binding: str(t.binding), bucket: str(t.bucket_name) })),
    vars,
    routes,
    workerName: str(section.name) || str(config.name),
    workersDev: typeof section.workers_dev === 'boolean' ? section.workers_dev : undefined,
  };
}

/** Empty, all-zero or obviously fake identifiers. */
export function isPlaceholderId(id: string): boolean {
  const trimmed = id.trim();
  return (
    trimmed === '' ||
    /^[0-]+1?$/.test(trimmed) ||
    /placeholder|todo|replace|changeme|your[-_ ]|xxx|example|<.*>/i.test(trimmed)
  );
}

export function readAppConfig(repoRoot: string, app: PreflightApp): TomlTable {
  return parseToml(readFileSync(resolve(repoRoot, 'apps', app, 'wrangler.toml'), 'utf8'));
}

const ALL_ENVS = ['local', 'preview', 'production'] as const;

/**
 * Checks the selected apps for the selected deployment environment. Sharing is judged across
 * ALL apps and environments, because the question is whether `env` shares a resource with any other environment.
 */
export function analyzeConfigs(
  repoRoot: string,
  apps: readonly PreflightApp[],
  env: 'preview' | 'production',
): Finding[] {
  const findings: Finding[] = [];
  const add = (f: Omit<Finding, 'env'>) => findings.push({ ...f, env });

  const everything = APPS.map((app) => ({ app, config: readAppConfig(repoRoot, app) }));
  // resource key → set of "app/env" users
  const users = {
    kv: new Map<string, string[]>(),
    d1: new Map<string, string[]>(),
    r2: new Map<string, string[]>(),
  };
  const envsOf = new Map<string, Set<string>>();
  const note = (kind: keyof typeof users, key: string, app: string, e: string) => {
    if (!key) return;
    const id = `${kind}:${key}`;
    users[kind].set(key, [...(users[kind].get(key) ?? []), `${app}/${e}`]);
    envsOf.set(id, (envsOf.get(id) ?? new Set()).add(e));
  };
  for (const { app, config } of everything) {
    for (const e of ALL_ENVS) {
      const r = resourcesFor(config, e);
      r.kv.forEach((k) => note('kv', k.id, app, e));
      r.d1.forEach((d) => note('d1', d.id, app, e));
      r.r2.forEach((b) => note('r2', b.bucket, app, e));
    }
  }

  for (const app of apps) {
    const r = resourcesFor(readAppConfig(repoRoot, app), env);

    if (r.vars.ENVIRONMENT !== env) {
      add({
        severity: 'error',
        app,
        code: 'environment-var',
        message: `[env.${env}.vars] ENVIRONMENT is "${r.vars.ENVIRONMENT ?? ''}", expected "${env}".`,
      });
    }
    for (const flag of ['ALLOW_DEMO_SESSION', 'ALLOW_AUTH_SIMULATION', 'ALLOW_PUBLIC_DEMO_WORKSPACES']) {
      if (r.vars[flag] === 'true')
        add({ severity: 'error', app, code: 'local-flag', message: `${flag} is true in ${env}.` });
    }

    if (r.kv.length === 0)
      add({ severity: 'error', app, code: 'kv-missing', message: 'no kv_namespaces declared.' });
    for (const k of r.kv) {
      if (isPlaceholderId(k.id)) {
        add({
          severity: 'error',
          app,
          code: 'kv-placeholder',
          message: `KV ${k.binding} id is empty or a placeholder ("${k.id}").`,
        });
        continue;
      }
      const other = [...(envsOf.get(`kv:${k.id}`) ?? [])].filter((e) => e !== env);
      if (other.length > 0) {
        add({
          severity: 'error',
          app,
          code: 'kv-shared',
          message: `KV ${k.binding} id ${k.id} is also used by: ${other.join(', ')} (CLEANUP_LOG H-01). Create a separate namespace for ${env}.`,
        });
      }
    }

    if (r.d1.length === 0)
      add({ severity: 'error', app, code: 'd1-missing', message: 'no d1_databases declared.' });
    for (const d of r.d1) {
      if (isPlaceholderId(d.id)) {
        add({
          severity: 'error',
          app,
          code: 'd1-placeholder',
          message: `D1 ${d.binding} database_id is empty or a placeholder ("${d.id}").`,
        });
        continue;
      }
      const other = [...(envsOf.get(`d1:${d.id}`) ?? [])].filter((e) => e !== env);
      if (other.length > 0)
        add({
          severity: 'error',
          app,
          code: 'd1-shared',
          message: `D1 ${d.name} (${d.id}) is also used by: ${other.join(', ')}.`,
        });
    }

    if (r.r2.length === 0)
      add({ severity: 'warning', app, code: 'r2-missing', message: 'no r2_buckets declared.' });
    for (const b of r.r2) {
      if (!b.bucket) {
        add({ severity: 'error', app, code: 'r2-empty', message: `R2 ${b.binding} bucket_name is empty.` });
        continue;
      }
      const other = [...(envsOf.get(`r2:${b.bucket}`) ?? [])].filter((e) => e !== env);
      if (other.length > 0)
        add({
          severity: 'error',
          app,
          code: 'r2-shared',
          message: `R2 bucket ${b.bucket} is also used by: ${other.join(', ')}.`,
        });
    }

    if (env === 'production' && !r.routes.some((x) => x.customDomain && x.pattern))
      add({
        severity: 'error',
        app,
        code: 'route-missing',
        message: 'no custom_domain route for production.',
      });
    if (app === 'admin' && r.workersDev !== false)
      add({
        severity: 'error',
        app,
        code: 'admin-public',
        message: 'admin must set workers_dev = false (reachable only behind Cloudflare Access).',
      });
    if (!r.workerName) add({ severity: 'error', app, code: 'worker-name', message: 'worker name is empty.' });
  }

  // Duplicate worker names between environments would make one deploy overwrite the other.
  for (const app of apps) {
    const preview = resourcesFor(readAppConfig(repoRoot, app), 'preview').workerName;
    const production = resourcesFor(readAppConfig(repoRoot, app), 'production').workerName;
    if (preview === production)
      add({
        severity: 'error',
        app,
        code: 'worker-name-shared',
        message: `preview and production deploy to the same Worker name "${preview}".`,
      });
  }
  return findings;
}
