export type AuthScreenMode = 'signin' | 'signup' | 'verify' | 'recover';

export const PROGRAM_TO_PRODUCT_KEY: Record<string, string> = {
  'Gamo Studios': 'web',
  'Gamo Worship': 'worship',
  'Gamo Academy': 'academy',
  'Gamo Live': 'live',
  'Gamo Production': 'production',
};

const PROGRAM_SIGNUP_SUBTEXT: Record<string, string> = {
  'Gamo Live': 'Register for Gamo Live to manage Christian event submissions, artist profiles, and verified event passes.',
  'Gamo Academy': 'Register for Gamo Academy to explore music lessons and family enrollment.',
  'Gamo Worship': 'Register for Gamo Worship to connect with church worship coverage and musician onboarding.',
  'Gamo Production': 'Register for Gamo Production to request technical assessments, audio, livestream, and ministry training.',
  'Gamo Studios': 'Register for Gamo Studios to submit participation inquiries and connect with our mission team.',
};

export function getAuthScreenCopy(
  program: string = 'Gamo Studios'
): Record<AuthScreenMode, { heading: string; subtext: string }> {
  const cleanProgram = program.trim() || 'Gamo Studios';
  const signupSubtext =
    PROGRAM_SIGNUP_SUBTEXT[cleanProgram] ||
    `Register for ${cleanProgram} to access your ${cleanProgram} workspace.`;
  return {
    signin: {
      heading: 'Welcome back',
      subtext: `Sign in to your ${cleanProgram} account.`,
    },
    signup: {
      heading: `Create your ${cleanProgram} account`,
      subtext: signupSubtext,
    },
    verify: {
      heading: 'Check your email',
      subtext: "We've sent a 6-digit verification code to",
    },
    recover: {
      heading: 'Recover your account',
      subtext: `Enter your email and we'll send you a verification code to restore access to your ${cleanProgram} account.`,
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

    if (!challenge || !verify || !status || !headingEl || !subtextEl || !verifyEmailWrap || !verifyEmailLabel) {
      return;
    }

    const codeInput = verify.querySelector<HTMLInputElement>('input[name="code"]')!;
    const otpSlots = Array.from(verify.querySelectorAll<HTMLElement>('[data-otp-slot]'));
    const verifyBtn = verify.querySelector<HTMLButtonElement>('[data-btn-verify]')!;
    const resendBtn = verify.querySelector<HTMLButtonElement>('[data-btn-resend]');
    const firstNameInput = challenge.querySelector<HTMLInputElement>('input[name="firstName"]');
    const lastNameInput = challenge.querySelector<HTMLInputElement>('input[name="lastName"]');
    const hiddenDisplayNameInput = challenge.querySelector<HTMLInputElement>('input[name="displayName"]');

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
    let displayName = (params.get('displayName') || '').trim();

    const syncDisplayName = () => {
      if (!firstNameInput && !lastNameInput) return;
      const combined = [firstNameInput?.value.trim(), lastNameInput?.value.trim()]
        .filter(Boolean)
        .join(' ')
        .trim();
      if (hiddenDisplayNameInput && combined) {
        hiddenDisplayNameInput.value = combined;
      }
    };
    firstNameInput?.addEventListener('input', syncDisplayName);
    lastNameInput?.addEventListener('input', syncDisplayName);

    const syncOtpSlots = () => {
      const sanitized = codeInput.value.replace(/\D/g, '').slice(0, 6);
      if (codeInput.value !== sanitized) {
        codeInput.value = sanitized;
      }
      const focused = document.activeElement === codeInput;
      const activeIdx = Math.min(sanitized.length, 5);
      otpSlots.forEach((slot, idx) => {
        slot.textContent = sanitized[idx] || '';
        slot.dataset.active =
          focused && idx === activeIdx
            ? 'true'
            : !focused && idx === 0 && sanitized.length === 0
              ? 'true'
              : 'false';
      });
      if (verifyBtn) {
        verifyBtn.dataset.ready = sanitized.length === 6 ? 'true' : 'false';
      }
    };

    codeInput.addEventListener('input', syncOtpSlots);
    codeInput.addEventListener('focus', syncOtpSlots);
    codeInput.addEventListener('blur', syncOtpSlots);
    codeInput.addEventListener('paste', (e) => {
      const pasted = e.clipboardData?.getData('text') || '';
      const digits = pasted.replace(/\D/g, '').slice(0, 6);
      if (digits) {
        e.preventDefault();
        codeInput.value = digits;
        syncOtpSlots();
      }
    });

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
          verifyEmailLabel.textContent = 'you@example.com';
          verifyDirectEmailWrap?.classList.remove('hidden');
        }
      }
    };

    if (initialMode === 'verify') {
      setView('verify');
    }

    const message = (text: string) => {
      status.hidden = false;
      status.textContent = text;
    };

    const submitJson = async (form: HTMLFormElement, url: string, payload: Record<string, string>) => {
      const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      button.disabled = true;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.error?.message || 'Verification or authentication failed. Please try again.');
        }
        return body.data;
      } finally {
        button.disabled = false;
      }
    };

    challenge.addEventListener('submit', async (event) => {
      event.preventDefault();
      syncDisplayName();
      if (!challenge.reportValidity()) return;
      const fields = new FormData(challenge);
      email = String(fields.get('email') || '').trim();
      const firstName = String(fields.get('firstName') || '').trim();
      const lastName = String(fields.get('lastName') || '').trim();
      displayName =
        [firstName, lastName].filter(Boolean).join(' ').trim() ||
        String(fields.get('displayName') || '').trim();

      message('Requesting your code…');
      try {
        const data = await submitJson(challenge, '/api/auth/challenge', {
          email,
          intent: intentForRequest(),
          ...(productKey ? { product: productKey } : {}),
          ...(displayName ? { displayName } : {}),
        });
        setView('verify');
        message(
          data?.deliveryStatus === 'simulated'
            ? String(data.message || 'Local verification simulation. No email was sent.')
            : 'Your verification code has been sent. Check your email.'
        );
        codeInput.focus();
      } catch (error) {
        message(error instanceof Error ? error.message : 'Unable to request a code. Please try again.');
      }
    });

    resendBtn?.addEventListener('click', async () => {
      const targetEmail = email || verifyDirectEmailInput?.value.trim() || '';
      if (!targetEmail) {
        message('Enter your email address first to request a verification code.');
        verifyDirectEmailWrap?.classList.remove('hidden');
        verifyDirectEmailInput?.focus();
        return;
      }
      email = targetEmail;
      resendBtn.disabled = true;
      message('Sending a new verification code…');
      try {
        const res = await fetch('/api/auth/challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            intent: intentForRequest(),
            ...(productKey ? { product: productKey } : {}),
            ...(displayName ? { displayName } : {}),
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.error?.message || 'Unable to resend verification code.');
        }
        verifyEmailLabel.textContent = maskEmailAddress(email);
        message(
          body.data?.deliveryStatus === 'simulated'
            ? String(body.data.message || 'Local verification simulation. No email was sent.')
            : 'A new verification code has been sent. Check your email.'
        );
        codeInput.focus();
      } catch (error) {
        message(error instanceof Error ? error.message : 'Unable to resend code. Please try again.');
      } finally {
        resendBtn.disabled = false;
      }
    });

    verify.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!email && verifyDirectEmailInput?.value.trim()) {
        email = verifyDirectEmailInput.value.trim();
      }
      if (!email) {
        message('Enter your email address so we can verify your code.');
        verifyDirectEmailWrap?.classList.remove('hidden');
        verifyDirectEmailInput?.focus();
        return;
      }
      if (!verify.reportValidity()) return;
      message('Verifying your code…');
      try {
        await submitJson(verify, '/api/auth/verify', {
          email,
          code: String(new FormData(verify).get('code') || '').trim(),
          intent: intentForRequest(),
          ...(productKey ? { product: productKey } : {}),
          ...(displayName ? { displayName } : {}),
        });
        const searchParams = new URLSearchParams(window.location.search);
        const next = searchParams.get('next') || searchParams.get('returnTo');
        const target = next ? new URL(next, window.location.origin) : null;
        window.location.assign(
          target &&
            next?.startsWith('/') &&
            !next.startsWith('//') &&
            target.origin === window.location.origin &&
            !target.pathname.startsWith('/api/')
            ? target.pathname + target.search
            : '/account'
        );
      } catch (error) {
        message(error instanceof Error ? error.message : 'Unable to verify. Please try again.');
      }
    });

    root.querySelector('[data-btn-reset]')?.addEventListener('click', () => {
      if (root.dataset.activeMode === 'verify' && initialMode !== 'verify') {
        verify.reset();
        syncOtpSlots();
        status.hidden = true;
        setView(initialMode);
        challenge.querySelector<HTMLInputElement>('input[name="email"]')?.focus();
      } else {
        window.location.assign(`/account/signin${querySuffix}`);
      }
    });
  });
}
