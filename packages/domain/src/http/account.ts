/**
 * Account form handlers (plain HTML form posts, 303 back to the page — they work without JavaScript):
 *
 *   POST /api/account/person-link   unlink / link again the shared person record (design §4.6)
 *   POST /api/account/providers     provider onboarding: start, save a step, terms, submit, publish
 *
 * Order (AGENTS.md): auth (verified session with an active account in this product) → same origin →
 * bounded body → validation. Outcomes travel in the redirect's query string as codes the page turns into
 * sentences; nothing personal goes into a URL.
 */
import {
  AuthError,
  PRODUCT_DISPLAY_NAMES,
  requireProductAuth,
  requireSameOrigin,
  type ProductKey,
  type SessionData,
} from '@gamo/auth';
import { getDb } from '@gamo/db';
import { validateContract, ContractValidationError } from '@gamo/api-contracts/runtime';
import { errorResponse, getRuntimeEnv } from '../api/response.ts';
import { readPublicFormBody, type PublicFormBody } from '../api/public-form-guard.ts';
import { asSqlDatabase, type SqlDatabase } from '../security/sql-database.ts';
import { IdentityService } from '../services/identity.ts';
import { linkUserToVerifiedPerson, unlinkUserFromPerson } from '../services/persons.ts';
import {
  createDraftProviderProfile,
  findProviderProfile,
  isSignupRole,
  ONBOARDING_STEPS,
  ProviderInputError,
  providerTermsFor,
  publishProviderProfile,
  saveOnboardingStep,
  submitForReview,
  unpublishProviderProfile,
  type GateContext,
  type ProviderProfile,
} from '../services/providers.ts';
import { recordTermsAcceptance, TermsAcceptanceError } from '../terms/acceptance.ts';
import { getTermsDocument } from '../terms/registry.ts';
import { clientIp, hashIp } from '../security/pii-hash.ts';
import { resolveEnvSecret } from '../security/env-secret.ts';

type Context = { request: Request; locals?: unknown };
type Handler = (context: Context) => Promise<Response>;

export function seeOther(location: string, extra: Record<string, string> = {}): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: location, 'Cache-Control': 'no-store', ...extra },
  });
}

function withQuery(path: string, params: Record<string, string | null | undefined>): string {
  const url = new URL(path, 'https://gamo.invalid');
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return url.pathname + url.search;
}

function formObject(body: PublicFormBody): Record<string, string> {
  const out: Record<string, string> = {};
  if (body.form) {
    for (const [k, v] of body.form.entries()) if (typeof v === 'string' && !(k in out)) out[k] = v;
  } else if (body.json) {
    for (const [k, v] of Object.entries(body.json)) if (typeof v === 'string') out[k] = v;
  }
  return out;
}

async function authenticate(context: Context, product: ProductKey) {
  const env = await getRuntimeEnv(context);
  const db = getDb(env.DB);
  // requireProductAuth runs the same-origin check first (requireAuth), then the session and product checks.
  const auth = await requireProductAuth(context.request, db, product, { secret: env.SESSION_SECRET, env });
  requireSameOrigin(context.request);
  return { env, db, sql: asSqlDatabase(env.DB), auth };
}

/**
 * A form post without a valid session: a browser (Accept: text/html) goes to sign-in and back; any other
 * caller gets the standard 401/403 error.
 */
function authFailure(request: Request, err: AuthError, returnPath: string): Response {
  const browser = (request.headers.get('accept') ?? '').includes('text/html');
  if (!browser) return errorResponse(err.code, err.message, err.status);
  if (err.status === 401) return seeOther(withQuery('/account/signin', { next: returnPath }));
  return seeOther('/account/access-denied');
}

async function ensurePerson(
  sql: SqlDatabase,
  auth: SessionData,
  product: ProductKey,
): Promise<string | null> {
  if (auth.personId) return auth.personId;
  const linked = await linkUserToVerifiedPerson(sql, {
    userId: auth.user.id,
    email: auth.user.email,
    product,
    source: 'email_code',
    now: Math.floor(Date.now() / 1000),
  });
  return linked.linked ? linked.personId : null;
}

