import { safeNextPath } from './auth-redirect.ts';
import {
  fieldForApiError,
  GENERIC_AUTH_MESSAGE,
  mapClerkError,
  type MappedAuthError,
} from './auth-errors.ts';

export type AuthScreenMode = 'signin' | 'signup' | 'verify' | 'recover';

export const PROGRAM_TO_PRODUCT_KEY: Record<string, string> = {
  'Gamo Studios': 'web',
  'Gamo Worship': 'worship',
  'Gamo Academy': 'academy',
  'Gamo Live': 'live',
  'Gamo Production': 'production',
};

const PROGRAM_SIGNUP_SUBTEXT: Record<string, string> = {
  'Gamo Live':
    'Create a Gamo Live account to list Christian events, manage an artist or agent profile, or verify your church. Ticket buyers do not need an account.',
  'Gamo Academy':
    'Create a Gamo Academy account to teach or host lessons. Families can register a student without an account.',
  'Gamo Worship':
    'Create a Gamo Worship account to serve as a musician or technician, or to verify your church.',
  'Gamo Production': 'Create a Gamo Production account to join the technician team.',
  'Gamo Studios': 'Create a Gamo Studios account to connect with our mission team.',
};

export function getAuthScreenCopy(
  program: string = 'Gamo Studios',
): Record<AuthScreenMode, { heading: string; subtext: string }> {
  const cleanProgram = program.trim() || 'Gamo Studios';
  const signupSubtext =
    PROGRAM_SIGNUP_SUBTEXT[cleanProgram] ||
    `Register for ${cleanProgram} to access your ${cleanProgram} workspace.`;
  return {
    signin: {
      heading: 'Welcome back',
      subtext: `Sign in to your ${cleanProgram} account with a 6-digit code we email you. There is no password.`,
    },
    signup: {
      heading: `Create your ${cleanProgram} account`,
      subtext: signupSubtext,
    },
    verify: {
      heading: 'Check your email',
      subtext: 'Enter the 6-digit code we emailed to',
    },
    recover: {
      heading: 'Get back into your account',
      subtext: `There are no passwords to reset: enter your email and, if it has a ${cleanProgram} account, we'll email a 6-digit sign-in code. Lost access to that inbox? Write to hello@gamostudio.org.`,
    },
  };
}

export const AUTH_SCREEN_COPY: Record<AuthScreenMode, { heading: string; subtext: string }> =
  getAuthScreenCopy('Gamo Studios');

export function maskEmailAddress(raw: string): string {
  const trimmed = raw.trim();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0) return trimmed || 'you@example.com';
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  if (local.length <= 2) {
    return `${local[0] || ''}•••@${domain}`;
  }
  return `${local.slice(0, 2)}•••${local.slice(-1)}@${domain}`;
}

/** What the sign-up screen collected, carried to the code step and to the Clerk token exchange. */
export interface SignupExtras {
  role?: string;
  terms: { slug: string; version: string }[];
  marketingOptIn: boolean;
}

/** Kept across the Google redirect (sessionStorage, same tab only). */
export const PENDING_SIGNUP_KEY = 'gamo.pendingSignup';

interface ClerkAttempt {
  status: string | null;
  createdSessionId: string | null;
}
interface ClerkRedirectParams {
  strategy: 'oauth_google';
  redirectUrl: string;
  redirectUrlComplete: string;
}
/** The part of the Clerk browser SDK these flows use. */
export interface ClerkLike {
  load(): Promise<void>;
  setActive(params: { session: string }): Promise<void>;
  session?: { getToken(): Promise<string | null> } | null;
  handleRedirectCallback?(
    params: Record<string, string>,
    navigate?: (to: string) => Promise<unknown> | unknown,
  ): Promise<unknown>;
  client: {
    signUp: {
      create(params: { emailAddress: string; firstName?: string; lastName?: string }): Promise<unknown>;
      prepareEmailAddressVerification(params: { strategy: 'email_code' }): Promise<unknown>;
      attemptEmailAddressVerification(params: { code: string }): Promise<ClerkAttempt>;
      authenticateWithRedirect?(params: ClerkRedirectParams): Promise<unknown>;
    };
    signIn: {
      create(params: { identifier: string }): Promise<{
        supportedFirstFactors?: Array<{ strategy?: string; emailAddressId?: string }> | null;
      }>;
      prepareFirstFactor(params: { strategy: 'email_code'; emailAddressId: string }): Promise<unknown>;
      attemptFirstFactor(params: { strategy: 'email_code'; code: string }): Promise<ClerkAttempt>;
      authenticateWithRedirect?(params: ClerkRedirectParams): Promise<unknown>;
    };
  };
}
type ClerkCtor = new (publishableKey: string) => ClerkLike;

