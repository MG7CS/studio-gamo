/**
 * HTML escaping for transactional email and staff-rendered markup. The sign-in verification email went away
 * with public accounts (2026-11-16); transactional mail is queued through `email-outbox.ts`.
 */

/**
 * Escapes HTML special characters to prevent HTML/script injection in transactional emails.
 */
export function escapeHtml(input: string | null | undefined): string {
  if (!input) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