function slugFrom(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || 'church'}-${suffix}`;
}

export function createAccountHandlers(product: ProductKey) {
  /** POST /api/account/person-link */
  const personLinkPOST: Handler = async (context) => {
    try {
      const { sql, auth } = await authenticate(context, product);
      const read = await readPublicFormBody(context.request);
      if (!read.ok) return seeOther(withQuery('/account', { error: read.error.code }));
      const form = validateContract('PersonLinkForm', formObject(read.body));
      const now = Math.floor(Date.now() / 1000);
      if (form.action === 'unlink') {
        const changed = await unlinkUserFromPerson(sql, { userId: auth.user.id, product, now });
        return seeOther(withQuery('/account', { person: changed ? 'unlinked' : 'unchanged' }));
      }
      if (!auth.user.verifiedEmailAt) return seeOther(withQuery('/account', { error: 'EMAIL_NOT_VERIFIED' }));
      const linked = await linkUserToVerifiedPerson(sql, {
        userId: auth.user.id,
        email: auth.user.email,
        product,
        source: 'account_page',
        explicit: true,
        now,
      });
      return seeOther(
        withQuery(
          '/account',
          linked.linked ? { person: linked.changed ? 'linked' : 'unchanged' } : { error: 'LINK_FAILED' },
        ),
      );
    } catch (err) {
      if (err instanceof AuthError) return authFailure(context.request, err, '/account');
      if (err instanceof ContractValidationError)
        return seeOther(withQuery('/account', { error: 'BAD_REQUEST' }));
      console.error(`[account] person-link failed: ${err instanceof Error ? err.name : 'unknown'}`);
      return seeOther(withQuery('/account', { error: 'UNAVAILABLE' }));
    }
  };

  /** POST /api/account/providers */
  const providersPOST: Handler = async (context) => {
    let role = '';
    let step = '';
    try {
      const { env, db, sql, auth } = await authenticate(context, product);
      const read = await readPublicFormBody(context.request);
      if (!read.ok) return seeOther(withQuery('/account/onboarding', { error: read.error.code }));
      const raw = formObject(read.body);
      role = raw.role ?? '';
      step = raw.step ?? '';
      const form = validateContract('ProviderAccountForm', raw);
      if (!isSignupRole(product, form.role))
        return seeOther(withQuery('/account/onboarding', { error: 'ROLE_NOT_OFFERED' }));
      const back = (params: Record<string, string | null | undefined>, path = '/account/onboarding') =>
        seeOther(withQuery(path, { role: form.role, ...params }));

      const personId = await ensurePerson(sql, auth, product);
      if (!personId) return back({ error: 'PERSON_UNLINKED' });
      const now = Math.floor(Date.now() / 1000);
      const ctx: GateContext = {
        emailVerified: Boolean(auth.user.verifiedEmailAt),
        personId,
        userId: auth.user.id,
      };

      if (form.action === 'start') {
        await createDraftProviderProfile(sql, {
          personId,
          role: form.role,
          product,
          displayName: auth.user.displayName ?? auth.user.email.split('@')[0],
          now,
        });
        return back({ step: ONBOARDING_STEPS[form.role][0]?.id });
      }

      const profile: ProviderProfile | null = await findProviderProfile(sql, personId, form.role);
      if (!profile) return back({ error: 'NOT_STARTED' });

      switch (form.action) {
        case 'save': {
          const steps = ONBOARDING_STEPS[form.role];
          const index = steps.findIndex((s) => s.id === form.step);
          if (index < 0) return back({ error: 'BAD_REQUEST' });
          const saved = await saveOnboardingStep(sql, {
            profileId: profile.id,
            personId,
            stepId: form.step!,
            get: (name) => (typeof raw[name] === 'string' ? raw[name] : null),
            actorUserId: auth.user.id,
            now,
          });
          const invalid = Object.keys(saved.errors);
          if (invalid.length) return back({ step: form.step, invalid: invalid.join(',') });
          // A church gets its organization (owner membership for this user) when its legal name is saved.
          if (form.role === 'church' && !saved.profile.organizationId) {
            const legalName = String(saved.profile.fields.legalName ?? '').trim();
            if (legalName) {
              const org = await new IdentityService(db).createOrganization(
                legalName,
                slugFrom(legalName),
                'church',
                auth.user.id,
              );
              await sql
                .prepare(
                  'UPDATE provider_profiles SET organization_id = ?2 WHERE id = ?1 AND organization_id IS NULL',
                )
                .bind(profile.id, org.id)
                .run();
            }
          }
          const next = steps[index + 1]?.id ?? 'terms';
          return back({ step: next, saved: '1' });
        }
        case 'terms': {
          const slug = providerTermsFor(form.role);
          if (raw.terms_accept !== 'yes') return back({ step: 'terms', invalid: 'terms_accept' });
          const doc = getTermsDocument(slug);
          if (raw.terms_slug !== slug || raw.terms_version !== doc?.version)
            return back({ step: 'terms', error: 'TERMS_OUTDATED' });
          let ipHash: string | null = null;
          try {
            ipHash = await hashIp(
              clientIp(context.request) ?? 'unknown',
              resolveEnvSecret(env as Record<string, unknown>, 'PII_HASH_SECRET'),
            );
          } catch {
            ipHash = null;
          }
          await recordTermsAcceptance(sql, {
            documents: [{ slug, version: doc!.version }],
            subject: { personId, userId: auth.user.id, email: auth.user.email },
            context: `onboarding:${product}.${form.role}`,
            ipHash,
            now,
          });
          return back({ step: 'review', saved: '1' });
        }
        case 'submit':
          await submitForReview(sql, { profileId: profile.id, ctx, now });
          return back({ submitted: '1' }, '/account/profile');
        case 'publish':
          await publishProviderProfile(sql, { profileId: profile.id, ctx, now });
          return back({ published: '1' }, '/account/profile');
        case 'unpublish':
          await unpublishProviderProfile(sql, { profileId: profile.id, ctx, now });
          return back({ unpublished: '1' }, '/account/profile');
        default:
          return back({ error: 'BAD_REQUEST' });
      }
    } catch (err) {
      const fallback = withQuery('/account/onboarding', { role: role || null, step: step || null });
      if (err instanceof AuthError) return authFailure(context.request, err, fallback);
      if (err instanceof ContractValidationError)
        return seeOther(withQuery(fallback, { error: 'BAD_REQUEST' }));
      if (err instanceof ProviderInputError) {
        const path = ['GATES_NOT_MET', 'CONFLICT'].includes(err.code) ? '/account/profile' : fallback;
        return seeOther(withQuery(path, { role: role || null, error: err.code }));
      }
      if (err instanceof TermsAcceptanceError)
        return seeOther(withQuery(fallback, { error: 'TERMS_OUTDATED' }));
      console.error(`[account] providers failed: ${err instanceof Error ? err.name : 'unknown'}`);
      return seeOther(withQuery(fallback, { error: 'UNAVAILABLE' }));
    }
  };

  return { personLinkPOST, providersPOST, productName: PRODUCT_DISPLAY_NAMES[product] };
}

/** Sentences for the outcome codes the account pages receive in their query string. */
export const ACCOUNT_OUTCOME_MESSAGES: Readonly<Record<string, string>> = {
  unlinked:
    'This product is no longer linked to your shared Gamo person record. It stays unlinked until you link it again here.',
  linked: 'This product is linked to your shared Gamo person record again.',
  unchanged: 'Nothing changed.',
  saved: 'Saved as a draft.',
  submitted: 'Submitted for staff review. We will email you when staff decide.',
  published: 'Your profile is published.',
  unpublished: 'Your profile is no longer shown publicly.',
  BAD_REQUEST: 'Something in the form was not understood. Reload the page and try again.',
  PAYLOAD_TOO_LARGE: 'That was too much text to save at once. Shorten it and try again.',
  UNSUPPORTED_MEDIA_TYPE: 'The form could not be read. Reload the page and try again.',
  EMAIL_NOT_VERIFIED: 'Sign in again with the emailed code to verify your address first.',
  LINK_FAILED:
    'We could not link this account. If your address was erased at your request, write to hello@gamostudio.org.',
  PERSON_UNLINKED:
    'Provider profiles live on your shared Gamo person record, which this account is unlinked from. Link it again on your account page to continue.',
  ROLE_NOT_OFFERED: 'That role is not offered in this product. Choose one of the roles below.',
  NOT_STARTED: 'Choose a role to start your profile.',
  NOT_FOUND: 'We could not find that profile. Reload the page and try again.',
  NOT_EDITABLE:
    'Staff are reviewing this profile, so it cannot be changed right now. You will get an email when they finish.',
  GATES_NOT_MET: 'Not yet — finish the items marked “To do” below first.',
  CONFLICT: 'This profile changed while you were working. Reload the page to see the latest.',
  INVALID: 'Check the highlighted fields and try again.',
  TERMS_OUTDATED:
    'The terms changed since this page was opened. Read the current version and accept it again.',
  UNAVAILABLE: 'Something went wrong on our side. Please try again in a moment.',
};
