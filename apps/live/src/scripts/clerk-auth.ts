/**
 * Sign-in and sign-up with an emailed 6-digit code through Clerk, in Gamo's own screen.
 * 1. Load clerk-js. 2. Email step. 3. Code step. 4. Send the Clerk session token to /account/session, which
 * verifies it on the server and starts the Gamo Live organizer session. Every message is plain text.
 */
import { clerkErrorCode, loadClerk, type ClerkInstance } from './clerk-client';

const root = document.querySelector<HTMLElement>('[data-clerk-auth]');
if (root) void run(root);

async function run(el: HTMLElement) {
  const mode = el.dataset.mode === 'signup' ? 'signup' : 'signin';
  const next = el.dataset.next || '/organizer';
  const emailForm = el.querySelector<HTMLFormElement>('#email-form')!;
  const codeForm = el.querySelector<HTMLFormElement>('#code-form')!;
  const status = el.querySelector<HTMLElement>('#auth-status')!;
  const emailInput = el.querySelector<HTMLInputElement>('#email')!;
  const nameInput = el.querySelector<HTMLInputElement>('#name');
  const codeInput = el.querySelector<HTMLInputElement>('#code')!;
  const sentTo = el.querySelector<HTMLElement>('#sent-to');
  const buttons = el.querySelectorAll<HTMLButtonElement>('button[type="submit"]');

  const say = (text: string, tone: 'info' | 'error' = 'info') => {
    status.textContent = text;
    status.hidden = text === '';
    status.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  };
  const busy = (on: boolean) => buttons.forEach((b) => (b.disabled = on));
  const fail = (error: unknown) => {
    const code = clerkErrorCode(error);
    if (code === 'form_identifier_not_found')
      return say('We could not find an account for that email. Create an account first.', 'error');
    if (code === 'form_identifier_exists')
      return say('That email already has an account. Sign in instead.', 'error');
    if (code === 'form_code_incorrect')
      return say('That code is not right. Check the email and try again.', 'error');
    if (code === 'verification_expired' || code === 'verification_failed')
      return say('That code expired. Go back and ask for a new one.', 'error');
    if (code === 'too_many_requests')
      return say('Too many tries. Please wait a moment and try again.', 'error');
    return say("We couldn't complete that step. Please try again.", 'error');
  };

  let clerk: ClerkInstance;
  try {
    clerk = await loadClerk(el.dataset.frontendApi!, el.dataset.publishableKey!);
  } catch {
    say('Sign-in is temporarily unavailable. Please try again later.', 'error');
    busy(true);
    return;
  }

  async function exchange() {
    const token = await clerk.session?.getToken();
    if (!token) return say("We couldn't complete that step. Please try again.", 'error');
    const response = await fetch('/account/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ token, next }),
    });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; next?: string };
    if (response.ok && body.ok) return window.location.assign(body.next || next);
    say(
      response.status === 503
        ? 'Sign-in is temporarily unavailable. Please try again later.'
        : 'We could not verify your sign-in. Please try again.',
      'error',
    );
  }

  // Someone already signed in at Clerk (an earlier visit) only needs the Gamo session.
  if (clerk.session) {
    say('Signing you in…');
    busy(true);
    try {
      return await exchange();
    } catch {
      busy(false);
      say('');
    }
  }

  emailForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    if (!email) return say('Enter your email address.', 'error');
    say('');
    busy(true);
    try {
      if (mode === 'signin') {
        const attempt = await clerk.client!.signIn.create({ identifier: email });
        const factor = attempt.supportedFirstFactors?.find((f) => f.strategy === 'email_code');
        if (!factor?.emailAddressId) return say('This account cannot sign in with an emailed code.', 'error');
        await attempt.prepareFirstFactor({ strategy: 'email_code', emailAddressId: factor.emailAddressId });
      } else {
        const fullName = (nameInput?.value ?? '').trim();
        const [firstName, ...rest] = fullName.split(/\s+/);
        await clerk.client!.signUp.create({
          emailAddress: email,
          ...(firstName ? { firstName } : {}),
          ...(rest.length ? { lastName: rest.join(' ') } : {}),
        });
        await clerk.client!.signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      }
      if (sentTo) sentTo.textContent = email;
      emailForm.hidden = true;
      codeForm.hidden = false;
      codeInput.focus();
      say(`We sent a 6-digit code to ${email}.`);
    } catch (error) {
      fail(error);
    } finally {
      busy(false);
    }
  });

  codeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = codeInput.value.trim();
    if (!/^\d{6}$/.test(code)) return say('Enter the 6-digit code from the email.', 'error');
    say('');
    busy(true);
    try {
      const result =
        mode === 'signin'
          ? await clerk.client!.signIn.attemptFirstFactor({ strategy: 'email_code', code })
          : await clerk.client!.signUp.attemptEmailAddressVerification({ code });
      if (result.status !== 'complete' || !result.createdSessionId)
        return say("We couldn't finish signing you in. Please start again.", 'error');
      await clerk.setActive({ session: result.createdSessionId });
      await exchange();
    } catch (error) {
      fail(error);
    } finally {
      busy(false);
    }
  });

  el.querySelector<HTMLButtonElement>('#back')?.addEventListener('click', () => {
    codeForm.hidden = true;
    emailForm.hidden = false;
    codeInput.value = '';
    say('');
    emailInput.focus();
  });
}
