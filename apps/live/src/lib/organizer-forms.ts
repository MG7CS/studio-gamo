import { OrganizerError, type OrganizationInput } from '@gamo/domain';

const text = (form: FormData, name: string) => String(form.get(name) ?? '');

export function readOrganizationForm(form: FormData): OrganizationInput {
  return {
    name: text(form, 'name'),
    kind: text(form, 'kind'),
    city: text(form, 'city'),
    state: text(form, 'state'),
    website: text(form, 'website'),
    contactEmail: text(form, 'contactEmail'),
    description: text(form, 'description'),
  };
}

const FIELD_MESSAGES: Record<string, string> = {
  name: 'Enter your organization’s name (2 to 120 characters).',
  kind: 'Choose what kind of organization this is.',
  city: 'City is too long.',
  state: 'Use the two-letter state code, for example AZ.',
  website: 'Enter a web address like https://example.org.',
  contactEmail: 'Enter a valid email address.',
  description: 'Keep the description under 1,000 characters.',
  email: 'Enter a valid email address.',
};

/** Field messages for a form from an `OrganizerError('invalid', field)`; empty when it is another error. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (error instanceof OrganizerError && error.code === 'invalid' && error.field)
    return { [error.field]: FIELD_MESSAGES[error.field] ?? 'Please check this field.' };
  return {};
}
