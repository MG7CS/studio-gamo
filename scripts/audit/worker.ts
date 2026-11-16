// Test-only workerd adapter: real application route handlers + browser E2E test harness pages, no deployed route.
import { POST as login, DELETE as logout } from '../../apps/academy/src/pages/api/auth/session';
// The shared auth handlers through one product's thin wrappers (Gamo Academy's); every product uses the same ones.
import { POST as challenge } from '../../apps/academy/src/pages/api/auth/challenge';
import { POST as verify } from '../../apps/academy/src/pages/api/auth/verify';
import { GET as me } from '../../apps/academy/src/pages/api/auth/me';
import { POST as createOrg } from '../../apps/academy/src/pages/api/organizations/index';
import { POST as provisionStaff } from '../../apps/admin/src/pages/api/staff/provision';
import { termsDocumentsFor } from '../../packages/domain/src/terms/registry';
import { createR2StorageClient } from '../../packages/integrations/src/storage';

const SIGNUP_TERMS = termsDocumentsFor(['site-terms', 'privacy-policy']).map((d) => ({
  slug: d.slug,
  version: d.version,
}));

function renderSignInHtml(): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Sign In · Gamo Studios</title></head>
<body>
  <main data-verified-auth>
    <h1>Verified Email Sign-In &amp; Organization Onboarding</h1>
    <div data-auth-status hidden role="status" aria-live="polite"></div>

    <form data-step-challenge>
      <input type="email" name="email" required placeholder="pastor@gracechapel.org" />
      <input type="text" name="displayName" placeholder="Pastor David Mensah" />
      <button type="submit" data-btn-challenge>Send Verification Code</button>
    </form>

    <form data-step-verify hidden>
      <p>Code sent to <strong data-verify-email-label></strong></p>
      <input type="text" name="code" required pattern="\\d{6}" maxlength="6" placeholder="123456" />
      <button type="submit" data-btn-verify>Verify &amp; Sign In</button>
      <button type="button" data-btn-reset>Use different email</button>
    </form>

    <div data-step-authenticated hidden>
      <p data-session-summary></p>
      <button type="button" data-btn-signout>Sign out</button>

      <div data-org-current hidden>
        <p data-org-summary></p>
      </div>

      <form data-form-org>
        <input type="text" name="name" required minlength="2" placeholder="Grace Chapel Community" />
        <input type="text" name="slug" required pattern="[a-z0-9-]+" placeholder="grace-chapel" />
        <select name="type">
          <option value="church">Church</option>
          <option value="ministry">Ministry</option>
          <option value="school">School / Academy</option>
          <option value="other">Other Christian Organization</option>
        </select>
        <button type="submit" data-btn-create-org>Create Organization</button>
      </form>
    </div>
  </main>
  <script>
    const SIGNUP_TERMS = ${JSON.stringify(SIGNUP_TERMS)};
    const root = document.querySelector('[data-verified-auth]');
    const statusBox = root.querySelector('[data-auth-status]');
    const stepChallenge = root.querySelector('[data-step-challenge]');
    const stepVerify = root.querySelector('[data-step-verify]');
    const stepAuth = root.querySelector('[data-step-authenticated]');
    const emailLabel = root.querySelector('[data-verify-email-label]');
    const sessionSummary = root.querySelector('[data-session-summary]');
    const orgCurrent = root.querySelector('[data-org-current]');
    const orgSummary = root.querySelector('[data-org-summary]');
    const orgForm = root.querySelector('[data-form-org]');
    let pendingEmail = '';
    let pendingDisplayName = '';

    const setStatus = (msg) => {
      statusBox.hidden = false;
      statusBox.textContent = msg;
    };

    const refreshMe = async () => {
      const res = await fetch('/api/auth/me', { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        stepChallenge.hidden = false;
        stepVerify.hidden = true;
        stepAuth.hidden = true;
        return;
      }
      const body = await res.json();
      const data = body.data;
      if (data?.user) {
        stepChallenge.hidden = true;
        stepVerify.hidden = true;
        stepAuth.hidden = false;
        sessionSummary.textContent = data.user.email + ' (' + (data.user.verifiedEmailAt ? 'Verified' : 'Unverified') + ')';
        const firstOrg = data.memberships?.[0];
        if (firstOrg) {
          orgCurrent.hidden = false;
          orgSummary.textContent = firstOrg.organizationName + ' (' + firstOrg.organizationType + ' · ' + firstOrg.role + ')';
          orgCurrent.dataset.orgId = firstOrg.organizationId;
        } else {
          orgCurrent.hidden = true;
        }
      } else {
        stepChallenge.hidden = false;
        stepVerify.hidden = true;
        stepAuth.hidden = true;
      }
    };

    stepChallenge.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(stepChallenge);
      pendingEmail = String(fd.get('email') || '').trim();
      pendingDisplayName = String(fd.get('displayName') || '').trim();
      const payload = { email: pendingEmail, intent: 'signup', 'cf-turnstile-response': 'XXXX.DUMMY.TOKEN.XXXX' };
      if (pendingDisplayName) payload.displayName = pendingDisplayName;
      const res = await fetch('/api/auth/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatus(body.error?.message || 'Challenge failed');
        return;
      }
      emailLabel.textContent = pendingEmail;
      stepChallenge.hidden = true;
      stepVerify.hidden = false;
      setStatus('Verification code sent');
    });

    stepVerify.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(stepVerify);
      const code = String(fd.get('code') || '').trim();
      const payload = { email: pendingEmail, code, intent: 'signup', terms: SIGNUP_TERMS };
      if (pendingDisplayName) payload.displayName = pendingDisplayName;
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatus(body.error?.message || 'Verification failed');
        return;
      }
      setStatus('Email verified and signed in');
      await refreshMe();
    });

    orgForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(orgForm);
      const payload = {
        name: String(fd.get('name') || '').trim(),
        slug: String(fd.get('slug') || '').trim(),
        type: String(fd.get('type') || 'church'),
      };
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatus(body.error?.message || 'Organization creation failed');
        return;
      }
      setStatus('Organization "' + body.data.organization.name + '" created');
      await refreshMe();
    });

    root.querySelector('[data-btn-signout]').addEventListener('click', async () => {
      await fetch('/api/auth/session', { method: 'DELETE' });
      setStatus('Signed out');
      await refreshMe();
    });

    refreshMe();
  </script>
