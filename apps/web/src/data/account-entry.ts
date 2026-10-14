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
    intro: 'One personal account for Gamo Worship, Gamo Academy, Gamo Live and Gamo Production.',
    links: [{ label: 'Need an account? Create your Gamo account', href: '/account/signup' }, { label: 'Back to Gamo Studios home', href: '/' }],
  },
  signup: {
    id: 'signup', title: 'Create account', heading: 'Create your Gamo account', wide: true,
    intro: 'Musicians, families, instructors, event organizers and churches all start with one personal account.',
    links: [{ label: 'Already have an account? Sign in', href: '/account/signin' }, { label: 'Set up your profile & preferences', href: '/account/onboarding' }],
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
    actions: [{ label: 'Choose another workspace', href: '/account' }, { label: 'Manage roles', href: '/account/roles' }],
    links: [{ label: 'Contact the Gamo team', href: '/contact' }],
  },
} satisfies Record<string, AuthScreen>;

export const onboardingSteps = [
  { id: 'about', label: 'About you', fields: [
    { name: 'name', label: 'Preferred name', required: true, value: 'Jordan' },
    { name: 'city', label: 'City / region', half: true, placeholder: 'e.g. Columbus, OH' },
    { name: 'phone', label: 'Phone (optional)', half: true, placeholder: '(555) 234-5678', hint: 'Used for account verification and scheduling alerts.' },
  ] },
  { id: 'programs', label: 'Programs of interest', fields: [
    { name: 'worship', label: 'Gamo Worship — serve as a musician or request musicians', type: 'checkbox', value: 'on' },
    { name: 'academy', label: 'Gamo Academy — lessons for a student, or teach', type: 'checkbox' },
    { name: 'live', label: 'Gamo Live — promote or attend Christian events', type: 'checkbox' },
    { name: 'production', label: 'Gamo Production — sound, video and media help', type: 'checkbox' },
  ] },
  { id: 'org', label: 'Organization', fields: [
    { name: 'affiliation', label: 'Are you connected to a church or ministry?', type: 'select', options: ['Yes — I serve at a church', 'Yes — I help lead a church or ministry', 'Not right now'] },
    { name: 'church', label: 'Church or ministry name', placeholder: 'e.g. Grace Fellowship', hint: 'Affiliations are reviewed by the organization before they appear.' },
  ] },
] satisfies { id: string; label: string; fields: FormFieldDef[] }[];
