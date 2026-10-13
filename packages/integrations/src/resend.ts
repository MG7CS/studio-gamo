/**
 * Resend Email Integration for Cloudflare Workers.
 *
 * Designed to execute cleanly in Cloudflare Workers using standard `fetch`.
 * Credentials must be provided via Worker secrets (`RESEND_API_KEY`), never hardcoded.
 */

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

export interface EmailSendResult {
  success: boolean;
  id?: string;
  error?: string;
  mock?: boolean;
}

export interface ResendConfig {
  apiKey?: string;
  defaultFrom?: string;
}

const DEFAULT_FROM = 'Gamo Studios <notifications@gamostudio.org>';
const RESEND_API_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Creates a lightweight Resend email sender client.
 * If apiKey is omitted or starts with a mock prefix (e.g. re_mock_),
 * emails are safely logged to console in local/preview environments without throwing.
 */
export function createResendClient(config?: ResendConfig) {
  const apiKey = config?.apiKey;
  const defaultFrom = config?.defaultFrom || DEFAULT_FROM;

  return {
    async send(options: SendEmailOptions): Promise<EmailSendResult> {
      const from = options.from || defaultFrom;
      const recipients = Array.isArray(options.to) ? options.to : [options.to];

      // Safe local/preview mock when no key is configured or key is a placeholder
      if (!apiKey || apiKey.startsWith('re_mock_') || apiKey.includes('placeholder')) {
        const mockId = `mock_msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        return {
          success: true,
          id: mockId,
          mock: true,
        };
      }

      // Live dispatch via Cloudflare Workers fetch
      try {
        const response = await fetch(RESEND_API_ENDPOINT, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: recipients,
            subject: options.subject,
            html: options.html,
            text: options.text,
            reply_to: options.replyTo,
            tags: options.tags,
          }),
        });

        if (!response.ok) {
          await response.body?.cancel();
          console.error(`[Resend Error] Status ${response.status}`);
          return {
            success: false,
            error: `Resend API returned status ${response.status}`,
          };
        }

        const data = (await response.json()) as { id: string };
        return {
          success: true,
          id: data.id,
          mock: false,
        };
      } catch (err: any) {
        console.error('[Resend Network Error]');
        return {
          success: false,
          error: 'Failed to dispatch email via Resend',
        };
      }
    },
  };
}
