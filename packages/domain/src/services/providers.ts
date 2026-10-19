/**
 * Provider profiles and onboarding (design §4.3): musicians, technicians, churches, agents, organizers,
 * teachers and artists. One `provider_profiles` row per person + role + organization, shared across
 * products through the person record (§4.6). Everything saves as a draft; a profile goes public only
 * when every publish gate holds:
 *
 *   1. verified email (the product verified it; the person exists only from a verified email),
 *   2. the role's onboarding steps are complete,
 *   3. the current Provider Terms (or Organizer Terms for organizers) are accepted,
 *   4. staff review where required — `STAFF_REVIEW_REQUIRED_ROLES` (church, musician, technician) and,
 *      for child safety, teachers (D-104); churches are verified after an in-person meeting,
 *   5. payout setup for paid events — Stripe Connect is not built, so this gate always reads
 *      "not available yet" and paid events stay closed (it does not block a profile).
 *
 * The `provider_publish_gate_*` triggers refuse `published_at` on a review-required profile that is not
 * `verified`, so a bug here cannot publish an unreviewed church. Staff decisions live in
 * `services/provider-review.ts`. All times are epoch seconds.
 */
import { newPrefixedId } from '../security/ids.ts';
import { allRows, runBatch, type SqlDatabase } from '../security/sql-database.ts';
import {
  PROVIDER_ROLES,
  STAFF_REVIEW_REQUIRED_ROLES,
  type Product,
  type ProviderRole,
  type ProviderStatus,
  type TermsSlug,
} from '../types/enums.ts';
import { missingTermsAcceptances } from '../terms/acceptance.ts';
import { getTermsDocument } from '../terms/registry.ts';

// --- Roles per product ----------------------------------------------------------------------

/** Role chips on each product's sign-up screen (design §4.3). Web (the hub) has none. */
export const SIGNUP_ROLES: Readonly<Record<Product, readonly ProviderRole[]>> = {
  web: [],
  worship: ['musician', 'technician', 'church'],
  live: ['organizer', 'artist', 'agent', 'church'],
  academy: ['teacher', 'church'],
  production: ['technician'],
};

export const ROLE_LABELS: Readonly<Record<ProviderRole, string>> = {
  musician: 'Musician',
  technician: 'Technician',
  church: 'Church',
  agent: 'Agent',
  organizer: 'Event organizer',
  teacher: 'Teacher',
  artist: 'Artist',
};

/** Product-specific label where the same role reads differently (Academy's church is a lesson host). */
export function roleLabel(role: ProviderRole, product?: Product): string {
  if (role === 'church' && product === 'academy') return 'Church host';
  return ROLE_LABELS[role];
}

export function isProviderRole(value: unknown): value is ProviderRole {
  return typeof value === 'string' && (PROVIDER_ROLES as readonly string[]).includes(value);
}

/** True when `role` is one of the sign-up roles of `product`. */
export function isSignupRole(product: Product, role: unknown): role is ProviderRole {
  return isProviderRole(role) && SIGNUP_ROLES[product].includes(role);
}

/** Roles whose profile can be published only after staff verify it (D-104 adds teachers). */
export function requiresStaffReview(role: ProviderRole): boolean {
  return (STAFF_REVIEW_REQUIRED_ROLES as readonly string[]).includes(role) || role === 'teacher';
}

/** Churches are verified only after an in-person meeting (owner decision 4). */
export function requiresMeeting(role: ProviderRole): boolean {
  return role === 'church';
}

/** The terms a provider of this role accepts before submitting or publishing. */
export function providerTermsFor(role: ProviderRole): TermsSlug {
  return role === 'organizer' ? 'organizer-terms' : 'provider-terms';
}

// --- Step schemas ---------------------------------------------------------------------------

export type FieldKind =
  'text' | 'textarea' | 'list' | 'urls' | 'email' | 'tel' | 'url' | 'select' | 'checkbox';

