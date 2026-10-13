/**
 * Account-entry screens (design-first demo). No authentication exists: fields are validated
 * locally and never sent; no email is delivered; no password is stored.
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
    id: 'signin', title: 'Sign in', heading: 'Sign in to Gamo Studios',
    intro: 'One account for every Gamo program you take part in.',
    notice: { tone: 'warning', body: 'Sign-in is not available yet. This form is a preview — what you type is never sent. “Continue to demo” opens the fictional demo account.' },
    fields: [
      { name: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@example.org' },
      { name: 'password', label: 'Password', type: 'password', required: true, hint: 'Never sent or stored in this preview.' },
    ],
    submitLabel: 'Continue to demo', redirect: '/account/roles', successText: 'Opening the demo account…',
    links: [{ label: 'Create an account', href: '/account/signup' }, { label: 'Forgot password?', href: '/account/recover' }],
  },
  signup: {
    id: 'signup', title: 'Create account', heading: 'Create your Gamo account',
    intro: 'Musicians, families, instructors, organizers and churches all start with one personal account.',
    notice: { tone: 'warning', body: 'Account creation is not available yet. Nothing is created, sent or stored.' },
    fields: [
      { name: 'first', label: 'First name', required: true, half: true },
      { name: 'last', label: 'Last name', required: true, half: true },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'password', label: 'Choose a password', type: 'password', required: true, hint: 'Preview only — never sent or stored.' },
      { name: 'terms', label: 'I understand this is a design preview and no account will be created.', type: 'checkbox', required: true },
    ],
    submitLabel: 'Continue to onboarding (demo)', redirect: '/account/onboarding',
    links: [{ label: 'Already have an account? Sign in', href: '/account/signin' }],
  },
  recover: {
    id: 'recover', title: 'Recover account', heading: 'Reset your password',
    intro: 'Enter the email on your account and we’ll send reset instructions.',
    notice: { tone: 'info', body: 'Recovery is simulated. No email will be sent.' },
    fields: [{ name: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@example.org' }],
    submitLabel: 'Send reset link (demo)',
    successText: 'Check your email — if an account existed, reset instructions would arrive shortly. (Simulated: no email was sent.)',
    links: [{ label: 'Back to sign in', href: '/account/signin' }],
  },
  signedOut: {
    id: 'signed-out', title: 'Signed out', heading: 'You’re signed out',
    intro: 'Thanks for serving with Gamo Studios. You can close this tab or sign back in.',
    notice: { tone: 'success', body: 'Demo session ended. No real session existed, so nothing was cleared on a server.' },
    actions: [{ label: 'Sign in again', href: '/account/signin' }, { label: 'Back to home', href: '/' }],
  },
  denied: {
    id: 'access-denied', title: 'Access denied', heading: 'You don’t have access to this page', wide: true,
    intro: 'Your account is signed in, but your active role doesn’t include permission for this area.',
    notice: { tone: 'privacy', body: 'In the future, every program workspace will check your role and organization on the server before showing anything. A musician cannot open church finances; a church admin only sees their own church; staff tools require approved staff roles. This preview does not enforce permissions.' },
    actions: [{ label: 'Choose another workspace', href: '/account' }, { label: 'Request a role', href: '/account/roles' }],
    links: [{ label: 'Contact the Gamo team', href: '/contact' }],
  },
} satisfies Record<string, AuthScreen>;

export const onboardingSteps = [
  { id: 'about', label: 'About you', fields: [
    { name: 'name', label: 'Preferred name', required: true, value: 'Jordan' },
    { name: 'city', label: 'City / region', half: true, placeholder: 'e.g. Columbus, OH' },
    { name: 'phone', label: 'Phone (optional)', half: true, hint: 'Not collected in this preview.' },
  ] },
  { id: 'programs', label: 'Programs of interest', fields: [
    { name: 'worship', label: 'Gamo Worship — serve as a musician or request musicians', type: 'checkbox', value: 'on' },
    { name: 'academy', label: 'Gamo Academy — lessons for a student, or teach', type: 'checkbox' },
    { name: 'live', label: 'Gamo Live — promote or attend Christian events', type: 'checkbox' },
    { name: 'production', label: 'Gamo Production — sound, video and media help', type: 'checkbox' },
  ] },
  { id: 'org', label: 'Organization', fields: [
    { name: 'affiliation', label: 'Are you connected to a church or ministry?', type: 'select', options: ['Yes — I serve at a church', 'Yes — I help lead a church or ministry', 'Not right now'] },
    { name: 'church', label: 'Church or ministry name', placeholder: 'e.g. Grace Fellowship (sample)', hint: 'Affiliations are reviewed by the organization before they appear.' },
  ] },
] satisfies { id: string; label: string; fields: FormFieldDef[] }[];
