/**
 * SQL builders for the first preview/production staff account and for retiring an identity.
 * Pure functions: nothing here touches a database or the network. The CLI writes the result to
 * a git-ignored file for the owner to review and run with `wrangler d1 execute`.
 *
 * Timestamps are seconds (Drizzle `mode: 'timestamp'`). Statements use only constructs D1 accepts
 * (no BEGIN/COMMIT) and are safe to run twice.
 */
import { randomBytes } from 'node:crypto';

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function normalizeEmail(input: string): string {
  const email = input.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new Error('Enter a valid email address.');
  return email;
}

/** SQL string literal; only reachable with validated emails, names and hashes, but still escaped. */
export function sqlString(value: string): string {
  if (/[\0\r\n]/.test(value)) throw new Error('Control characters are not allowed in SQL values.');
  return `'${value.replace(/'/g, "''")}'`;
}

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/** Random temporary password without look-alike characters (rejection sampling: no modulo bias). */
export function generateTemporaryPassword(length = 24): string {
  const limit = 256 - (256 % PASSWORD_ALPHABET.length);
  let out = '';
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < limit && out.length < length) out += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
    }
  }
  return out;
}

const seconds = (now: Date) => Math.floor(now.getTime() / 1000);

export interface FirstSuperadminInput {
  email: string;
  displayName: string;
  passwordHash: string;
  now: Date;
  /** Replace an existing credential (rotates a known password). Default: leave an existing one alone. */
  resetPassword?: boolean;
  userId?: string;
}

export function buildFirstSuperadminSql(input: FirstSuperadminInput): string {
  const email = sqlString(normalizeEmail(input.email));
  const name = sqlString(input.displayName.trim() || 'Gamo Studios staff');
  const hash = sqlString(input.passwordHash);
  const t = seconds(input.now);
  const userId = sqlString(input.userId ?? `usr_staff_${randomBytes(6).toString('hex')}`);
  const credentialConflict = input.resetPassword
    ? `ON CONFLICT(user_id) DO UPDATE SET password_hash = excluded.password_hash, must_change_password = 1, failed_attempts = 0, locked_until = NULL, updated_at = excluded.updated_at`
    : `ON CONFLICT(user_id) DO NOTHING`;

  return [
    `-- User: created if new, otherwise made active and verified (the existing id is kept).`,
    `INSERT INTO users (id, email, verified_email_at, status, created_at, display_name)`,
    `VALUES (${userId}, ${email}, ${t}, 'active', ${t}, ${name})`,
    `ON CONFLICT(email) DO UPDATE SET status = 'active', verified_email_at = COALESCE(users.verified_email_at, excluded.verified_email_at);`,
    ``,
    `-- Role: superadmin (global).`,
    `INSERT INTO roles (id, code, description) VALUES ('role_superadmin', 'superadmin', 'Global system administrator')`,
    `ON CONFLICT(code) DO NOTHING;`,
    ``,
    `INSERT INTO user_roles (id, user_id, role_id, scope_type, scope_id, created_at)`,
    `SELECT 'ur_super_' || u.id, u.id, r.id, NULL, NULL, ${t}`,
    `FROM users u JOIN roles r ON r.code = 'superadmin'`,
    `WHERE u.email = ${email}`,
    `AND NOT EXISTS (SELECT 1 FROM user_roles x WHERE x.user_id = u.id AND x.role_id = r.id AND x.scope_type IS NULL AND x.scope_id IS NULL);`,
    ``,
    `-- Credential: PBKDF2 hash of the temporary password; the account must change it at first sign-in.`,
    `INSERT INTO admin_credentials (user_id, password_hash, must_change_password, failed_attempts, locked_until, updated_at, created_at)`,
    `SELECT u.id, ${hash}, 1, 0, NULL, ${t}, ${t} FROM users u WHERE u.email = ${email}`,
    credentialConflict + ';',
    ...(input.resetPassword
      ? [
          ``,
          `-- Sign out anywhere this account is still signed in.`,
          `UPDATE sessions SET revoked_at = ${t} WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM users WHERE email = ${email});`,
        ]
      : []),
    ``,
  ].join('\n');
}

/** Read-only check: does an account exist for this email, with a credential or roles? */
export function buildInspectUserSql(emailInput: string): string {
  const email = sqlString(normalizeEmail(emailInput));
  return [
    `SELECT u.id, u.status, `,
    `  (SELECT COUNT(*) FROM admin_credentials c WHERE c.user_id = u.id) AS has_password,`,
    `  (SELECT COUNT(*) FROM user_roles r WHERE r.user_id = u.id) AS role_grants,`,
    `  (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL) AS open_sessions`,
    `FROM users u WHERE u.email = ${email};`,
    ``,
  ].join('\n');
}

/** Retires an identity: signs it out, removes its password and roles, and blocks it. Reversible by re-creating it. */
export function buildDisableUserSql(emailInput: string, now: Date): string {
  const email = sqlString(normalizeEmail(emailInput));
  const t = seconds(now);
  const who = `(SELECT id FROM users WHERE email = ${email})`;
  return [
    `UPDATE sessions SET revoked_at = ${t} WHERE revoked_at IS NULL AND user_id IN ${who};`,
    `DELETE FROM admin_credentials WHERE user_id IN ${who};`,
    `DELETE FROM user_roles WHERE user_id IN ${who};`,
    `UPDATE users SET status = 'disabled' WHERE email = ${email};`,
    ``,
  ].join('\n');
}