export interface OnboardingField {
  name: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  hint?: string;
  maxLength?: number;
  /** For `select`. */
  options?: readonly { value: string; label: string }[];
  /** For `list` / `urls`: most items kept. */
  maxItems?: number;
  autocomplete?: string;
}

export interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  fields: readonly OnboardingField[];
}

const text = (
  name: string,
  label: string,
  required = true,
  extra: Partial<OnboardingField> = {},
): OnboardingField => ({
  name,
  label,
  kind: 'text',
  required,
  maxLength: 160,
  ...extra,
});
const area = (
  name: string,
  label: string,
  required = true,
  extra: Partial<OnboardingField> = {},
): OnboardingField => ({
  name,
  label,
  kind: 'textarea',
  required,
  maxLength: 2000,
  ...extra,
});
const list = (name: string, label: string, hint: string, required = true): OnboardingField => ({
  name,
  label,
  kind: 'list',
  required,
  hint,
  maxItems: 20,
  maxLength: 400,
});
const urls = (name: string, label: string, required = false): OnboardingField => ({
  name,
  label,
  kind: 'urls',
  required,
  hint: 'One link per line (https://…), up to 5. Recordings, a video or a website.',
  maxItems: 5,
  maxLength: 1200,
});

const EXPERIENCE_OPTIONS = [
  { value: 'starting', label: 'Getting started (under 2 years)' },
  { value: 'developing', label: 'Developing (2–5 years)' },
  { value: 'experienced', label: 'Experienced (5–10 years)' },
  { value: 'seasoned', label: 'Seasoned (10+ years)' },
] as const;

const REGION = text('region', 'Region you serve', true, {
  hint: 'City and state, or the area you can travel to.',
  autocomplete: 'address-level2',
});

