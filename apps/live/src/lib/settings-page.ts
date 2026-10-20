/**
 * What happens on the Settings page when a form is posted: save the profile, or sign out the other devices. The page
 * only calls this and renders the result; the rules live in `@gamo/domain`.
 */
import {
  endOtherSessions,
  updateOrganizerSettings,
  validateSettings,
  type Organizer,
  type SettingsErrors,
  type SettingsInput,
} from '@gamo/domain';
import type { LiveContext } from './registration';

export interface SettingsActionResult {
  /** Redirect back with this flash message key (a saved change). */
  flash?: string;
  /** Problems to show next to the fields; the form keeps what was typed. */
  errors?: SettingsErrors;
  values?: SettingsInput;
}

export const SETTINGS_FLASH = {
  'profile-saved': 'Your settings are saved.',
  'others-signed-out': 'Your other devices were signed out.',
  'no-others': 'You are not signed in anywhere else.',
} as const;

export const readSettingsForm = (form: FormData): SettingsInput => ({
  displayName: String(form.get('displayName') ?? ''),
  timezone: String(form.get('timezone') ?? ''),
});

export async function runSettingsAction(input: {
  live: Pick<LiveContext, 'db'>;
  organizer: Organizer;
  form: FormData;
  sessionToken: string | null;
}): Promise<SettingsActionResult> {
  const { live, organizer, form, sessionToken } = input;
  const action = String(form.get('action') ?? '');
  if (action === 'profile') {
    const { values, errors } = validateSettings(readSettingsForm(form));
    if (Object.keys(errors).length > 0) return { errors, values: readSettingsForm(form) };
    await updateOrganizerSettings(live.db, { organizerId: organizer.id, values });
    return { flash: 'profile-saved' };
  }
  if (action === 'sign-out-others') {
    const ended = await endOtherSessions(live.db, organizer.id, sessionToken);
    return { flash: ended > 0 ? 'others-signed-out' : 'no-others' };
  }
  return {};
}
