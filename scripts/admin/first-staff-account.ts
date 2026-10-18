#!/usr/bin/env tsx
/**
 * Generates, locally, the SQL for the first superadmin on preview/production.
 *
 *   pnpm staff:account:sql --env production [--email you@example.org] [--name "Full Name"] [--reset-password]
 *   pnpm staff:account:sql --env production --disable-user old@example.org
 *
 * Nothing is executed remotely and no network call is made. The temporary password is printed
 * once (to this terminal only); the SQL file holds only its PBKDF2 hash and is git-ignored.
 * The owner reviews the file and runs it with `wrangler d1 execute` (command printed below).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { hashAdminPassword } from '../../packages/auth/index.ts';
import {
  buildDisableUserSql,
  buildFirstSuperadminSql,
  buildInspectUserSql,
  generateTemporaryPassword,
  normalizeEmail,
} from './staff-account-sql.ts';

const repoRoot = resolve(fileURLToPath(import.meta.url), '../../..');
const OUT_DIR = resolve(repoRoot, '.staff-sql');

interface Args {
  env: 'preview' | 'production';
  email?: string;
  name?: string;
  resetPassword: boolean;
  disableUser?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { env: 'production', resetPassword: false };
  let env: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--env') env = argv[++i];
    else if (a === '--email') args.email = argv[++i];
    else if (a === '--name') args.name = argv[++i];
    else if (a === '--reset-password') args.resetPassword = true;
    else if (a === '--disable-user') args.disableUser = argv[++i];
    else if (a !== '--') throw new Error(`Unknown option ${a}`);
  }
  if (env !== 'preview' && env !== 'production') throw new Error('Pass --env preview or --env production.');
  args.env = env;
  return args;
}

function writeSql(name: string, body: string): string {
  mkdirSync(OUT_DIR, { recursive: true, mode: 0o700 });
  const path = resolve(OUT_DIR, name);
  writeFileSync(path, body, { flag: 'wx', mode: 0o600 });
  return path;
}

const executeHint = (env: string, relativeFile: string) =>
  [
    `Review the file, then run it yourself (this script does not):`,
    `  cd apps/admin && pnpm exec wrangler d1 execute gamo-db-${env} --env ${env} --remote --file ../../${relativeFile}`,
  ].join('\n');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');

  if (args.disableUser) {
    const email = normalizeEmail(args.disableUser);
    const header = `-- Generated ${now.toISOString()} for ${args.env}. NOT EXECUTED by the generator.\n-- Retires the identity ${email}: revokes sessions, deletes password and roles, blocks sign-in.\n`;
    const file = writeSql(`disable-user-${args.env}-${stamp}.sql`, header + buildDisableUserSql(email, now));
    console.log(`Wrote ${file}\n`);
    console.log('First, see what exists (read-only):');
    console.log(
      `  cd apps/admin && pnpm exec wrangler d1 execute gamo-db-${args.env} --env ${args.env} --remote --command "${buildInspectUserSql(email).replace(/\s+/g, ' ').trim()}"\n`,
    );
    console.log('If there is nothing to retire (no row), you are done. Otherwise:');
    console.log(executeHint(args.env, `.staff-sql/${file.split('/').pop()}`));
    return;
  }

  let email = args.email;
  if (!email) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    email = await rl.question('Email of the first superadmin (must match their Cloudflare Access login): ');
    rl.close();
  }
  email = normalizeEmail(email);
  const displayName = args.name?.trim() || email.split('@')[0];

  const password = generateTemporaryPassword();
  const passwordHash = await hashAdminPassword(password);
  const header = [
    `-- Generated ${now.toISOString()} for ${args.env}. NOT EXECUTED by the generator.`,
    `-- Creates (or activates) ${email} as superadmin with a temporary password (hash only) that must be changed at first sign-in.`,
    args.resetPassword
      ? `-- --reset-password: replaces any existing credential and signs the account out everywhere.`
      : `-- An existing credential is left untouched; use --reset-password to replace it.`,
    ``,
  ].join('\n');
  const body = buildFirstSuperadminSql({
    email,
    displayName,
    passwordHash,
    now,
    resetPassword: args.resetPassword,
  });
  const fileName = `first-superadmin-${args.env}-${stamp}.sql`;
  const file = writeSql(fileName, header + body);

  console.log(`Wrote ${file} (git-ignored, mode 600)\n`);
  console.log(`Temporary password for ${email} — shown ONCE, store it in a password manager now:\n`);
  console.log(`    ${password}\n`);
  console.log('It must be changed at first sign-in. The SQL file contains only its hash.\n');
  console.log(executeHint(args.env, `.staff-sql/${fileName}`));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Failed to generate the SQL.');
  process.exitCode = 1;
});