export const ONBOARDING_STEPS: Readonly<Record<ProviderRole, readonly OnboardingStep[]>> = {
  musician: [
    {
      id: 'about',
      label: 'About you',
      description: 'How churches will see you once your profile is verified.',
      fields: [text('displayName', 'Name shown on your profile', true, { autocomplete: 'name' }), REGION],
    },
    {
      id: 'music',
      label: 'Your music',
      description: 'What you play and how long you have served.',
      fields: [
        list('instruments', 'Instruments and voice parts', 'Separate with commas, e.g. Piano, Bass, Tenor.'),
        {
          name: 'experience',
          label: 'Experience',
          kind: 'select',
          required: true,
          options: EXPERIENCE_OPTIONS,
        },
        area('experienceNotes', 'Where you have served (optional)', false),
        urls('sampleLinks', 'Sample recordings (optional)'),
      ],
    },
    {
      id: 'availability',
      label: 'Availability',
      description: 'When you can usually serve. You can change this later.',
      fields: [
        area('availability', 'Usual availability', true, { hint: 'e.g. Sunday mornings, some weeknights.' }),
      ],
    },
  ],
  technician: [
    {
      id: 'about',
      label: 'About you',
      description: 'How churches and event teams will see you.',
      fields: [text('displayName', 'Name shown on your profile', true, { autocomplete: 'name' }), REGION],
    },
    {
      id: 'skills',
      label: 'Skills and equipment',
      description: 'What you can run and what you can bring.',
      fields: [
        list('skills', 'Skills', 'Separate with commas, e.g. Live sound, Livestream, Lighting.'),
        area('equipment', 'Equipment you can bring (optional)', false),
      ],
    },
  ],
  church: [
    {
      id: 'church',
      label: 'Your church',
      description: 'The church as it is legally registered. Staff confirm it in person before it is listed.',
      fields: [
        text('legalName', 'Legal name of the church', true, { autocomplete: 'organization' }),
        text('denomination', 'Denomination or network (optional)', false),
        { name: 'website', label: 'Website (optional)', kind: 'url', required: false, maxLength: 300 },
      ],
    },
    {
      id: 'location',
      label: 'Location and services',
      description: 'Where and when the church meets.',
      fields: [
        area('address', 'Street address', true, { maxLength: 400, autocomplete: 'street-address' }),
        area('serviceTimes', 'Service times', true, { maxLength: 600, hint: 'e.g. Sundays 9:00 and 11:00.' }),
      ],
    },
    {
      id: 'contact',
      label: 'Contact person',
      description: 'Who Gamo staff should contact to arrange the verification meeting.',
      fields: [
        text('contactName', 'Contact name', true, { autocomplete: 'name' }),
        {
          name: 'contactEmail',
          label: 'Contact email',
          kind: 'email',
          required: true,
          maxLength: 254,
          autocomplete: 'email',
        },
        {
          name: 'contactPhone',
          label: 'Contact phone',
          kind: 'tel',
          required: true,
          maxLength: 40,
          autocomplete: 'tel',
        },
      ],
    },
  ],
  agent: [
    {
      id: 'agency',
      label: 'Your agency',
      description: 'Who you represent.',
      fields: [
        text('agencyName', 'Agency or management name', true, { autocomplete: 'organization' }),
        list('artistsRepresented', 'Artists you represent', 'Separate with commas.'),
      ],
    },
  ],
  organizer: [
    {
      id: 'organization',
      label: 'Your organization',
      description: 'The church or ministry that runs your events.',
      fields: [
        text('organizationName', 'Organization name', true, { autocomplete: 'organization' }),
        text('contactName', 'Contact name', true, { autocomplete: 'name' }),
        {
          name: 'contactPhone',
          label: 'Contact phone',
          kind: 'tel',
          required: true,
          maxLength: 40,
          autocomplete: 'tel',
        },
        area('pastEvents', 'Events you have run before (optional)', false),
      ],
    },
  ],
  teacher: [
    {
      id: 'teaching',
      label: 'What you teach',
      description: 'Instruments, levels and where you can teach.',
      fields: [
        list('instruments', 'Instruments', 'Separate with commas, e.g. Piano, Guitar.'),
        list('levels', 'Levels', 'e.g. Beginner, Intermediate, Advanced.'),
        list('locations', 'Where you can teach', 'Cities, churches or "online".'),
      ],
    },
    {
      id: 'safeguarding',
      label: 'Safeguarding',
      description: 'Teachers work with children. Staff review every teacher before a profile is listed.',
      fields: [
        {
          name: 'safeguardingAcknowledged',
          label:
            'I will follow the Academy child-safety rules: lessons with students under 18 happen with a parent, guardian or approved adult present or in an open, visible space, and I never contact a student privately outside the lesson arrangements.',
          kind: 'checkbox',
          required: true,
        },
      ],
    },
  ],
  artist: [
    {
      id: 'artist',
      label: 'Your music',
      description: 'How event organizers will see you once your profile is published.',
      fields: [
        text('stageName', 'Artist or group name', true),
        REGION,
        area('bio', 'Short bio', true, { maxLength: 1200 }),
        urls('sampleLinks', 'Sample recordings (optional)'),
      ],
    },
  ],
};

/** Display name field per role (copied to `provider_profiles.display_name`). */
const DISPLAY_NAME_FIELD: Readonly<Record<ProviderRole, string>> = {
  musician: 'displayName',
  technician: 'displayName',
  church: 'legalName',
  agent: 'agencyName',
  organizer: 'organizationName',
  teacher: '',
  artist: 'stageName',
};

// --- Profile model --------------------------------------------------------------------------

export type ProfileValue = string | string[] | boolean;

export interface ProviderProfile {
  id: string;
  personId: string;
  role: ProviderRole;
  productOrigin: Product;
  organizationId: string | null;
  displayName: string;
  status: ProviderStatus;
  publishedAt: number | null;
  requiresStaffReview: boolean;
  fields: Record<string, ProfileValue>;
  createdAt: number;
  updatedAt: number;
}

