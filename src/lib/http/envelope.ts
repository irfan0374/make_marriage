import type { AppError } from './errors';

// Response envelope (docs/api-spec.md §2.3-2.4).

export type Meta = Record<string, unknown>;

export interface SuccessBody<T> {
  data: T;
  meta?: Meta;
}

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

export function ok<T>(data: T, meta?: Meta, status = 200): Response {
  const body: SuccessBody<T> = meta ? { data, meta } : { data };
  return Response.json(body, { status });
}

export function created<T>(data: T, meta?: Meta): Response {
  return ok(data, meta, 201);
}

export function accepted<T>(data: T, meta?: Meta): Response {
  return ok(data, meta, 202);
}

/** Lists always carry `meta.nextCursor` (null when there are no more results). */
export function list<T>(data: T[], meta: Meta & { nextCursor: string | null }): Response {
  return ok(data, meta);
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function errorResponse(error: AppError, requestId: string): Response {
  const body: ErrorBody = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
      requestId,
    },
  };
  return Response.json(body, { status: error.status, headers: error.headers });
}
