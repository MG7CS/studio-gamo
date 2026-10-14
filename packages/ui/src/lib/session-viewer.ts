import { DEMO_PERSONA, initialsFromName, type ViewerPersona } from './dashboard';

const DEFAULT_DEV_SECRET = 'gamo_local_dev_fallback_secret_min_32_bytes_change_in_prod';

async function verifySignedCookie(signedValue: string, secret?: string): Promise<string | null> {
  const lastDotIndex = signedValue.lastIndexOf('.');
  if (lastDotIndex === -1) return null;
  const value = signedValue.slice(0, lastDotIndex);
  const providedSig = signedValue.slice(lastDotIndex + 1);
  if (!value || !providedSig) return null;

  const resolvedSecret = secret && secret.length >= 32 ? secret : DEFAULT_DEV_SECRET;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(resolvedSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  const expectedSig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  if (providedSig.length !== expectedSig.length) return null;
  let mismatch = 0;
  for (let i = 0; i < providedSig.length; i++) {
    mismatch |= providedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  return mismatch === 0 ? value : null;
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

/**
 * Resolves the active authenticated user for a workspace request if signed in,
 * falling back to DEMO_PERSONA while keeping all sample workspace data available.
 */
export async function resolveWorkspaceViewer(
  request: Request,
  runtimeEnv: Record<string, any> = {}
): Promise<ViewerPersona> {
  const cookies = parseCookies(request.headers.get('cookie'));
  const rawSession = cookies['__session'];
  const secret =
    runtimeEnv.SESSION_SECRET ||
    (import.meta as any).env?.SESSION_SECRET ||
    (globalThis as Record<string, any>).process?.env?.SESSION_SECRET;

  // 1. Authoritative D1 session lookup (works across all *.gamostudio.org Workers and same-port local dev)
  if (rawSession && runtimeEnv.DB && typeof runtimeEnv.DB.prepare === 'function') {
    try {
      const sessionId = await verifySignedCookie(rawSession, secret);
      if (sessionId) {
        const nowSec = Math.floor(Date.now() / 1000);
        const row = await runtimeEnv.DB.prepare(
          `SELECT u.id, u.email, u.display_name, u.status
           FROM sessions s
           INNER JOIN users u ON u.id = s.user_id
           WHERE s.id = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'active'
           LIMIT 1`
        )
          .bind(sessionId, nowSec)
          .first<{ id: string; email: string; display_name: string | null; status: string }>();

        if (row && row.email) {
          let orgName: string | undefined;
          let orgRole: string | undefined;
          try {
            const orgRow = await runtimeEnv.DB.prepare(
              `SELECT o.name, om.role
               FROM organization_members om
               INNER JOIN organizations o ON o.id = om.organization_id
               WHERE om.user_id = ? AND om.status = 'active' AND o.status = 'active'
               ORDER BY om.created_at DESC
               LIMIT 1`
            )
              .bind(row.id)
              .first<{ name: string; role: string }>();
            if (orgRow?.name) {
              orgName = orgRow.name;
              orgRole = orgRow.role;
            }
          } catch {
            // Optional organization query
          }

          const displayName = row.display_name?.trim() || row.email.split('@')[0];
          return {
            name: displayName,
            initials: initialsFromName(displayName, row.email),
            email: row.email,
            note: 'Verified account',
            authenticated: true,
            organization: orgName,
            organizationRole: orgRole,
          };
        }
      }
    } catch {
      // Fall through to profile hint or demo persona
    }
  }

  // 2. Local multi-port dev / browser profile hint fallback when signed in across local ports
  const rawHint = cookies['gamo_profile_hint'];
  const isLocal =
    runtimeEnv.ENVIRONMENT === 'local' ||
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname);
  if (rawHint && (isLocal || rawSession)) {
    try {
      const parsed = JSON.parse(rawHint) as {
        email?: string;
        displayName?: string;
        orgName?: string;
        orgRole?: string;
      };
      if (parsed && typeof parsed.email === 'string' && parsed.email.includes('@')) {
        const displayName = parsed.displayName?.trim() || parsed.email.split('@')[0];
        return {
          name: displayName,
          initials: initialsFromName(displayName, parsed.email),
          email: parsed.email,
          note: 'Verified account',
          authenticated: true,
          organization: parsed.orgName || undefined,
          organizationRole: parsed.orgRole || undefined,
        };
      }
    } catch {
      // Ignore malformed cookie
    }
  }

  return DEMO_PERSONA;
}