interface ProfileRow {
  id: string;
  person_id: string;
  role: string;
  product_origin: string;
  organization_id: string | null;
  display_name: string;
  profile_json: string;
  status: string;
  published_at: number | null;
  requires_staff_review: number;
  created_at: number;
  updated_at: number;
}

const COLUMNS =
  'id, person_id, role, product_origin, organization_id, display_name, profile_json, status, published_at, requires_staff_review, created_at, updated_at';

function parseFields(json: string): Record<string, ProfileValue> {
  try {
    const parsed = JSON.parse(json) as { fields?: unknown };
    const fields = parsed && typeof parsed === 'object' ? parsed.fields : null;
    return fields && typeof fields === 'object' ? (fields as Record<string, ProfileValue>) : {};
  } catch {
    return {};
  }
}

export function toProviderProfile(row: ProfileRow): ProviderProfile {
  return {
    id: row.id,
    personId: row.person_id,
    role: row.role as ProviderRole,
    productOrigin: row.product_origin as Product,
    organizationId: row.organization_id ?? null,
    displayName: row.display_name,
    status: row.status as ProviderStatus,
    publishedAt:
      row.published_at === null || row.published_at === undefined ? null : Number(row.published_at),
    requiresStaffReview: Number(row.requires_staff_review) === 1,
    fields: parseFields(row.profile_json),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export class ProviderInputError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'INVALID' | 'NOT_EDITABLE' | 'GATES_NOT_MET' | 'CONFLICT',
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ProviderInputError';
  }
}

/** States in which the provider may edit and save steps (not while staff are reviewing it). */
export const EDITABLE_STATUSES: readonly ProviderStatus[] = [
  'draft',
  'changes_requested',
  'verified',
  'rejected',
];
/** States from which the provider may submit for review. */
export const SUBMITTABLE_STATUSES: readonly ProviderStatus[] = ['draft', 'changes_requested', 'rejected'];

export async function getProviderProfile(db: SqlDatabase, id: string): Promise<ProviderProfile | null> {
  const [row] = await allRows<ProfileRow>(db, {
    sql: `SELECT ${COLUMNS} FROM provider_profiles WHERE id = ?1`,
    params: [id],
  });
  return row ? toProviderProfile(row) : null;
}

/** The person's profiles (every role, every product of origin). */
export async function listProviderProfilesForPerson(
  db: SqlDatabase,
  personId: string,
): Promise<ProviderProfile[]> {
  const rows = await allRows<ProfileRow>(db, {
    sql: `SELECT ${COLUMNS} FROM provider_profiles WHERE person_id = ?1 ORDER BY created_at ASC`,
    params: [personId],
  });
  return rows.map(toProviderProfile);
}

/** The person's profile for a role (the one without an organization first, then the oldest). */
export async function findProviderProfile(
  db: SqlDatabase,
  personId: string,
  role: ProviderRole,
): Promise<ProviderProfile | null> {
  const [row] = await allRows<ProfileRow>(db, {
    sql: `SELECT ${COLUMNS} FROM provider_profiles WHERE person_id = ?1 AND role = ?2
           ORDER BY created_at ASC LIMIT 1`,
    params: [personId, role],
  });
  return row ? toProviderProfile(row) : null;
}

/**
 * Creates the draft profile for a role (idempotent: the unique (person, role, organization) index keeps
 * one row; a second call returns the existing one). Never publishes.
 */
