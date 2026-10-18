/**
 * Remote part of the preflight: which required Worker secrets exist, by NAME only.
 *
 * Uses only read-only Wrangler commands (`whoami`, `secret list`). Command output is parsed for
 * names and a coarse status and is never printed, so no value can reach the terminal.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { Finding } from './config.ts';
import { requirementsFor, type DeployEnv, type PreflightApp } from './requirements.ts';

export interface ExecResult {
  status: number | null;
  stdout: string;
  stderr: string;
}
export type Exec = (args: string[], cwd: string) => ExecResult;

export const defaultExec: Exec = (args, cwd) => {
  const r = spawnSync('pnpm', ['exec', 'wrangler', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' },
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};

export type LoginState = 'logged-in' | 'logged-out' | 'unknown';

export function loginState(exec: Exec, repoRoot: string): LoginState {
  const r = exec(['whoami'], resolve(repoRoot, 'apps/web'));
  const text = `${r.stdout}\n${r.stderr}`;
  if (/not authenticated|not logged in|please run .*wrangler login/i.test(text)) return 'logged-out';
  if (r.status === 0 && /account/i.test(text)) return 'logged-in';
  return 'unknown';
}

export type SecretList =
  { kind: 'ok'; names: string[] } | { kind: 'no-worker' } | { kind: 'error'; reason: string };

export function listSecretNames(exec: Exec, repoRoot: string, app: PreflightApp, env: DeployEnv): SecretList {
  const r = exec(['secret', 'list', '--env', env, '--format', 'json'], resolve(repoRoot, 'apps', app));
  const text = `${r.stdout}\n${r.stderr}`;
  if (r.status !== 0) {
    if (/10007|does not exist|not found/i.test(text)) return { kind: 'no-worker' };
    if (/not authenticated|login/i.test(text)) return { kind: 'error', reason: 'not authenticated' };
    return { kind: 'error', reason: `wrangler exited with status ${r.status}` };
  }
  const start = r.stdout.indexOf('[');
  const end = r.stdout.lastIndexOf(']');
  if (start === -1 || end < start) return { kind: 'error', reason: 'unexpected output format' };
  try {
    const parsed = JSON.parse(r.stdout.slice(start, end + 1)) as Array<{ name?: unknown }>;
    return { kind: 'ok', names: parsed.map((s) => String(s.name)).filter(Boolean) };
  } catch {
    return { kind: 'error', reason: 'unexpected output format' };
  }
}

/**
 * Compares the secret names set on a Worker (plus plain vars from wrangler.toml, which also
 * satisfy a requirement) with what the app needs.
 */
export function evaluateSecrets(
  app: PreflightApp,
  env: DeployEnv,
  secretNames: ReadonlySet<string>,
  declaredVars: Readonly<Record<string, string>>,
): Finding[] {
  const req = requirementsFor(app);
  const has = (name: string) => secretNames.has(name) || (declaredVars[name] ?? '') !== '';
  const out: Finding[] = [];
  const add = (severity: Finding['severity'], code: string, message: string) =>
    out.push({ severity, app, env, code, message });

  for (const name of req.required) if (!has(name)) add('error', 'secret-missing', `${name} is not set.`);
  for (const name of req.recommended)
    if (!has(name)) add('warning', 'secret-recommended', `${name} is not set (email sign-in codes need it).`);
  for (const name of req.optional)
    if (!has(name)) add('info', 'secret-optional', `${name} is not set (optional).`);

  if (req.clerk.length > 0) {
    const set = req.clerk.filter(has);
    if (set.length > 0 && set.length < req.clerk.length) {
      const missing = req.clerk.filter((n) => !has(n));
      add('warning', 'clerk-partial', `Clerk is partly configured; missing: ${missing.join(', ')}.`);
    } else if (set.length === 0) {
      add('info', 'clerk-off', 'Clerk not configured (optional; Gamo emailed codes are used).');
    }
  }
  return out;
}
