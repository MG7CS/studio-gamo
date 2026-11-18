/**
 * Everything a public form page needs from the server, so the page file only composes components:
 *
 *   const page = await loadFormPage(Astro, 'worship-request');
 *   if ('response' in page) return page.response;      // 404 for a form that is not published, or the 303 after a send
 *
 * GET renders the published form (or says it is closed). POST runs `submitFormPage` (same-origin check, public
 * form guard, validation against the published version, storage, files, emails) and either redirects with a
 * signed reference (`?sent=`) so a reload never posts twice, or renders the form again with the errors and every
 * value kept. The page has no JavaScript requirement for the form itself.
 */
import type { AstroGlobal } from 'astro';
import { requireSameOrigin } from '@gamo/auth';
import { getRuntimeEnv } from '@gamo/domain';
import {
  FormsService,
  readSentReference,
  submitFormPage,
  type AnswerError,
  type FormPageUpload,
  type FormSchema,
  type UploadService,
} from '@gamo/domain/forms';
import { siteUrl } from '@studio-gamo/ui/lib/sites';
import { databaseOf, uploadServiceFor } from './forms-api';

interface PublicFormInfo {
  slug: string;
  title: string;
  description: string | null;
  confirmationMessage: string;
}

export type FormPageData =
  | { response: Response }
  | {
      view: 'form';
      form: PublicFormInfo;
      schema: FormSchema;
      values: Record<string, string | string[]>;
      errors: AnswerError[];
      summaryExtra: { message: string; fieldId?: string }[];
      uploads: Record<string, FormPageUpload[]>;
      uploadTokens: string[];
      idempotencyKey: string;
      turnstileError?: string;
    }
  | { view: 'sent'; form: PublicFormInfo; reference: string; problem: 'uploads' | 'request' | null }
  | { view: 'closed'; form: PublicFormInfo }
  | { view: 'unavailable'; message: string }
  /** The form is not published (yet) and the page asked for a fallback instead of a 404. */
  | { view: 'missing' };

export interface LoadFormPageOptions {
  /** Show the page's own fallback (`view: 'missing'`) instead of a 404 when the form is not published. */
  fallbackWhenMissing?: boolean;
  /** Raw values to pre-fill on first load (e.g. a topic from the link that brought the visitor). */
  prefill?: Record<string, string>;
  /** Element id to scroll to after a send, for a form that sits below other content on its page. */
  anchor?: string;
}

const UNAVAILABLE =
  'This form is temporarily unavailable. Please try again in a few minutes, or write to hello@gamostudio.org.';

function infoOf(form: {
  slug: string;
  title: string;
  description: string | null;
  confirmationMessage: string | null;
}): PublicFormInfo {
  return {
    slug: form.slug,
    title: form.title,
    description: form.description,
    confirmationMessage: form.confirmationMessage ?? 'Thank you. We received your submission.',
  };
}

function uploadServiceOrNull(
  db: NonNullable<ReturnType<typeof databaseOf>>,
  env: Awaited<ReturnType<typeof getRuntimeEnv>>,
): UploadService | null {
  try {
    return uploadServiceFor(db, env);
  } catch {
    // No bucket or secret here: forms without files still work; file questions then report "required".
    return null;
  }
}

export async function loadFormPage(
  astro: AstroGlobal,
  slug: string,
  options: LoadFormPageOptions = {},
): Promise<FormPageData> {
  const notFound = async (): Promise<FormPageData> =>
    options.fallbackWhenMissing ? { view: 'missing' } : { response: await astro.rewrite('/404') };
  const env = astro.locals.runtimeEnv ?? (await getRuntimeEnv(astro));
  const db = databaseOf(env);
  if (!db) {
    astro.response.status = 503;
    return { view: 'unavailable', message: UNAVAILABLE };
  }

  const published = await new FormsService(db).getPublished(slug);
  if (!published) return notFound();
  const form = infoOf(published.form);
  if (!published.accepting) return { view: 'closed', form };
  const schema = published.version.schema;

  if (astro.request.method === 'POST') {
    try {
      requireSameOrigin(astro.request);
    } catch {
      astro.response.status = 403;
      return {
        view: 'unavailable',
        message:
          'This form must be sent from the Gamo Studios website. Please reload the page and try again.',
      };
    }
    try {
      const outcome = await submitFormPage({
        slug,
        env,
        db,
        request: astro.request,
        locals: astro.locals,
        uploads: uploadServiceOrNull(db, env),
        adminUrlFor: (id) => siteUrl('admin', `/submissions/${id}`),
      });
      if (outcome.kind === 'sent') {
        const problem = outcome.hookFailures[0];
        const query = new URLSearchParams({ sent: outcome.signedReference });
        if (problem) query.set('issue', problem);
        return {
          response: new Response(null, {
            status: 303,
            headers: {
              Location: `${astro.url.pathname}?${query}${options.anchor ? `#${options.anchor}` : ''}`,
              'Cache-Control': 'no-store',
            },
          }),
        };
      }
      if (outcome.kind === 'not_found') return notFound();
      if (outcome.kind === 'closed') return { view: 'closed', form };
      astro.response.status = outcome.status;
      for (const [name, value] of Object.entries(outcome.headers)) astro.response.headers.set(name, value);
      return {
        view: 'form',
        form,
        schema,
        values: outcome.values,
        errors: outcome.errors,
        summaryExtra: outcome.summaryExtra,
        uploads: outcome.uploads,
        uploadTokens: outcome.uploadTokens,
        idempotencyKey: outcome.idempotencyKey,
        ...(outcome.turnstileError ? { turnstileError: outcome.turnstileError } : {}),
      };
    } catch (error) {
      // Names only: answers, tokens and addresses never reach the log.
      console.error(`[form-page.${slug}] ${(error as Error)?.name ?? 'Error'}`);
      astro.response.status = 503;
      return { view: 'unavailable', message: UNAVAILABLE };
    }
  }

  const sent = astro.url.searchParams.get('sent');
  if (sent) {
    const reference = await readSentReference(env, sent);
    if (reference) {
      const issue = astro.url.searchParams.get('issue');
      return {
        view: 'sent',
        form,
        reference,
        problem: issue === 'uploads' || issue === 'request' ? issue : null,
      };
    }
  }
  return {
    view: 'form',
    form,
    schema,
    values: options.prefill ?? {},
    errors: [],
    summaryExtra: [],
    uploads: {},
    uploadTokens: [],
    idempotencyKey: crypto.randomUUID(),
  };
}