export async function createDraftProviderProfile(
  db: SqlDatabase,
  input: { personId: string; role: ProviderRole; product: Product; displayName: string; now: number },
): Promise<ProviderProfile> {
  if (!isProviderRole(input.role)) throw new ProviderInputError('INVALID', 'Choose a role to continue.');
  const existing = await findProviderProfile(db, input.personId, input.role);
  if (existing) return existing;
  const id = newPrefixedId('prv');
  const name = input.displayName.replace(/\s+/g, ' ').trim().slice(0, 160) || ROLE_LABELS[input.role];
  await runBatch(db, [
    {
      sql: `INSERT INTO provider_profiles (id, person_id, role, product_origin, organization_id, display_name, profile_json, status, requires_staff_review, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, NULL, ?5, '{"fields":{}}', 'draft', ?6, ?7, ?7)
            ON CONFLICT DO NOTHING`,
      params: [
        id,
        input.personId,
        input.role,
        input.product,
        name,
        requiresStaffReview(input.role) ? 1 : 0,
        input.now,
      ],
    },
  ]);
  const created = await findProviderProfile(db, input.personId, input.role);
  if (!created) throw new Error('createDraftProviderProfile: profile vanished');
  return created;
}

// --- Validation and completeness ------------------------------------------------------------

function cleanText(value: string, max: number): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .trim()
    .slice(0, max);
}

function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && Boolean(u.hostname) && !u.username && !u.password;
  } catch {
    return false;
  }
}

/**
 * Validates one step's submitted values (`get(name)` returns the raw form value). Returns the cleaned
 * values and field errors keyed by field name, each saying what to do next.
 */
export function validateStep(
  role: ProviderRole,
  stepId: string,
  get: (name: string) => string | null,
): { values: Record<string, ProfileValue>; errors: Record<string, string> } {
  const step = ONBOARDING_STEPS[role].find((s) => s.id === stepId);
  if (!step)
    throw new ProviderInputError('INVALID', 'That step does not exist. Reload the page and try again.');
  const values: Record<string, ProfileValue> = {};
  const errors: Record<string, string> = {};
  for (const field of step.fields) {
    const raw = get(field.name);
    const max = field.maxLength ?? 400;
    if (field.kind === 'checkbox') {
      const on = raw === 'on' || raw === 'true' || raw === '1' || raw === 'yes';
      if (field.required && !on) errors[field.name] = 'Tick this box to continue.';
      values[field.name] = on;
      continue;
    }
    const value = cleanText(raw ?? '', max);
    if (field.kind === 'list') {
      const items = value
        .split(/[,\n]/)
        .map((v) => v.trim())
        .filter(Boolean)
        .slice(0, field.maxItems ?? 20)
        .map((v) => v.slice(0, 80));
      if (field.required && items.length === 0)
        errors[field.name] = `Enter at least one item for “${field.label}”.`;
      values[field.name] = items;
      continue;
    }
    if (field.kind === 'urls') {
      const items = value
        .split(/\s+/)
        .map((v) => v.trim())
        .filter(Boolean);
      const bad = items.find((v) => !isHttpsUrl(v));
      if (bad) errors[field.name] = 'Each link must start with https:// — check the links and try again.';
      else if (items.length > (field.maxItems ?? 5))
        errors[field.name] = `Add at most ${field.maxItems ?? 5} links.`;
      else if (field.required && items.length === 0) errors[field.name] = 'Add at least one link.';
      values[field.name] = items.slice(0, field.maxItems ?? 5);
      continue;
    }
    if (field.required && !value) {
      errors[field.name] = `Enter ${field.label.replace(/ \(optional\)$/, '').toLowerCase()} to continue.`;
    } else if (value && field.kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors[field.name] = 'Enter an email address like name@example.org.';
    } else if (value && field.kind === 'url' && !isHttpsUrl(value)) {
      errors[field.name] = 'Enter a web address starting with https://.';
    } else if (value && field.kind === 'tel' && !/^[+()0-9 .-]{7,40}$/.test(value)) {
      errors[field.name] = 'Enter a phone number using digits, spaces, + or -.';
    } else if (value && field.kind === 'select' && !field.options?.some((o) => o.value === value)) {
      errors[field.name] = 'Choose one of the options.';
    }
    values[field.name] = value;
  }
  return { values, errors };
}

function hasValue(value: ProfileValue | undefined): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'boolean') return value;
  return typeof value === 'string' && value.trim() !== '';
}