export function isConfiguredPublishableKey(key: string): boolean {
  return (
    (key.startsWith('pk_test_') || key.startsWith('pk_live_')) &&
    !key.includes('REPLACE_WITH') &&
    !key.includes('YOUR_') &&
    !key.includes('placeholder')
  );
}

let clerkInstancePromise: Promise<ClerkLike | null> | null = null;

export async function loadClerk(publishableKey: string): Promise<ClerkLike | null> {
  if (!isConfiguredPublishableKey(publishableKey)) return null;
  if (!clerkInstancePromise) {
    clerkInstancePromise = (async () => {
      const w = window as unknown as { Clerk?: ClerkLike };
      if (w.Clerk && typeof w.Clerk.load === 'function') {
        await w.Clerk.load();
        return w.Clerk;
      }
      const mod = await import('@clerk/clerk-js');
      const exports = mod as unknown as { Clerk?: ClerkCtor; default?: ClerkCtor };
      const Ctor = exports.Clerk ?? exports.default;
      if (!Ctor) throw new Error('Clerk SDK failed to load.');
      const clerk = new Ctor(publishableKey);
      await clerk.load();
      w.Clerk = clerk;
      return clerk;
    })();
  }
  return clerkInstancePromise;
}

/**
 * Clerk's own session token lasts about a minute and is only refreshed by Clerk's script, which
 * ordinary pages do not load. So right after Clerk signs the person in, the server verifies the
 * token and starts a normal Gamo session (7 days); that cookie is what keeps them signed in.
 * Returns the server's `next` path (provider onboarding after a sign-up with a role), if any.
 */
