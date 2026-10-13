/**
 * Cloudflare Access (Zero Trust) Cryptographic JWT Verification.
 *
 * Implements full RS256 signature, issuer, audience, and expiration verification
 * against Cloudflare Access JWKS (`/cdn-cgi/access/certs`) using the standard Web Crypto API.
 */

interface JwkKey {
  kid: string;
  kty: string;
  alg: string;
  use: string;
  e: string;
  n: string;
}

interface JwksResponse {
  keys: JwkKey[];
  public_cert?: { kid: string; cert: string };
  public_certs?: { kid: string; cert: string }[];
}

export interface CfAccessClaims {
  aud: string[] | string;
  email: string;
  exp: number;
  iat: number;
  nbf: number;
  iss: string;
  type: string;
  identity_nonce: string;
  sub: string;
  country?: string;
}

export interface VerificationResult {
  valid: boolean;
  claims?: CfAccessClaims;
  error?: string;
}

// In-memory JWKS cache per team domain to avoid redundant network roundtrips on edge
const jwksCache = new Map<string, { keys: JwkKey[]; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function parseJsonClaim<T>(str: string): T {
  const binary = base64UrlDecode(str);
  const text = new TextDecoder().decode(binary);
  return JSON.parse(text);
}

async function getJwksKeys(certsUrl: string): Promise<JwkKey[]> {
  const cached = jwksCache.get(certsUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.keys;
  }

  const res = await fetch(certsUrl, { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!res.ok) {
    throw new Error(`Failed to fetch Cloudflare Access JWKS from ${certsUrl} (${res.status})`);
  }

  const data = (await res.json()) as JwksResponse;
  const keys = data.keys || [];
  jwksCache.set(certsUrl, { keys, expiresAt: Date.now() + CACHE_TTL_MS });
  return keys;
}

/**
 * Cryptographically verifies a Cloudflare Access JWT.
 *
 * @param token - The raw `cf-access-jwt-assertion` header value.
 * @param expectedAud - The Cloudflare Access Application AUD tag.
 * @param teamName - Optional team name (e.g. "gamostudios") to verify issuer.
 */
export async function verifyCloudflareAccessJwt(
  token: string | null | undefined,
  expectedAud?: string,
  teamName?: string
): Promise<VerificationResult> {
  if (!expectedAud || !teamName || !/^[a-zA-Z0-9-]+$/.test(teamName)) return { valid: false, error: 'Access verification configuration unavailable' };
  if (!token) {
    return { valid: false, error: 'Missing cf-access-jwt-assertion token' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Malformed JWT format' };
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg: string; kid: string };
  let payload: CfAccessClaims;

  try {
    header = parseJsonClaim<{ alg: string; kid: string }>(headerB64);
    payload = parseJsonClaim<CfAccessClaims>(payloadB64);
  } catch (err) {
    return { valid: false, error: 'Failed to decode JWT header or payload' };
  }

  if (header.alg !== 'RS256') {
    return { valid: false, error: `Unsupported algorithm: ${header.alg} (expected RS256)` };
  }

  // 1. Expiration validation
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(payload.exp) || payload.exp <= nowSec || typeof payload.sub !== 'string' || !payload.sub || typeof payload.email !== 'string') {
    return { valid: false, error: 'Token has expired' };
  }
  if (payload.nbf && payload.nbf > nowSec + 60) {
    return { valid: false, error: 'Token not yet valid (nbf)' };
  }

  // 2. Issuer validation
  if (teamName) {
    const expectedIss = `https://${teamName}.cloudflareaccess.com`;
    if (payload.iss !== expectedIss) {
      return { valid: false, error: `Invalid issuer: ${payload.iss} (expected ${expectedIss})` };
    }
  }

  // 3. Audience validation
  if (expectedAud) {
    const audArray = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audArray.includes(expectedAud)) {
      return { valid: false, error: `Audience mismatch for application ${expectedAud}` };
    }
  }

  // 4. Cryptographic Signature Verification via Web Crypto
  try {
    const certsUrl = `https://${teamName}.cloudflareaccess.com/cdn-cgi/access/certs`;
    const keys = await getJwksKeys(certsUrl);
    const jwkKey = keys.find((k) => k.kid === header.kid);

    if (!jwkKey) {
      return { valid: false, error: `Public key with kid "${header.kid}" not found in JWKS` };
    }

    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwkKey,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
      },
      false,
      ['verify']
    );

    const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signatureBytes = base64UrlDecode(signatureB64);

    const isSignatureValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      signatureBytes as unknown as BufferSource,
      signedData
    );

    if (!isSignatureValid) {
      return { valid: false, error: 'Cryptographic signature verification failed' };
    }

    return { valid: true, claims: payload };
  } catch (err: any) {
    return { valid: false, error: `Signature verification exception: ${err?.message || err}` };
  }
}