/** Which steps are complete (every required field has a value). */
export function stepCompletion(
  role: ProviderRole,
  fields: Record<string, ProfileValue>,
): Record<string, boolean> {
  return Object.fromEntries(
    ONBOARDING_STEPS[role].map((step) => [
      step.id,
      step.fields.every((f) => !f.required || hasValue(fields[f.name])),
    ]),
  );
}

/** Share of required fields filled, 0–100. */
export function profileCompleteness(role: ProviderRole, fields: Record<string, ProfileValue>): number {
  const required = ONBOARDING_STEPS[role].flatMap((s) => s.fields.filter((f) => f.required));
  if (required.length === 0) return 100;
  const done = required.filter((f) => hasValue(fields[f.name])).length;
  return Math.round((done / required.length) * 100);
}

export function isProfileComplete(role: ProviderRole, fields: Record<string, ProfileValue>): boolean {
  return profileCompleteness(role, fields) === 100;
}

/**
 * Saves one step (draft). Refused while staff are reviewing (submitted / meeting scheduled / in review)
 * and for suspended profiles. Editing a verified profile keeps it verified.
 */
export async function saveOnboardingStep(
  db: SqlDatabase,
  input: {
    profileId: string;
    personId: string;
    stepId: string;
    get: (name: string) => string | null;
    actorUserId: string;
    now: number;
  },
): Promise<{ profile: ProviderProfile; errors: Record<string, string> }> {
  const profile = await getProviderProfile(db, input.profileId);
  if (!profile || profile.personId !== input.personId)
    throw new ProviderInputError(
      'NOT_FOUND',
      'We could not find that profile. Reload the page and try again.',
    );
  if (!EDITABLE_STATUSES.includes(profile.status))
    throw new ProviderInputError(
      'NOT_EDITABLE',
      profile.status === 'suspended'
        ? 'This profile is suspended. Contact hello@gamostudio.org for help.'
        : 'Staff are reviewing this profile, so it cannot be changed right now. You will get an email when they finish.',
    );
  const { values, errors } = validateStep(profile.role, input.stepId, input.get);
  if (Object.keys(errors).length > 0) return { profile, errors };
  const fields = { ...profile.fields, ...values };
  const nameField = DISPLAY_NAME_FIELD[profile.role];
  const displayName =
    nameField && typeof fields[nameField] === 'string' && (fields[nameField] as string).trim()
      ? (fields[nameField] as string).trim().slice(0, 160)
      : profile.displayName;
  const [updated] = await runBatch(db, [
    {
      sql: `UPDATE provider_profiles SET profile_json = ?2, display_name = ?3, updated_at = ?4
             WHERE id = ?1 AND status IN ('draft', 'changes_requested', 'verified', 'rejected')
             RETURNING ${COLUMNS}`,
      params: [profile.id, JSON.stringify({ fields }), displayName, input.now],
    },
  ]);
  const row = (updated as ProfileRow[])[0];
  if (!row)
    throw new ProviderInputError(
      'NOT_EDITABLE',
      'This profile changed while you were editing. Reload the page and try again.',
    );
  return { profile: toProviderProfile(row), errors: {} };
}

// --- Gates ----------------------------------------------------------------------------------

export type GateId = 'email' | 'profile' | 'terms' | 'review' | 'payout';

export interface PublishGate {
  id: GateId;
  label: string;
  met: boolean;
  /** True when this gate blocks publishing (payout is informational for profiles). */
  blocking: boolean;
  /** What is missing and how to fix it. */
  help: string;
  /** Where to fix it. */
  href?: string;
}

export interface GateContext {
  emailVerified: boolean;
  /** Current-version terms acceptances are looked up for these subject ids. */
  personId: string;
  userId: string;
}

