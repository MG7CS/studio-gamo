/**
 * View models for the shared account pages (`/account`, `/account/onboarding`, `/account/profile`) of
 * every public product. Pages stay thin: they call one loader with `Astro.locals` and `Astro.url` and pass
 * the plain data to the shared components in `@studio-gamo/ui/components/{account,onboarding}`.
 */
import type { SessionData } from '@gamo/auth';
import { asSqlDatabase, isSqlDatabase } from '../security/sql-database.ts';
import type { Product, ProviderRole } from '../types/enums.ts';
import { getTermsDocument } from '../terms/registry.ts';
import { missingTermsAcceptances } from '../terms/acceptance.ts';
import {
  listCustomerRecordsForPerson,
  listPersonProducts,
  type CustomerRecord,
} from '../services/persons.ts';
import {
  evaluatePublishGates,
  findProviderProfile,
  isSignupRole,
  listProviderProfilesForPerson,
  ONBOARDING_STEPS,
  profileCompleteness,
  providerTermsFor,
  requiresStaffReview,
  roleLabel,
  SIGNUP_ROLES,
  stepCompletion,
  type OnboardingField,
  type ProfileValue,
  type ProviderProfile,
  type PublishGate,
} from '../services/providers.ts';
import { ACCOUNT_OUTCOME_MESSAGES } from './account.ts';

interface PageLocals {
  auth?: SessionData | null;
  product?: string;
  runtimeEnv?: { DB?: unknown };
}

export interface PageNotice {
  tone: 'success' | 'error' | 'info';
  text: string;
}

function noticeFrom(url: URL): PageNotice | null {
  const error = url.searchParams.get('error');
  if (error)
    return { tone: 'error', text: ACCOUNT_OUTCOME_MESSAGES[error] ?? ACCOUNT_OUTCOME_MESSAGES.UNAVAILABLE };
  for (const key of ['person', 'submitted', 'published', 'unpublished', 'saved']) {
    const value = url.searchParams.get(key);
    if (!value) continue;
    const text = ACCOUNT_OUTCOME_MESSAGES[key === 'person' ? value : key];
    if (text) return { tone: 'success', text };
  }
  return null;
}

function productOf(locals: PageLocals): Product {
  const p = locals.product;
  return p === 'worship' || p === 'academy' || p === 'live' || p === 'production' ? p : 'web';
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted for review',
  meeting_scheduled: 'Verification meeting scheduled',
  in_review: 'In review',
  changes_requested: 'Changes requested',
  verified: 'Verified',
  rejected: 'Not approved',
  suspended: 'Suspended',
};

export function providerStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

// --- /account ----------------------------------------------------------------------------------

export interface AccountExtrasView {
  notice: PageNotice | null;
  person: {
    linked: boolean;
    optedOut: boolean;
    /** Other products that know this person (names only). */
    otherProducts: { name: string; sharesSignInRecord: boolean }[];
  };
  customerRecords: (CustomerRecord & { manageHref: string })[];
  providerProfiles: { role: string; label: string; status: string; statusLabel: string; href: string }[];
  signupRoles: { value: string; label: string }[];
}

export async function loadAccountExtras(
  locals: PageLocals,
  url: URL,
  siteUrlFor: (product: 'live' | 'academy', path: string) => string,
): Promise<AccountExtrasView | null> {
  const auth = locals.auth;
  if (!auth || !isSqlDatabase(locals.runtimeEnv?.DB)) return null;
  const db = asSqlDatabase(locals.runtimeEnv?.DB);
  const product = productOf(locals);
  const links = await listPersonProducts(db, { userId: auth.user.id, product });
  const personId = links.personId;
  const records = personId ? await listCustomerRecordsForPerson(db, personId, { limit: 20 }) : [];
  const profiles = personId ? await listProviderProfilesForPerson(db, personId) : [];
  return {
    notice: noticeFrom(url),
    person: {
      linked: Boolean(personId),
      optedOut: links.optedOut,
      otherProducts: links.products
        .filter((p) => !p.current)
        .map((p) => ({ name: p.name, sharesSignInRecord: p.sharesSignInRecord })),
    },
    customerRecords: records.map((r) => ({ ...r, manageHref: siteUrlFor(r.product, r.managePath) })),
    providerProfiles: profiles.map((p) => ({
      role: p.role,
      label: roleLabel(p.role, product),
      status: p.status,
      statusLabel: providerStatusLabel(p.status),
      href: isSignupRole(product, p.role) ? `/account/profile?role=${p.role}` : '',
    })),
    signupRoles: SIGNUP_ROLES[product].map((r) => ({ value: r, label: roleLabel(r, product) })),
  };
}

