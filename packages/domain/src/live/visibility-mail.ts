/** The email an organization's owners get when Gamo hides one of their published events or puts it back. */
import { cleanEmailText, type LiveEmail } from './mail.ts';

export function eventVisibilityEmail(
  to: string,
  input: { title: string; hidden: boolean; note?: string },
): LiveEmail {
  const title = cleanEmailText(input.title, 140);
  const note = cleanEmailText(input.note ?? '', 2000, { multiline: true });
  return {
    to,
    subject: input.hidden ? `Your event is hidden: ${title}` : `Your event is public again: ${title}`,
    text: input.hidden
      ? `Gamo hid "${title}" from every public page on Gamo Live. Existing registrations are unchanged.\n\n` +
        (note ? `Why:\n${note}\n\n` : '') +
        'Reply to this email or write to hello@gamostudio.org to talk it through.'
      : `Gamo restored "${title}". It is public on Gamo Live again.` +
        (note ? `\n\nNote:\n${note}` : '') +
        '\n\nQuestions? Reply to this email or write to hello@gamostudio.org.',
  };
}