</body>
</html>`;
}

export default {
  async fetch(request: Request, env: any) {
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/account/signin') {
      return new Response(renderSignInHtml(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    const handler =
      path === '/api/auth/session'
        ? request.method === 'DELETE'
          ? logout
          : login
        : path === '/api/auth/challenge'
          ? challenge
          : path === '/api/auth/verify'
            ? verify
            : path === '/api/auth/me'
              ? me
              : path === '/api/organizations'
                ? createOrg
                : path === '/api/staff/provision'
                  ? provisionStaff
                  : null;
    if (path === '/test/r2') {
      const storage = createR2StorageClient(env.ASSETS, { signingSecret: env.SESSION_SECRET });
      await storage.putObject(
        'restricted_verification/sample/audit.pdf',
        new TextEncoder().encode('%PDF-1.7 fictional'),
        {
          scope: 'restricted_verification',
          accessPolicy: 'restricted',
          ownerUserId: 'sample',
          contentType: 'application/pdf',
        },
      );
      let denied = false;
      try {
        await storage.getObject('restricted_verification/sample/audit.pdf', { isStaff: true });
      } catch {
        denied = true;
      }
      return Response.json({
        denied,
        owner: !!(await storage.getObject('restricted_verification/sample/audit.pdf', { userId: 'sample' })),
      });
    }
    if (!handler) return new Response('Not found', { status: 404 });
    const cfEmail = request.headers.get('cf-access-authenticated-user-email');
    const cfSub = request.headers.get('cf-access-authenticated-user-id');
    const locals: Record<string, any> = { runtime: { env } };
    if (cfEmail) {
      locals.cfAccessUser = { email: cfEmail, sub: cfSub || undefined };
    }
    return handler({ request, params: {}, locals } as any);
  },
};