// --- /account/onboarding -------------------------------------------------------------------------

export interface OnboardingFieldView extends OnboardingField {
  id: string;
  value: string;
  checked: boolean;
  error?: string;
}

export interface OnboardingStepView {
  id: string;
  label: string;
  description: string;
  state: 'complete' | 'current' | 'upcoming' | 'locked';
  href?: string;
  stateDescription?: string;
}

export interface OnboardingView {
  product: Product;
  notice: PageNotice | null;
  roles: { value: string; label: string; started: boolean; href: string }[];
  role: ProviderRole | null;
  roleLabel: string;
  profile: {
    id: string;
    status: string;
    statusLabel: string;
    completeness: number;
    editable: boolean;
  } | null;
  steps: OnboardingStepView[];
  current:
    | { kind: 'fields'; id: string; label: string; description: string; fields: OnboardingFieldView[] }
    | { kind: 'terms'; slug: string; title: string; version: string; path: string; accepted: boolean }
    | { kind: 'review'; gates: PublishGate[]; canSubmit: boolean; requiresReview: boolean; status: string }
    | null;
  /** True when the person record is unlinked (provider profiles need it). */
  personMissing: boolean;
}

function fieldValue(value: ProfileValue | undefined, kind: OnboardingField['kind']): string {
  if (Array.isArray(value)) return kind === 'urls' ? value.join('\n') : value.join(', ');
  if (typeof value === 'boolean') return value ? 'on' : '';
  return value ?? '';
}

function invalidMessage(field: OnboardingField): string {
  switch (field.kind) {
    case 'email':
      return 'Enter an email address like name@example.org.';
    case 'url':
      return 'Enter a web address starting with https://.';
    case 'urls':
      return 'Each link must start with https:// — check the links and try again.';
    case 'tel':
      return 'Enter a phone number using digits, spaces, + or -.';
    case 'checkbox':
      return 'Tick this box to continue.';
    case 'select':
      return 'Choose one of the options.';
    default:
      return `Enter ${field.label.replace(/ \(optional\)$/, '').toLowerCase()} to continue.`;
  }
}

const EDITABLE = ['draft', 'changes_requested', 'verified', 'rejected'];

export async function loadOnboardingView(locals: PageLocals, url: URL): Promise<OnboardingView | null> {
  const auth = locals.auth;
  if (!auth || !isSqlDatabase(locals.runtimeEnv?.DB)) return null;
  const db = asSqlDatabase(locals.runtimeEnv?.DB);
  const product = productOf(locals);
  const personId = auth.personId ?? null;
  const all = personId ? await listProviderProfilesForPerson(db, personId) : [];
  const roles = SIGNUP_ROLES[product].map((r) => ({
    value: r,
    label: roleLabel(r, product),
    started: all.some((p) => p.role === r),
    href: `/account/onboarding?role=${r}`,
  }));
  const requested = url.searchParams.get('role');
  const role = isSignupRole(product, requested) ? requested : null;
  const base: OnboardingView = {
    product,
    notice: noticeFrom(url),
    roles,
    role,
    roleLabel: role ? roleLabel(role, product) : '',
    profile: null,
    steps: [],
    current: null,
    personMissing: !personId,
  };
  if (!role || !personId) return base;
  const profile = await findProviderProfile(db, personId, role);
  if (!profile) return base;

  const done = stepCompletion(role, profile.fields);
  const termsSlug = providerTermsFor(role);
  const termsDoc = getTermsDocument(termsSlug)!;
  const termsAccepted =
    (await missingTermsAcceptances(db, { personId, userId: auth.user.id }, [termsSlug])).length === 0;
  const fieldSteps = ONBOARDING_STEPS[role];
  const requestedStep = url.searchParams.get('step');
  const firstOpen = fieldSteps.find((s) => !done[s.id])?.id ?? (termsAccepted ? 'review' : 'terms');
  const stepIds = [...fieldSteps.map((s) => s.id), 'terms', 'review'];
  const currentId = requestedStep && stepIds.includes(requestedStep) ? requestedStep : firstOpen;
  const editable = EDITABLE.includes(profile.status);
  const allFieldsDone = fieldSteps.every((s) => done[s.id]);

  const steps: OnboardingStepView[] = [
    ...fieldSteps.map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description,
      state: (s.id === currentId
        ? 'current'
        : done[s.id]
          ? 'complete'
          : 'upcoming') as OnboardingStepView['state'],
      href: `/account/onboarding?role=${role}&step=${s.id}`,
      stateDescription: done[s.id] ? 'Saved' : 'To do',
    })),
    {
      id: 'terms',
      label: termsDoc.title,
      description: 'Read and accept the current version.',
      state: currentId === 'terms' ? 'current' : termsAccepted ? 'complete' : 'upcoming',
      href: `/account/onboarding?role=${role}&step=terms`,
      stateDescription: termsAccepted ? 'Accepted' : 'To do',
    },
    {
      id: 'review',
      label: requiresStaffReview(role) ? 'Submit for review' : 'Publish',
      description: 'Check the publish gates.',
      state: currentId === 'review' ? 'current' : allFieldsDone && termsAccepted ? 'upcoming' : 'locked',
      href: `/account/onboarding?role=${role}&step=review`,
      stateDescription: allFieldsDone && termsAccepted ? 'Ready' : 'Unlocks when the steps above are done',
    },
  ];

  const view: OnboardingView = {
    ...base,
    profile: {
      id: profile.id,
      status: profile.status,
      statusLabel: providerStatusLabel(profile.status),
      completeness: profileCompleteness(role, profile.fields),
      editable,
    },
    steps,
  };

  if (currentId === 'terms') {
    view.current = {
      kind: 'terms',
      slug: termsSlug,
      title: termsDoc.title,
      version: termsDoc.version,
      path: termsDoc.path,
      accepted: termsAccepted,
    };
  } else if (currentId === 'review') {
    const gates = await evaluatePublishGates(db, profile, {
      emailVerified: Boolean(auth.user.verifiedEmailAt),
      personId,
      userId: auth.user.id,
    });
    view.current = {
      kind: 'review',
      gates,
      canSubmit: gates.filter((g) => ['email', 'profile', 'terms'].includes(g.id)).every((g) => g.met),
      requiresReview: profile.requiresStaffReview,
      status: profile.status,
    };
  } else {
    const step = fieldSteps.find((s) => s.id === currentId)!;
    const invalid = new Set((url.searchParams.get('invalid') ?? '').split(',').filter(Boolean));
    view.current = {
      kind: 'fields',
      id: step.id,
      label: step.label,
      description: step.description,
      fields: step.fields.map((f) => ({
        ...f,
        id: `field-${f.name}`,
        value: fieldValue(profile.fields[f.name], f.kind),
        checked: profile.fields[f.name] === true,
        error: invalid.has(f.name) ? invalidMessage(f) : undefined,
      })),
    };
  }
  return view;
}

