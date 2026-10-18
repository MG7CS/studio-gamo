import type { GamoEnv } from '@gamo/config/env';
/**
 * Standardized API Response Utilities & Error Boundary
 *
 * Implements the Gamo Studios API conventions:
 * - Predictable JSON envelopes: { success: true, data, meta } / { success: false, error }
 * - Structured field validation error formatting.
 * - HTTP status code mapping for domain, auth, and system errors.
 */

import { ZodError } from 'zod';
import { AuthError, ClerkUnavailableError } from '@gamo/auth';
import { ContractValidationError } from '@gamo/api-contracts/runtime';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
    [key: string]: unknown;
  };
}

export function jsonResponse<T>(
  data: T,
  status: number = 200,
  meta?: ApiResponse['meta'],
  headers: Record<string, string> = {},
): Response {
  const body: ApiResponse<T> = {
    success: true,
    data,
    ...(meta ? { meta } : {}),
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

export function errorResponse(
  code: string,
  message: string,
  status: number = 400,
  details?: unknown,
  headers: Record<string, string> = {},
): Response {
  const body: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

/**
 * Standardized API Route error handler.
 * Safely maps Zod errors to 400, AuthErrors to 401/403, and unexpected errors to 500.
 */
export function handleApiError(err: unknown): Response {
  if (err instanceof ContractValidationError) {
    return errorResponse(err.code, err.message, err.status);
  }
  if (err instanceof ZodError) {
    const formattedIssues = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));

    return errorResponse(
      'VALIDATION_ERROR',
      'The request payload failed schema validation.',
      400,
      formattedIssues,
    );
  }

  if (err instanceof AuthError) {
    return errorResponse(err.code, err.message, err.status);
  }

  if (err instanceof ClerkUnavailableError) {
    return errorResponse('UNAVAILABLE', 'Sign-in is temporarily unavailable. Please try again shortly.', 503);
  }

  if (err instanceof Error) {
    // Domain services signal expected failures with a leading code: `CONFLICT: …`, `NOT_FOUND: …`.
    // Only that prefix is trusted; the rest of the message is never returned to the client.
    const code = /^([A-Z_]+)(?::|$)/.exec(err.message)?.[1];
    switch (code) {
      case 'BAD_REQUEST':
        return errorResponse('BAD_REQUEST', 'The request is invalid.', 400);
      case 'RATE_LIMITED':
      case 'TOO_MANY_REQUESTS':
        return errorResponse('RATE_LIMITED', 'Too many requests. Please wait before trying again.', 429);
      case 'NOT_FOUND':
        return errorResponse('NOT_FOUND', 'Resource not found.', 404);
      case 'CONFLICT':
      case 'ALREADY_EXISTS':
        return errorResponse('CONFLICT', 'The operation conflicts with the current resource state.', 409);
      case 'INVALID_CHALLENGE_CODE':
      case 'UNAUTHORIZED':
        return errorResponse('UNAUTHENTICATED', 'Verification or authentication failed.', 401);
      case 'FORBIDDEN':
        return errorResponse('FORBIDDEN', 'Operation forbidden.', 403);
    }

    console.error('[API Route Internal Error]');
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred.', 500);
  }

  console.error('[API Route Unknown Error]');
  return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred.', 500);
}

/**
 * Safely resolves the Cloudflare Worker runtime environment (`env`) across:
 * 1. Node.js contract/security test harnesses that pass `{ locals: { runtime: { env } } }` as a plain data property.
 * 2. Astro v6 on Cloudflare Workers (`workerd`), where `Astro.locals.runtime` is a deprecated throwing getter and bindings live in `cloudflare:workers`.
 */
export async function getRuntimeEnv(context?: { locals?: unknown }): Promise<GamoEnv> {
  const locals = context?.locals as { runtime?: { env?: unknown } } | undefined;
  if (locals && typeof locals === 'object') {
    try {
      const env = locals.runtime?.env;
      if (env && typeof env === 'object') {
        return env as GamoEnv;
      }
    } catch {
      // Astro v6 Cloudflare adapter throws on locals.runtime.env; fall through to cloudflare:workers
    }
  }
  try {
    const modName = 'cloudflare:workers';
    const cf = await import(/* @vite-ignore */ modName);
    if (cf && typeof cf.env === 'object' && cf.env !== null) {
      return cf.env as GamoEnv;
    }
  } catch {
    // Not running inside workerd/Cloudflare runtime
  }
  return {};
}
