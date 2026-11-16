/**
 * Transactional notification service: dispatches sign-in verification challenge emails via Resend
 * (with safe local mock fallback). HTML-escapes every untrusted field before rendering.
 */

import type { GamoDatabase } from '@gamo/db';
import { createResendClient, type ResendConfig } from '@studio-gamo/integrations/resend';

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

export class NotificationService {
  db: GamoDatabase;
  resendConfig?: ResendConfig;

  constructor(db: GamoDatabase, resendConfig?: ResendConfig) {
    this.db = db;
    this.resendConfig = resendConfig;
  }

  /**
   * Dispatches a 6-digit email verification code for account sign-in.
   */
  async sendVerificationChallengeEmail(params: {
    email: string;
    code: string;
    expiresAt: Date;
    /** Product the person is signing in to, e.g. "Gamo Academy" (default "Gamo Studios"). */
    programName?: string;
    /** Challenge id: sent as the email idempotency key. */
    challengeId?: string;
  }): Promise<{ sent: boolean; deliveryStatus: 'sent' | 'simulated'; messageId?: string; error?: string }> {
    const client = createResendClient(this.resendConfig);
    const safeCode = escapeHtml(params.code);
    const safeEmail = escapeHtml(params.email);
    const expiresMinutes = Math.max(1, Math.round((params.expiresAt.getTime() - Date.now()) / 60000));
    const program = params.programName ?? 'Gamo Studios';
    const safeProgram = escapeHtml(program);

    const html = `<!DOCTYPE html>
<html lang="en">
<body style="font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; background:#F9F6F0; color:#18181B; padding:24px;">
  <div style="max-width:520px; margin:0 auto; background:#FFFFFF; border:1px solid #EDE6DA; border-radius:12px; padding:28px;">
    <p style="font-size:12px; text-transform:uppercase; letter-spacing:0.08em; color:#8F3B18; font-weight:600; margin:0 0 8px;">${safeProgram} · Identity Verification</p>
    <h1 style="font-size:22px; margin:0 0 12px;">Your verification code</h1>
    <p style="font-size:15px; line-height:1.5; color:#3F3F46; margin:0 0 20px;">
      Enter the 6-digit code below to verify <strong>${safeEmail}</strong>. This code expires in ${expiresMinutes} minutes.
    </p>
    <div style="background:#18181B; color:#F9F6F0; font-size:28px; font-weight:700; letter-spacing:0.25em; text-align:center; padding:16px; border-radius:8px; margin:0 0 20px;">
      ${safeCode}
    </div>
    <p style="font-size:12px; color:#57534E; margin:0;">
      If you did not request this code, you can safely ignore this message.
    </p>
  </div>
</body>
</html>`;

    const text = `${program} verification code: ${params.code}\n\nUse this 6-digit code to verify ${params.email}. It expires in ${expiresMinutes} minutes.\n\nIf you did not request this code, you can safely ignore this message.`;

    const res = await client.send({
      to: params.email,
      subject: `Your ${program} verification code`,
      html,
      text,
      tags: [{ name: 'category', value: 'auth_verification' }],
      idempotencyKey: params.challengeId ? `auth_challenge_${params.challengeId}` : undefined,
    });

    return {
      sent: res.success,
      deliveryStatus: res.mock ? 'simulated' : 'sent',
      messageId: res.id,
      error: res.error,
    };
  }
}