// --- /account/profile ----------------------------------------------------------------------------

export interface ProfileOverviewView {
  notice: PageNotice | null;
  personMissing: boolean;
  profiles: {
    role: string;
    label: string;
    displayName: string;
    status: string;
    statusLabel: string;
    completeness: number;
    published: boolean;
    gates: PublishGate[];
    canPublish: boolean;
    canSubmit: boolean;
    onboardingHref: string;
    selected: boolean;
  }[];
  startRoles: { value: string; label: string }[];
}

export async function loadProfileOverview(locals: PageLocals, url: URL): Promise<ProfileOverviewView | null> {
  const auth = locals.auth;
  if (!auth || !isSqlDatabase(locals.runtimeEnv?.DB)) return null;
  const db = asSqlDatabase(locals.runtimeEnv?.DB);
  const product = productOf(locals);
  const personId = auth.personId ?? null;
  const all: ProviderProfile[] = personId ? await listProviderProfilesForPerson(db, personId) : [];
  const offered = all.filter((p) => isSignupRole(product, p.role));
  const selectedRole = url.searchParams.get('role');
  const profiles = [];
  for (const p of offered) {
    const gates = await evaluatePublishGates(db, p, {
      emailVerified: Boolean(auth.user.verifiedEmailAt),
      personId: personId!,
      userId: auth.user.id,
    });
    const blockingMet = gates.every((g) => g.met || !g.blocking);
    profiles.push({
      role: p.role,
      label: roleLabel(p.role, product),
      displayName: p.displayName,
      status: p.status,
      statusLabel: providerStatusLabel(p.status),
      completeness: profileCompleteness(p.role, p.fields),
      published: p.publishedAt !== null,
      gates,
      canPublish: blockingMet && p.publishedAt === null,
      canSubmit:
        p.requiresStaffReview &&
        ['draft', 'changes_requested', 'rejected'].includes(p.status) &&
        gates.filter((g) => ['email', 'profile', 'terms'].includes(g.id)).every((g) => g.met),
      onboardingHref: `/account/onboarding?role=${p.role}`,
      selected: selectedRole === p.role,
    });
  }
  return {
    notice: noticeFrom(url),
    personMissing: !personId,
    profiles,
    startRoles: SIGNUP_ROLES[product]
      .filter((r) => !offered.some((p) => p.role === r))
      .map((r) => ({ value: r, label: roleLabel(r, product) })),
  };
}