export async function evaluatePublishGates(
  db: SqlDatabase,
  profile: ProviderProfile,
  ctx: GateContext,
): Promise<PublishGate[]> {
  const termsSlug = providerTermsFor(profile.role);
  const missing = await missingTermsAcceptances(db, { personId: ctx.personId, userId: ctx.userId }, [
    termsSlug,
  ]);
  const termsDoc = getTermsDocument(termsSlug);
  const completeness = profileCompleteness(profile.role, profile.fields);
  const reviewNeeded = profile.requiresStaffReview;
  const reviewHelp: Record<ProviderStatus, string> = {
    draft: requiresMeeting(profile.role)
      ? 'Submit your church for verification. Staff will contact you to arrange an in-person meeting.'
      : 'Submit your profile for review once every step is complete.',
    submitted: 'Submitted — staff will review it and email you.',
    meeting_scheduled: 'A verification meeting is scheduled. Staff will email you after it.',
    in_review: 'Staff are reviewing your profile.',
    changes_requested: 'Staff asked for changes. Update your profile and submit it again.',
    verified: 'Verified by Gamo staff.',
    rejected:
      'This profile was not approved. You can update it and submit it again, or contact hello@gamostudio.org.',
    suspended: 'This profile is suspended. Contact hello@gamostudio.org.',
  };
  return [
    {
      id: 'email',
      label: 'Verified email',
      met: ctx.emailVerified,
      blocking: true,
      help: ctx.emailVerified
        ? 'Your email address is verified.'
        : 'Sign in again with the emailed code to verify your address.',
      href: '/account',
    },
    {
      id: 'profile',
      label: 'Profile complete',
      met: completeness === 100,
      blocking: true,
      help:
        completeness === 100
          ? 'Every required step is filled in.'
          : `Your profile is ${completeness}% complete. Finish the remaining steps.`,
      href: `/account/onboarding?role=${profile.role}`,
    },
    {
      id: 'terms',
      label: `${termsDoc?.title ?? 'Provider Terms'} accepted`,
      met: missing.length === 0,
      blocking: true,
      help:
        missing.length === 0
          ? `You accepted the current version (${termsDoc?.version}).`
          : `Read and accept the current ${termsDoc?.title ?? 'terms'} on the last onboarding step.`,
      href: `/account/onboarding?role=${profile.role}&step=terms`,
    },
    {
      id: 'review',
      label: requiresMeeting(profile.role) ? 'Verified in person by Gamo staff' : 'Reviewed by Gamo staff',
      met: !reviewNeeded || profile.status === 'verified',
      blocking: reviewNeeded,
      help: reviewNeeded
        ? reviewHelp[profile.status]
        : 'Not required for this role. You may still ask for a review.',
      href: `/account/profile?role=${profile.role}`,
    },
    {
      id: 'payout',
      label: 'Payout setup for paid events',
      met: false,
      blocking: false,
      help: 'Not available yet — paid events stay closed until payouts are set up. Free events are not affected.',
    },
  ];
}

export function gatesAllowPublishing(gates: readonly PublishGate[]): boolean {
  return gates.every((g) => g.met || !g.blocking);
}

/**
 * Provider submits for staff review: needs a verified email, a complete profile and the current terms.
 * Conditional on the status read, so a double submit or a stale tab never overwrites a staff decision.
 */
