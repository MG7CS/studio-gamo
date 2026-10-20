/**
 * What happens when someone sets up their organization (the three-step form on /organizer/start). The page only calls
 * this and renders the result; the rules live in `@gamo/domain` (organization-setup.ts, organizers.ts).
 */
import {
  OrganizerError,
  TERMS_DRAFT_VERSION,
  createOrganization,
  organizerErrorMessage,
  readSetupStep,
  readSetupValues,
  stepOfSetupError,
  validateSetupAll,
  validateSetupStep,
  type SetupErrors,
  type SetupStep,
} from '@gamo/domain';
import type { SqlDatabase } from '@gamo/domain';
import { ORGANIZATION_COOKIE, cookieHeader } from './organizer-session';
import { fieldErrors } from './organizer-forms';

export type SetupValues = ReturnType<typeof readSetupValues>;

export type SetupOutcome =
  | { kind: 'redirect'; response: Response }
  | { kind: 'form'; step: SetupStep; values: SetupValues; errors: SetupErrors; notice?: string };

export async function runOrganizationSetup(input: {
  db: SqlDatabase;
  organizerId: string;
  form: FormData;
  now: number;
  secure: boolean;
}): Promise<SetupOutcome> {
  const values = readSetupValues(input.form);
  const { step, back } = readSetupStep(input.form);
  const show = (to: SetupStep, errors: SetupErrors = {}, notice?: string): SetupOutcome => ({
    kind: 'form',
    step: to,
    values,
    errors,
    notice,
  });

  // Back only moves; nothing is checked and every answer is kept.
  if (back) return show(step > 1 ? ((step - 1) as SetupStep) : 1);

  const here = validateSetupStep(step, values);
  if (Object.keys(here).length > 0) return show(step, here);
  if (step < 3) return show((step + 1) as SetupStep);

  // The last step: check everything again (a post can skip screens), then create.
  const all = validateSetupAll(values);
  if (Object.keys(all).length > 0) return show(stepOfSetupError(all), all);
  try {
    const created = await createOrganization(input.db, {
      organizerId: input.organizerId,
      profile: values,
      termsVersion: TERMS_DRAFT_VERSION,
      now: input.now,
    });
    const headers = new Headers({ location: '/organizer' });
    headers.append(
      'set-cookie',
      cookieHeader(ORGANIZATION_COOKIE, created.organizationId, 30 * 86400, input.secure),
    );
    return { kind: 'redirect', response: new Response(null, { status: 303, headers }) };
  } catch (error) {
    const field = fieldErrors(error) as SetupErrors;
    if (Object.keys(field).length > 0) return show(stepOfSetupError(field), field);
    if (error instanceof OrganizerError) return show(3, {}, organizerErrorMessage(error.code));
    console.error('[live:start] failed', (error as Error)?.name);
    return show(3, {}, 'We could not save your organization. Please try again.');
  }
}
