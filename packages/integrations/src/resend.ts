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
  /** Sent as Resend's Idempotency-Key (e.g. the outbox job id); also enables one safe retry. */
  idempotencyKey?: string;
}

export interface EmailSendResult {
  success: boolean;
  id?: string;
  error?: string;
  mock?: boolean;
  /** No real API key and simulation not allowed: nothing was sent (callers should keep the job queued). */
  notConfigured?: boolean;
}

export interface ResendConfig {
  apiKey?: string;
  defaultFrom?: string;
  /** Reply-To used when a message sets none (default hello@gamostudio.org). */
  defaultReplyTo?: string;
  /**
   * Simulate sends when no real key is configured. Only pass `true` for ENVIRONMENT=local;
   * elsewhere an unconfigured client reports `{ success: false, notConfigured: true }`.
   */
  allowMock?: boolean;
  /** Request timeout in milliseconds (default 10 s). */
  timeoutMs?: number;
}

/** gamostudio.org is the verified Resend sending domain; replies go to the same mailbox. */
const DEFAULT_FROM = 'Gamo Studios <hello@gamostudio.org>';
const DEFAULT_REPLY_TO = 'hello@gamostudio.org';
const RESEND_API_ENDPOINT = 'https://api.resend.com/emails';

const isRealKey = (key?: string): key is string =>
  Boolean(key && !key.startsWith('re_mock_') && !key.includes('placeholder'));

/**
 * Creates a lightweight Resend email sender client.
 * Without a real API key it simulates sends only when `allowMock` is set (local development).
 */
export function createResendClient(config?: ResendConfig) {
  const apiKey = config?.apiKey;
  const defaultFrom = config?.defaultFrom || DEFAULT_FROM;
  const defaultReplyTo = config?.defaultReplyTo || DEFAULT_REPLY_TO;
  const timeoutMs = config?.timeoutMs ?? 10_000;

  return {
    async send(options: SendEmailOptions): Promise<EmailSendResult> {
      const from = options.from || defaultFrom;
      const recipients = Array.isArray(options.to) ? options.to : [options.to];

      if (!isRealKey(apiKey)) {
        if (!config?.allowMock) {
          return { success: false, notConfigured: true, error: 'Email delivery is not configured.' };
        }
        const mockId = `mock_msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        return {
          success: true,
          id: mockId,
          mock: true,
        };
      }

      // Live dispatch. With an idempotency key, one retry on network errors, 429 and 5xx.
      const attempts = options.idempotencyKey ? 2 : 1;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        let response: Response;
        try {
          response = await fetch(RESEND_API_ENDPOINT, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
            },
            signal: AbortSignal.timeout(timeoutMs),
            body: JSON.stringify({
              from,
              to: recipients,
              subject: options.subject,
              html: options.html,
              text: options.text,
              reply_to: options.replyTo || defaultReplyTo,
              tags: options.tags,
            }),
          });
        } catch {
          console.error('[Resend Network Error]');
          if (attempt < attempts) continue;
          return { success: false, error: 'Failed to dispatch email via Resend' };
        }

        if (!response.ok) {
          await response.body?.cancel();
          console.error(`[Resend Error] Status ${response.status}`);
          if (attempt < attempts && (response.status === 429 || response.status >= 500)) continue;
          return { success: false, error: `Resend API returned status ${response.status}` };
        }

        const data = (await response.json()) as { id: string };
        return {
          success: true,
          id: data.id,
          mock: false,
        };
      }
      return { success: false, error: 'Failed to dispatch email via Resend' };
    },
  };
}