export async function exchangeClerkSession(
  clerk: ClerkLike,
  body: { intent: 'signin' | 'signup'; extras?: SignupExtras | null },
): Promise<string | null> {
  const token = await clerk.session?.getToken();
  if (!token) throw new Error(GENERIC_AUTH_MESSAGE);
  const payload =
    body.intent === 'signup' && body.extras
      ? {
          intent: 'signup',
          ...(body.extras.role ? { role: body.extras.role } : {}),
          terms: body.extras.terms,
          marketingOptIn: body.extras.marketingOptIn,
        }
      : { intent: body.intent };
  const res = await fetch('/api/auth/clerk-session', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { next?: string };
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(json.error?.message || GENERIC_AUTH_MESSAGE);
  return json.data?.next ?? null;
}

/** Where to go after signing in: the server's onboarding path, else a safe `?next=`, else /account. */
export function completeRedirect(serverNext?: string | null): void {
  if (serverNext && serverNext.startsWith('/account/')) {
    window.location.assign(serverNext);
    return;
  }
  const searchParams = new URLSearchParams(window.location.search);
  const next = searchParams.get('next') || searchParams.get('returnTo');
  window.location.assign(safeNextPath(next, window.location.origin));
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function initAuthFlow(scope: ParentNode = document): void {
  scope.querySelectorAll<HTMLElement>('[data-verified-auth]').forEach((root) => {
    if (root.dataset.authBound === 'true') return;
    root.dataset.authBound = 'true';

    const initialMode = (root.dataset.authMode || 'signin') as AuthScreenMode;
    const program = (root.dataset.authProgram || 'Gamo Studios').trim();
    const productKey = PROGRAM_TO_PRODUCT_KEY[program] || undefined;
    const screenCopy = getAuthScreenCopy(program);
    const challenge = root.querySelector<HTMLFormElement>('[data-step-challenge]');
    const verify = root.querySelector<HTMLFormElement>('[data-step-verify]');
    const status = root.querySelector<HTMLElement>('[data-auth-status]');
    const headingEl = root.querySelector<HTMLElement>('[data-auth-heading]');
    const subtextEl = root.querySelector<HTMLElement>('[data-auth-subtext]');
    const verifyEmailWrap = root.querySelector<HTMLElement>('[data-verify-email-wrap]');
    const verifyEmailLabel = root.querySelector<HTMLElement>('[data-verify-email-label]');
    const verifyDirectEmailWrap = root.querySelector<HTMLElement>('[data-verify-direct-email]');
    const verifyDirectEmailInput = root.querySelector<HTMLInputElement>('[data-verify-email-input]');
    const signupTopbar = root.querySelector<HTMLElement>('[data-signup-topbar]');
    const backBar = root.querySelector<HTMLElement>('[data-back-bar]');
    const socialAuth = root.querySelector<HTMLElement>('[data-social-auth]');
    const googleButtons = root.querySelectorAll<HTMLButtonElement>('[data-google-auth]');

    if (
      !challenge ||
      !verify ||
      !status ||
      !headingEl ||
      !subtextEl ||
      !verifyEmailWrap ||
      !verifyEmailLabel
    ) {
      return;
    }

    const codeInput = verify.querySelector<HTMLInputElement>('input[name="code"]')!;
    const emailInput = challenge.querySelector<HTMLInputElement>('input[name="email"]');
    const resendBtn = verify.querySelector<HTMLButtonElement>('[data-btn-resend]');
    const firstNameInput = challenge.querySelector<HTMLInputElement>('input[name="firstName"]');
    const lastNameInput = challenge.querySelector<HTMLInputElement>('input[name="lastName"]');
    const termsInput = challenge.querySelector<HTMLInputElement>('input[name="terms_accept"]');

    const params = new URLSearchParams(window.location.search);
    const nextParam = params.get('next') || params.get('returnTo');
    const querySuffix = nextParam ? `?next=${encodeURIComponent(nextParam)}` : '';

    root.querySelectorAll<HTMLAnchorElement>('[data-nav-signin]').forEach((el) => {
      el.href = `/account/signin${querySuffix}`;
    });
    root.querySelectorAll<HTMLAnchorElement>('[data-nav-signup]').forEach((el) => {
      el.href = `/account/signup${querySuffix}`;
    });
    root.querySelectorAll<HTMLAnchorElement>('[data-nav-recover]').forEach((el) => {
      el.href = `/account/recover${querySuffix}`;
    });

    let email = (params.get('email') || '').trim();
    if (email && emailInput && !emailInput.value) emailInput.value = email;
    let displayName = '';
    let extras: SignupExtras | null = null;

    // --- Field errors (aria-invalid + aria-describedby, message next to the field) -------------
    const fieldElements: Record<NonNullable<MappedAuthError['field']>, HTMLElement | null> = {
      email: emailInput,
      code: codeInput,
      name: firstNameInput,
      terms: termsInput,
      turnstile: root.querySelector<HTMLElement>('#auth-turnstile'),
    };
    const clearFieldErrors = () => {
      for (const el of Object.values(fieldElements)) {
        if (!el) continue;
        el.removeAttribute('aria-invalid');
        const errorEl = document.getElementById(`${el.id}-error`);
        if (!errorEl) continue;
        errorEl.hidden = true;
        const text = errorEl.querySelector<HTMLElement>('[data-error-text]');
        if (text) text.textContent = '';
      }
    };
    const showFieldError = (
      field: MappedAuthError['field'] | undefined,
      text: string,
    ): HTMLElement | null => {
      if (!field) return null;
      const el = fieldElements[field];
      if (!el) return null;
      const errorEl = document.getElementById(`${el.id}-error`);
      if (errorEl) {
        const slot = errorEl.querySelector<HTMLElement>('[data-error-text]') ?? errorEl;
        slot.textContent = text;
        errorEl.hidden = false;
      }
      if (el instanceof HTMLInputElement) el.setAttribute('aria-invalid', 'true');
      return el;
    };

    const message = (text: string, options: { focus?: boolean } = {}) => {
      status.hidden = false;
      status.textContent = text;
      if (options.focus) status.focus();
    };
    const fail = (text: string, field?: MappedAuthError['field']) => {
      message(text);
      const el = showFieldError(field, text);
      if (el && typeof el.focus === 'function') el.focus();
      else status.focus();
    };

    const setPhoto = (activeMode: AuthScreenMode) => {
      root.dataset.activeMode = activeMode;
      root.querySelectorAll<HTMLElement>('[data-auth-photo]').forEach((pic) => {
        const isMatch = pic.dataset.authPhoto === activeMode;
        pic.classList.toggle('opacity-100', isMatch);
        pic.classList.toggle('opacity-0', !isMatch);
        pic.classList.toggle('pointer-events-none', !isMatch);
      });
    };

    const intentForRequest = (): 'signin' | 'signup' | 'recover' => {
      if (initialMode === 'signup') return 'signup';
      if (initialMode === 'recover') return 'recover';
      return 'signin';
    };
    const flow = (): 'signin' | 'signup' => (intentForRequest() === 'signup' ? 'signup' : 'signin');

    const setView = (targetMode: AuthScreenMode) => {
      setPhoto(targetMode);
      headingEl.textContent = screenCopy[targetMode].heading;
      subtextEl.textContent = screenCopy[targetMode].subtext;
      verifyEmailWrap.classList.toggle('hidden', targetMode !== 'verify');
      verifyEmailWrap.classList.toggle('block', targetMode === 'verify');
      signupTopbar?.classList.toggle('lg:flex', targetMode === 'signup');
      const showBack = targetMode === 'verify' || targetMode === 'recover';
      backBar?.classList.toggle('hidden', !showBack);
      backBar?.classList.toggle('flex', showBack);
      socialAuth?.classList.toggle('hidden', targetMode !== 'signin' && targetMode !== 'signup');
      challenge.hidden = targetMode === 'verify';
      verify.hidden = targetMode !== 'verify';

      if (targetMode === 'verify') {
        if (email) {
          verifyEmailLabel.textContent = maskEmailAddress(email);
          verifyEmailLabel.title = email;
          verifyDirectEmailWrap?.classList.add('hidden');
        } else {
          verifyEmailLabel.textContent = 'your email address';
          verifyDirectEmailWrap?.classList.remove('hidden');
        }
      }
    };

    if (initialMode === 'verify') setView('verify');

    // --- Turnstile (shared widget below both steps; tokens are single-use) ---------------------
    const turnstileToken = (): string =>
      root.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')?.value.trim() ?? '';
    const resetTurnstile = () => {
      const t = (window as unknown as { turnstile?: { reset(target?: string): void } }).turnstile;
      try {
        t?.reset('#auth-turnstile');
      } catch {
        // The local dummy token has no widget to reset.
      }
    };

    const collectExtras = (form: HTMLFormElement): SignupExtras => {
      const fields = new FormData(form);
      const slugs = fields.getAll('terms_slug').map(String);
      const versions = fields.getAll('terms_version').map(String);
      const accepted = fields.get('terms_accept') === 'yes';
      return {
        role: String(fields.get('role') || '') || undefined,
        terms: accepted ? slugs.map((slug, i) => ({ slug, version: versions[i] ?? '' })) : [],
        marketingOptIn: fields.get('marketing_opt_in') === 'yes' || fields.get('marketing_opt_in') === 'on',
      };
    };

    const clerkPublishableKey = (root.dataset.clerkPublishableKey || '').trim();
    const isClerkConfigured = isConfiguredPublishableKey(clerkPublishableKey);
    let activeClerkFlow: 'signup' | 'signin' | null = null;

    const requestClerkEmailOtp = async (clerk: ClerkLike, targetEmail: string): Promise<void> => {
      const startSignIn = async () => {
        activeClerkFlow = 'signin';
        const attempt = await clerk.client.signIn.create({ identifier: targetEmail });
        const factor = (attempt.supportedFirstFactors || []).find((f) => f?.strategy === 'email_code');
        if (!factor?.emailAddressId) return;
        await clerk.client.signIn.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: factor.emailAddressId,
        });
      };
      try {
        if (flow() === 'signup') {
          activeClerkFlow = 'signup';
          const [firstName, lastName] = [
            firstNameInput?.value.trim() || '',
            lastNameInput?.value.trim() || '',
          ];
          await clerk.client.signUp.create({
            emailAddress: targetEmail,
            ...(firstName ? { firstName } : {}),
            ...(lastName ? { lastName } : {}),
          });
          await clerk.client.signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
          return;
        }
        await startSignIn();
      } catch (err) {
        const mapped = mapClerkError(err, 'request', flow());
        if (mapped.switchToSignIn) {
          // The address already has an account: send a sign-in code instead (same screen, same words).
          try {
            await startSignIn();
          } catch (inner) {
            const again = mapClerkError(inner, 'request', 'signin');
            if (!again.continueAsSent) throw new ApiError(again.message);
          }
          return;
        }
        if (mapped.continueAsSent) return;
        throw new ApiError(mapped.message, mapped.field);
      }
    };

    const postJson = async (url: string, payload: Record<string, unknown>) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as {
        data?: Record<string, unknown>;
        error?: { code?: string; message?: string };
      };
      if (!res.ok) throw new ApiError(body.error?.message || GENERIC_AUTH_MESSAGE, body.error?.code);
      return body.data ?? {};
    };

    const errorField = (err: unknown): MappedAuthError['field'] | undefined => {
      if (!(err instanceof ApiError)) return undefined;
      const code = err.code;
      if (code === 'email' || code === 'code' || code === 'turnstile' || code === 'terms' || code === 'name')
        return code;
      return fieldForApiError(code);
    };

    const sentMessage = (data: Record<string, unknown>) =>
      data.deliveryStatus === 'simulated'
        ? String(data.message || 'Local verification simulation. No email was sent.')
        : String(
            data.message ||
              (flow() === 'signup'
                ? "We've emailed a 6-digit code to confirm your address."
                : `If this address has a ${program} account, we've emailed a 6-digit code.`),
          );

    const requestCode = async (targetEmail: string): Promise<string> => {
      if (isClerkConfigured) {
        const clerk = await loadClerk(clerkPublishableKey);
        if (!clerk) throw new ApiError(GENERIC_AUTH_MESSAGE);
        await requestClerkEmailOtp(clerk, targetEmail);
        return flow() === 'signup'
          ? "We've emailed a 6-digit code to confirm your address."
          : `If this address has a ${program} account, we've emailed a 6-digit code.`;
      }
      const token = turnstileToken();
      const data = await postJson('/api/auth/challenge', {
        email: targetEmail,
        intent: intentForRequest(),
        ...(productKey ? { product: productKey } : {}),
        ...(displayName ? { displayName } : {}),
        ...(token ? { 'cf-turnstile-response': token } : {}),
      });
      resetTurnstile();
      return sentMessage(data);
    };

    challenge.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFieldErrors();
      if (!challenge.reportValidity()) return;
      const fields = new FormData(challenge);
      email = String(fields.get('email') || '').trim();
      const firstName = String(fields.get('firstName') || '').trim();
      const lastName = String(fields.get('lastName') || '').trim();
      displayName = [firstName, lastName].filter(Boolean).join(' ').trim();
      if (flow() === 'signup') {
        extras = collectExtras(challenge);
        if (termsInput && extras.terms.length === 0) {
          fail('Please read and accept the Site Terms and the Privacy Policy to create an account.', 'terms');
          return;
        }
      }

      message('Requesting your code…');
      const submitBtn = challenge.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        const sent = await requestCode(email);
        setView('verify');
        message(sent);
        codeInput.focus();
      } catch (error) {
        resetTurnstile();
        fail(error instanceof Error ? error.message : GENERIC_AUTH_MESSAGE, errorField(error));
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    resendBtn?.addEventListener('click', async () => {
      clearFieldErrors();
      const targetEmail = email || verifyDirectEmailInput?.value.trim() || '';
      if (!targetEmail) {
        message('Enter your email address first to request a code.');
        verifyDirectEmailWrap?.classList.remove('hidden');
        verifyDirectEmailInput?.focus();
        return;
      }
      if (!isClerkConfigured && !turnstileToken()) {
        fail('Complete the security check below, then select “Resend code”.', 'turnstile');
        return;
      }
      email = targetEmail;
      resendBtn.disabled = true;
      message('Sending a new code…');
      try {
        const sent = await requestCode(email);
        verifyEmailLabel.textContent = maskEmailAddress(email);
        message(sent);
        codeInput.focus();
      } catch (error) {
        resetTurnstile();
        fail(error instanceof Error ? error.message : GENERIC_AUTH_MESSAGE, errorField(error));
      } finally {
        resendBtn.disabled = false;
      }
    });

    codeInput.addEventListener('input', () => {
      const digits = codeInput.value.replace(/\D/g, '').slice(0, 6);
      if (digits !== codeInput.value) codeInput.value = digits;
    });

    verify.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFieldErrors();
      if (!email && verifyDirectEmailInput?.value.trim()) email = verifyDirectEmailInput.value.trim();
      if (!email) {
        message('Enter your email address so we can check your code.');
        verifyDirectEmailWrap?.classList.remove('hidden');
        verifyDirectEmailInput?.focus();
        return;
      }
      if (!verify.reportValidity()) return;
      const code = String(new FormData(verify).get('code') || '').trim();
      message('Checking your code…');
      const submitBtn = verify.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        if (isClerkConfigured) {
          const clerk = await loadClerk(clerkPublishableKey);
          if (!clerk) throw new ApiError(GENERIC_AUTH_MESSAGE);
          const clerkFlow = activeClerkFlow || flow();
          let attempt: ClerkAttempt;
          try {
            attempt =
              clerkFlow === 'signup'
                ? await clerk.client.signUp.attemptEmailAddressVerification({ code })
                : await clerk.client.signIn.attemptFirstFactor({ strategy: 'email_code', code });
          } catch (err) {
            const mapped = mapClerkError(err, 'verify', clerkFlow);
            throw new ApiError(mapped.message, mapped.field);
          }
          if (attempt.status !== 'complete' || !attempt.createdSessionId)
            throw new ApiError(GENERIC_AUTH_MESSAGE);
          await clerk.setActive({ session: attempt.createdSessionId });
          const next = await exchangeClerkSession(clerk, {
            intent: clerkFlow,
            extras: clerkFlow === 'signup' ? extras : null,
          });
          completeRedirect(next);
          return;
        }

        const data = await postJson('/api/auth/verify', {
          email,
          code,
          intent: intentForRequest(),
          ...(productKey ? { product: productKey } : {}),
          ...(displayName ? { displayName } : {}),
          ...(flow() === 'signup' && extras
            ? {
                ...(extras.role ? { role: extras.role } : {}),
                terms: extras.terms,
                marketingOptIn: extras.marketingOptIn,
              }
            : {}),
        });
        completeRedirect(typeof data.next === 'string' ? data.next : null);
      } catch (error) {
        fail(error instanceof Error ? error.message : GENERIC_AUTH_MESSAGE, errorField(error) ?? 'code');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    googleButtons.forEach((button) => {
      button.addEventListener('click', async () => {
        clearFieldErrors();
        if (flow() === 'signup') {
          extras = collectExtras(challenge);
          if (termsInput && extras.terms.length === 0) {
            fail('Please read and accept the Site Terms and the Privacy Policy first.', 'terms');
            return;
          }
        }
        button.disabled = true;
        message('Opening Google…');
        try {
          const clerk = await loadClerk(clerkPublishableKey);
          const target = flow() === 'signup' ? clerk?.client.signUp : clerk?.client.signIn;
          if (!clerk || !target?.authenticateWithRedirect) throw new ApiError(GENERIC_AUTH_MESSAGE);
          try {
            window.sessionStorage.setItem(
              PENDING_SIGNUP_KEY,
              JSON.stringify({ intent: flow(), extras, next: nextParam ?? null }),
            );
          } catch {
            // Without sessionStorage the sign-up consent is asked again after the redirect.
          }
          await target.authenticateWithRedirect({
            strategy: 'oauth_google',
            redirectUrl: '/account/sso-callback',
            redirectUrlComplete: '/account/sso-callback?complete=1',
          });
        } catch (error) {
          button.disabled = false;
          fail(error instanceof Error ? error.message : GENERIC_AUTH_MESSAGE);
        }
      });
    });

    root.querySelector('[data-btn-reset]')?.addEventListener('click', () => {
      if (root.dataset.activeMode === 'verify' && initialMode !== 'verify') {
        verify.reset();
        clearFieldErrors();
        status.hidden = true;
        setView(initialMode);
        emailInput?.focus();
      } else {
        window.location.assign(`/account/signin${querySuffix}`);
      }
    });
  });
}

