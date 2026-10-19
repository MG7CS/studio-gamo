// Test-only workerd adapter: real application route handlers + browser E2E test harness pages, no deployed route.
import { POST as login, DELETE as logout } from '../../apps/live/src/pages/api/auth/session';
// Gamo Live's own auth handlers: the journey creates Live events, which require a Live account.
import { POST as challenge } from '../../apps/live/src/pages/api/auth/challenge';
import { POST as verify } from '../../apps/live/src/pages/api/auth/verify';
import { GET as me } from '../../apps/live/src/pages/api/auth/me';
import { POST as createOrg } from '../../apps/live/src/pages/api/organizations/index';
import { GET as list, POST as create } from '../../apps/live/src/pages/api/events/index';
import { GET as detail } from '../../apps/live/src/pages/api/events/[id]/index';
import { POST as register } from '../../apps/live/src/pages/api/events/[id]/register';
import { POST as confirmOrder } from '../../apps/live/src/pages/api/orders/confirm';
import { getTermsDocument, orderVerificationCode, readConfirmToken } from '../../packages/domain/index';
import { POST as review } from '../../apps/admin/src/pages/api/events/[id]/review';
import { GET as pending } from '../../apps/admin/src/pages/api/events/pending';
import { POST as provisionStaff } from '../../apps/admin/src/pages/api/staff/provision';
import { POST as checkout } from '../../apps/live/src/pages/api/checkout/session';
import { POST as webhook } from '../../apps/live/src/pages/api/webhook/stripe';
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

function renderRegisterHtml(eventId: string): string {
  const terms = JSON.stringify(
    ['ticket-terms', 'privacy-policy'].map((slug) => ({ slug, version: getTermsDocument(slug)!.version })),
  );
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Register · Gamo Live</title></head>
<body>
  <main data-free-registration data-event-id="${eventId}">
    <h1>Reserve your free tickets</h1>
    <form data-reg-form>
      <input type="text" name="attendeeName" required minlength="2" placeholder="Grace Walker" />
      <input type="email" name="attendeeEmail" required placeholder="grace@example.org" />
      <input type="number" name="quantity" min="1" max="10" value="1" required />
      <button type="submit" data-reg-submit>Reserve my tickets</button>
    </form>
    <form data-confirm-form hidden>
      <input type="text" name="code" inputmode="numeric" placeholder="123456" />
      <button type="submit" data-confirm-submit>Confirm my tickets</button>
    </form>
    <div data-reg-status hidden role="status" aria-live="polite"></div>
  </main>
  <script>
    const root = document.querySelector('[data-free-registration]');
    const eventId = root.dataset.eventId || '';
    const form = root.querySelector('[data-reg-form]');
    const confirmForm = root.querySelector('[data-confirm-form]');
    const statusEl = root.querySelector('[data-reg-status]');
    const terms = ${terms};
    let confirmToken = '';
    const show = (text) => { statusEl.hidden = false; statusEl.textContent = text; };

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(form);
      const event = await (await fetch('/api/events/' + encodeURIComponent(eventId))).json();
      const email = String(fd.get('attendeeEmail') || '').trim();
      const payload = {
        items: [{ categoryId: event.data.tiers[0].id, quantity: Number(fd.get('quantity') || 1) }],
        purchaserName: String(fd.get('attendeeName') || '').trim(),
        email,
        emailConfirm: email,
        termsAccepted: true,
        termsDocuments: terms,
        idempotencyKey: 'idem_browser_' + Math.random().toString(36).slice(2) + '_' + Date.now(),
        'cf-turnstile-response': 'XXXX.DUMMY.TOKEN.XXXX',
      };
      const res = await fetch('/api/events/' + encodeURIComponent(eventId) + '/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) { show(body.error?.message || 'Registration failed'); return; }
      confirmToken = body.data.confirmToken;
      root.dataset.confirmToken = confirmToken;
      confirmForm.hidden = false;
      show('Check your email for a 6-digit code.');
    });

    confirmForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const res = await fetch('/api/orders/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmToken, code: String(new FormData(confirmForm).get('code') || '') }),
      });
      const body = await res.json();
      if (!res.ok) { show(body.error?.message || 'Confirmation failed'); return; }
      show('Tickets issued: ' + body.data.ticketsIssued);
    });
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
    if (request.method === 'GET' && path === '/test/order-code') {
      // Test-only: the 6-digit code an email would carry (derived with the local development key).
      const token = new URL(request.url).searchParams.get('t') ?? '';
      const orderId = await readConfirmToken(env, token, Math.floor(Date.now() / 1000));
      return Response.json({ code: orderId ? await orderVerificationCode(env, orderId) : null });
    }
    const pageRegMatch = path.match(/^\/events\/([^/]+)\/register$/);
    if (request.method === 'GET' && pageRegMatch) {
      return new Response(renderRegisterHtml(pageRegMatch[1]), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    const match = path.match(/^\/api\/events\/([^/]+)(?:\/(register|review))?$/);
    const handler =
      path === '/api/orders/confirm'
        ? confirmOrder
        : path === '/api/auth/session'
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
                    : path === '/api/events'
                      ? request.method === 'POST'
                        ? create
                        : list
                      : path === '/api/events/pending'
                        ? pending
                        : path === '/api/checkout/session'
                          ? checkout
                          : path === '/api/webhook/stripe'
                            ? webhook
                            : match
                              ? match[2] === 'register'
                                ? register
                                : match[2] === 'review'
                                  ? review
                                  : detail
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
    return handler({ request, params: { id: match?.[1] }, locals } as any);
  },
};
