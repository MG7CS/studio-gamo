/**
 * Account-entry screens (sign in, sign up, recovery, signed out, access denied, and onboarding).
 */
import type { FormFieldDef } from '@studio-gamo/ui/lib/dashboard';

export interface AuthScreen {
  id: string; title: string; heading: string; intro?: string; wide?: boolean;
  notice?: { tone: 'info' | 'warning' | 'success' | 'privacy'; body: string };
  fields?: FormFieldDef[]; submitLabel?: string; successText?: string; redirect?: string;
  actions?: { label: string; href: string }[];
  links?: { label: string; href: string }[];
}

export const authScreens = {
  signin: {
    id: 'signin', title: 'Sign in', heading: 'Sign in to Gamo Studios', wide: true,
    intro: 'Sign in to your Gamo Studios account to manage participation inquiries and partner workspaces.',
    links: [{ label: 'Need an account? Create your Gamo Studios account', href: '/account/signup' }, { label: 'Back to Gamo Studios home', href: '/' }],
  },
  signup: {
    id: 'signup', title: 'Create account', heading: 'Create your Gamo Studios account', wide: true,
    intro: 'Register for Gamo Studios to submit participation inquiries and connect with our mission team.',
    links: [{ label: 'Already have an account? Sign in', href: '/account/signin' }, { label: 'Explore ways to participate', href: '/get-involved' }],
  },
  recover: {
    id: 'recover', title: 'Recover account', heading: 'Account recovery',
    intro: 'Gamo Studios uses 6-digit verification codes — no password is required to sign in.',
    notice: { tone: 'info', body: 'Enter your email address on the Sign In page to receive a fresh verification code.' },
    actions: [{ label: 'Sign in with verification code', href: '/account/signin' }],
    links: [{ label: 'Create a new account', href: '/account/signup' }],
  },
  signedOut: {
    id: 'signed-out', title: 'Signed out', heading: 'You’re signed out',
    intro: 'Thanks for serving with Gamo Studios. You can close this tab or sign back in anytime.',
    notice: { tone: 'success', body: 'Your active account session has been signed out on this browser.' },
    actions: [{ label: 'Sign in again', href: '/account/signin' }, { label: 'Create an account', href: '/account/signup' }, { label: 'Back to home', href: '/' }],
  },
  denied: {
    id: 'access-denied', title: 'Access denied', heading: 'You don’t have access to this page', wide: true,
    intro: 'Your account is signed in, but your active role doesn’t include permission for this area.',
    notice: { tone: 'privacy', body: 'Every program workspace checks your role and organization on the server before performing protected actions. A musician cannot open church finances; a church admin only manages their own church; staff tools require approved staff roles.' },
    actions: [{ label: 'Choose another workspace', href: '/account' }, { label: 'Explore programs', href: '/get-involved' }],
    links: [{ label: 'Contact the Gamo team', href: '/contact' }],
  },
} satisfies Record<string, AuthScreen>;

