/**
 * Standardized API Response Utilities & Error Boundary
 *
 * Implements the Gamo Studios API conventions:
 * - Predictable JSON envelopes: { success: true, data, meta } / { success: false, error }
 * - Structured field validation error formatting.
 * - HTTP status code mapping for domain, auth, and system errors.
 */

import { ZodError } from 'zod';
import { AuthError } from '@gamo/auth';
import { ContractValidationError } from '@gamo/api-contracts/runtime';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
    [key: string]: any;
  };
}

export function jsonResponse<T>(
  data: T,
  status: number = 200,
  meta?: ApiResponse['meta'],
  headers: Record<string, string> = {}
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
  details?: any,
  headers: Record<string, string> = {}
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
      formattedIssues
    );
  }

  if (err instanceof AuthError) {
    return errorResponse(err.code, err.message, err.status);
  }

  if (err instanceof Error) {
    if (err.message.includes('RATE_LIMITED') || err.message.includes('TOO_MANY_REQUESTS')) {
      return errorResponse('RATE_LIMITED', 'Too many requests. Please wait before trying again.', 429);
    }
    if (err.message.includes('NOT_FOUND') || err.message.toLowerCase().includes('not found')) {
      return errorResponse('NOT_FOUND', 'Resource not found.', 404);
    }
    if (err.message.includes('CONFLICT') || err.message.includes('ALREADY_EXISTS') || err.message.includes('duplicate')) {
      return errorResponse('CONFLICT', 'The operation conflicts with the current resource state.', 409);
    }
    if (err.message.includes('Access denied') || err.message.includes('forbidden')) {
      return errorResponse('FORBIDDEN', 'Operation forbidden.', 403);
    }

    console.error('[API Route Internal Error]');
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred.', 500);
  }

  console.error('[API Route Unknown Error]');
  return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred.', 500);
}