/**
 * `/account/sso-callback`: finishes Clerk's Google redirect for THIS product's Clerk app, then exchanges
 * the Clerk session for a Gamo session (`/api/auth/clerk-session`) exactly like the email-code flow.
 */
export function initSsoCallback(scope: ParentNode = document): void {
  const root = scope.querySelector<HTMLElement>('[data-sso-callback]');
  if (!root || root.dataset.bound === 'true') return;
  root.dataset.bound = 'true';
  const status = root.querySelector<HTMLElement>('[data-sso-status]');
  const help = root.querySelector<HTMLElement>('[data-sso-help]');
  const key = (root.dataset.clerkPublishableKey || '').trim();
  const say = (text: string, failed = false) => {
    if (status) status.textContent = text;
    if (failed && help) help.hidden = false;
  };
  void (async () => {
    try {
      const clerk = await loadClerk(key);
      if (!clerk) {
        say('Google sign-in is not available for this site. Use the emailed code instead.', true);
        return;
      }
      if (!clerk.session && clerk.handleRedirectCallback) {
        await clerk.handleRedirectCallback(
          {
            signInFallbackRedirectUrl: '/account/sso-callback?complete=1',
            signUpFallbackRedirectUrl: '/account/sso-callback?complete=1',
          },
          (to: string) => window.location.assign(to),
        );
      }
      if (!clerk.session) {
        say("We couldn't finish signing you in with Google. Please try again.", true);
        return;
      }
      let pending: { intent?: 'signin' | 'signup'; extras?: SignupExtras | null; next?: string | null } = {};
      try {
        pending = JSON.parse(window.sessionStorage.getItem(PENDING_SIGNUP_KEY) || '{}');
        window.sessionStorage.removeItem(PENDING_SIGNUP_KEY);
      } catch {
        pending = {};
      }
      const next = await exchangeClerkSession(clerk, {
        intent: pending.intent === 'signup' ? 'signup' : 'signin',
        extras: pending.extras ?? null,
      });
      if (next) window.location.assign(next);
      else window.location.assign(safeNextPath(pending.next ?? null, window.location.origin));
    } catch (error) {
      say(error instanceof Error && error.message ? error.message : GENERIC_AUTH_MESSAGE, true);
    }
  })();
}