export async function submitForReview(
  db: SqlDatabase,
  input: { profileId: string; ctx: GateContext; now: number },
): Promise<ProviderProfile> {
  const profile = await getProviderProfile(db, input.profileId);
  if (!profile || profile.personId !== input.ctx.personId)
    throw new ProviderInputError(
      'NOT_FOUND',
      'We could not find that profile. Reload the page and try again.',
    );
  if (profile.status === 'submitted') return profile;
  if (!SUBMITTABLE_STATUSES.includes(profile.status))
    throw new ProviderInputError(
      'NOT_EDITABLE',
      profile.status === 'verified'
        ? 'This profile is already verified.'
        : 'This profile is already with staff. You will get an email when they finish.',
    );
  const gates = await evaluatePublishGates(db, profile, input.ctx);
  const unmet = gates.filter((g) => ['email', 'profile', 'terms'].includes(g.id) && !g.met);
  if (unmet.length > 0)
    throw new ProviderInputError('GATES_NOT_MET', `Before you submit: ${unmet.map((g) => g.help).join(' ')}`);
  const [moved] = await runBatch(db, [
    {
      sql: `UPDATE provider_profiles SET status = 'submitted', updated_at = ?3
             WHERE id = ?1 AND status = ?2 RETURNING ${COLUMNS}`,
      params: [profile.id, profile.status, input.now],
    },
    {
      sql: `INSERT INTO verification_records (id, subject_type, subject_id, action, from_status, to_status, created_at)
            SELECT ?1, 'provider_profile', ?2, 'submit', ?3, 'submitted', ?4
             WHERE (SELECT status FROM provider_profiles WHERE id = ?2) = 'submitted'`,
      params: [newPrefixedId('ver'), profile.id, profile.status, input.now],
    },
  ]);
  const row = (moved as ProfileRow[])[0];
  if (!row)
    throw new ProviderInputError(
      'CONFLICT',
      'This profile changed while you were working. Reload the page and try again.',
    );
  return toProviderProfile(row);
}

/** Publishes the profile when every blocking gate holds (the trigger enforces `verified` again). */
export async function publishProviderProfile(
  db: SqlDatabase,
  input: { profileId: string; ctx: GateContext; now: number },
): Promise<ProviderProfile> {
  const profile = await getProviderProfile(db, input.profileId);
  if (!profile || profile.personId !== input.ctx.personId)
    throw new ProviderInputError(
      'NOT_FOUND',
      'We could not find that profile. Reload the page and try again.',
    );
  if (profile.publishedAt) return profile;
  const gates = await evaluatePublishGates(db, profile, input.ctx);
  if (!gatesAllowPublishing(gates)) {
    const unmet = gates.filter((g) => g.blocking && !g.met);
    throw new ProviderInputError('GATES_NOT_MET', `Not yet: ${unmet.map((g) => g.help).join(' ')}`);
  }
  const [rows] = await runBatch(db, [
    {
      sql: `UPDATE provider_profiles SET published_at = ?3, updated_at = ?3
             WHERE id = ?1 AND status = ?2 AND published_at IS NULL RETURNING ${COLUMNS}`,
      params: [profile.id, profile.status, input.now],
    },
  ]);
  const row = (rows as ProfileRow[])[0];
  if (!row)
    throw new ProviderInputError(
      'CONFLICT',
      'This profile changed while you were working. Reload the page and try again.',
    );
  return toProviderProfile(row);
}

/** Takes the profile off public view (the provider's own choice). */
export async function unpublishProviderProfile(
  db: SqlDatabase,
  input: { profileId: string; ctx: GateContext; now: number },
): Promise<void> {
  const profile = await getProviderProfile(db, input.profileId);
  if (!profile || profile.personId !== input.ctx.personId)
    throw new ProviderInputError(
      'NOT_FOUND',
      'We could not find that profile. Reload the page and try again.',
    );
  await runBatch(db, [
    {
      sql: 'UPDATE provider_profiles SET published_at = NULL, updated_at = ?2 WHERE id = ?1',
      params: [profile.id, input.now],
    },
  ]);
}

/** Verified church organizations of a person (used by the Worship `/church` workspace gate). */
export async function verifiedChurchOrganizationIds(db: SqlDatabase, personId: string): Promise<string[]> {
  const rows = await allRows<{ organization_id: string }>(db, {
    sql: `SELECT organization_id FROM provider_profiles
           WHERE person_id = ?1 AND role = 'church' AND status = 'verified' AND organization_id IS NOT NULL`,
    params: [personId],
  });
  return rows.map((r) => r.organization_id);
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
