/**
 * Stripe webhook signatures (docs/LIVE_PAYMENTS.md §4): `Stripe-Signature: t=<seconds>,v1=<hex>[,v1=<hex>…]`, the
 * HMAC-SHA256 of `<t>.<raw body>` with the endpoint's signing secret. Several `v1` values (and several secrets)
 * are accepted during a secret roll; `v0` and unknown schemes are ignored. Compared in constant time, 300 s
 * tolerance, JSON parsed only after a signature matched. Shared by the webhook receiver and the stand-in.
 */
import { constantTimeEqual, hmacSha256Hex } from '../../security/crypto.ts';
import type { StripeEvent } from '../paid-types.ts';
import type { VerifyStripeSignature } from './types.ts';

export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** The `Stripe-Signature` header for a body (tests and the stand-in). */
export async function signStripePayload(body: string, secret: string, t: number): Promise<string> {
  return `t=${t},v1=${await hmacSha256Hex(secret, `${t}.${body}`)}`;
}

function parseHeader(header: string): { t: number; v1: string[] } | null {
  if (header.length > 4096) return null;
  let t: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 't') {
      if (!/^\d{1,12}$/.test(value) || t !== null) return null;
      t = Number(value);
    } else if (key === 'v1' && /^[0-9a-f]{64}$/.test(value)) v1.push(value);
  }
  if (t === null || v1.length === 0) return null;
  return { t, v1 };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The fields Gamo reads, checked; null when the payload is not a Stripe event. */
export function parseStripeEvent(rawBody: string): StripeEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const { id, type, created, livemode, account, data } = parsed;
  if (typeof id !== 'string' || !/^evt_[A-Za-z0-9_]{1,255}$/.test(id)) return null;
  if (typeof type !== 'string' || !/^[a-z0-9_.]{1,100}$/.test(type)) return null;
  if (typeof created !== 'number' || !Number.isInteger(created)) return null;
  if (typeof livemode !== 'boolean') return null;
  if (!isRecord(data) || !isRecord(data.object)) return null;
  if (
    account !== undefined &&
    account !== null &&
    (typeof account !== 'string' || !/^acct_[A-Za-z0-9_]{1,255}$/.test(account))
  )
    return null;
  const event: StripeEvent = { id, type, created, livemode, data: { object: data.object } };
  if (typeof account === 'string') event.account = account;
  return event;
}

export const verifyStripeSignature: VerifyStripeSignature = async ({
  rawBody,
  signatureHeader,
  secrets,
  now,
  toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS,
}) => {
  if (!signatureHeader || secrets.length === 0) return null;
  const header = parseHeader(signatureHeader);
  if (!header) return null;
  if (Math.abs(now - header.t) > toleranceSeconds) return null;
  let matched = false;
  for (const secret of secrets) {
    if (!secret) continue;
    const expected = await hmacSha256Hex(secret, `${header.t}.${rawBody}`);
    for (const candidate of header.v1) if (constantTimeEqual(expected, candidate)) matched = true;
  }
  return matched ? parseStripeEvent(rawBody) : null;
};
