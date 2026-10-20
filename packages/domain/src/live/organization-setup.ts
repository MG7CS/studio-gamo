/**
 * The set-up of an organization, in three steps so the screen always fits: 1 "Your organization" (name, kind, city,
 * state), 2 "About you" (what you do, and a website or public contact email so people and Gamo can check who you
 * are), 3 "Review" (your answers and the terms). Pure logic: which step a post is on, what is wrong with it (every
 * problem at once, tied to its field) and where the person goes next. The pages only call it.
 *
 * These rules are stricter than editing an existing organization (`validateOrganization`): setting up asks for the
 * things Gamo's first-event review looks at, while an owner can still save a lean profile later.
 */
import { OrganizerError, validateOrganization, type OrganizationInput } from './organizers.ts';

export type SetupStep = 1 | 2 | 3;
export const SETUP_STEP_LABELS = ['Your organization', 'About you', 'Review'] as const;
export type SetupField =
  'name' | 'kind' | 'city' | 'state' | 'description' | 'website' | 'contactEmail' | 'terms';
export const SETUP_STEP_FIELDS: Record<SetupStep, readonly SetupField[]> = {
  1: ['name', 'kind', 'city', 'state'],
  2: ['description', 'website', 'contactEmail'],
  3: ['terms'],
};
export type SetupErrors = Partial<Record<SetupField, string>>;

export const SETUP_DESCRIPTION_MIN = 20;

/** What the form posts, trimmed. */
export function readSetupValues(raw: { get(name: string): unknown }): Required<OrganizationInput> & {
  terms: boolean;
} {
  const text = (k: string) => String(raw.get(k) ?? '').trim();
  return {
    name: text('name'),
    kind: text('kind') || 'church',
    city: text('city'),
    state: text('state').toUpperCase(),
    website: text('website'),
    contactEmail: text('contactEmail'),
    description: text('description'),
    terms: raw.get('terms') === 'yes',
  };
}

/** Which screen was showing, and whether the person pressed Back (then nothing is checked). */
export function readSetupStep(raw: { get(name: string): unknown }): { step: SetupStep; back: boolean } {
  const n = Number(String(raw.get('step') ?? ''));
  const step: SetupStep = n === 2 ? 2 : n === 3 ? 3 : 1;
  return { step, back: String(raw.get('nav') ?? '') === 'back' };
}

/** The format check of `validateOrganization` for one field, as a yes or no. */
function formatOk(field: 'website' | 'contactEmail', value: string): boolean {
  try {
    validateOrganization({ name: 'Check', kind: 'church', [field]: value });
    return true;
  } catch (error) {
    if (error instanceof OrganizerError && error.field === field) return false;
    return true;
  }
}

/** Problems on one step (all at once). Step 3 only needs the terms. */
export function validateSetupStep(step: SetupStep, v: ReturnType<typeof readSetupValues>): SetupErrors {
  const e: SetupErrors = {};
  if (step === 1) {
    if (v.name.length < 2 || v.name.length > 120)
      e.name = 'Enter your organization’s name (2 to 120 characters).';
    if (!['church', 'ministry', 'artist', 'organizer'].includes(v.kind))
      e.kind = 'Choose what kind of organization this is.';
    if (v.city.length < 2 || v.city.length > 80) e.city = 'Enter the city you are based in.';
    if (!/^[A-Z]{2}$/.test(v.state)) e.state = 'Use the two-letter state code, for example AZ.';
  }
  if (step === 2) {
    if (v.description.length < SETUP_DESCRIPTION_MIN)
      e.description = `Tell people what you do, in at least ${SETUP_DESCRIPTION_MIN} characters.`;
    else if (v.description.length > 1000) e.description = 'Keep it under 1,000 characters.';
    if (v.website && !formatOk('website', v.website))
      e.website = 'Enter a web address like https://example.org.';
    if (v.contactEmail && !formatOk('contactEmail', v.contactEmail))
      e.contactEmail = 'Enter a valid email address.';
    if (!v.website && !v.contactEmail)
      e.website = 'Add a website or a public contact email so people, and Gamo, can check who you are.';
  }
  if (step === 3 && !v.terms) e.terms = 'Please accept the organizer terms to continue.';
  return e;
}

/** Problems across steps 1 and 2: the final check before creating, so nothing skipped can slip through. */
export function validateSetupAll(v: ReturnType<typeof readSetupValues>): SetupErrors {
  return { ...validateSetupStep(1, v), ...validateSetupStep(2, v) };
}

/** The earliest step that has an error, so a problem is never hidden on a screen the person already passed. */
export function stepOfSetupError(errors: SetupErrors): SetupStep {
  if (SETUP_STEP_FIELDS[1].some((f) => errors[f])) return 1;
  if (SETUP_STEP_FIELDS[2].some((f) => errors[f])) return 2;
  return 3;
}

/** The errors in the order of the fields on the screens, for a summary. */
export function orderedSetupErrors(errors: SetupErrors): { field: SetupField; message: string }[] {
  return ([1, 2, 3] as const).flatMap((s) =>
    SETUP_STEP_FIELDS[s].flatMap((field) => (errors[field] ? [{ field, message: errors[field]! }] : [])),
  );
}
