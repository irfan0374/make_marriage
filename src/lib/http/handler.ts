import 'server-only';
import { randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import type { z } from 'zod';
import { logger } from '@/lib/logger';
import { errorResponse } from './envelope';
import { AppError } from './errors';

type Schema = z.ZodType;

interface HandlerSchemas {
  params?: Schema;
  query?: Schema;
  body?: Schema;
}

type Parsed<S> = S extends Schema ? z.output<S> : undefined;

export interface HandlerInput<S extends HandlerSchemas> {
  request: NextRequest;
  requestId: string;
  params: Parsed<S['params']>;
  query: Parsed<S['query']>;
  body: Parsed<S['body']>;
}

export type HandlerOptions<S extends HandlerSchemas> = S & {
  /** Route pattern for logs, e.g. `/api/public/invitations/[token]`. Never log the real path: it may hold tokens. */
  route: string;
};

/** Second argument Next.js passes to route handlers. */
export interface HandlerContext {
  params: Promise<Record<string, string | string[] | undefined>>;
}

export function newRequestId(): string {
  return `req_${randomBytes(4).toString('hex')}`;
}

function zodDetails(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length === 0) return undefined;
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new AppError('VALIDATION_ERROR', 'Content-Type must be application/json.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Request body must be valid JSON.');
  }
}

function parseWith<S extends Schema>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', undefined, { details: zodDetails(result.error) });
  }
  return result.data;
}

function parseParams<S extends Schema>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  // A malformed id in the path can't name anything the caller may see (api-spec §3.3).
  if (!result.success) throw new AppError('NOT_FOUND');
  return result.data;
}

/**
 * Wrap a route handler: validate params/query/body with Zod, run `fn`, and map every outcome
 * to the response envelope with a request id. Handlers stay thin: parse, call one service, respond.
 * Query strings are only checked when a `query` schema is given; use `z.strictObject` to reject
 * unknown filters.
 */
export function defineHandler<S extends HandlerSchemas>(
  options: HandlerOptions<S>,
  fn: (input: HandlerInput<S>) => Promise<Response>,
) {
  return async function handler(request: NextRequest, context?: HandlerContext): Promise<Response> {
    const requestId = newRequestId();
    const startedAt = performance.now();
    let response: Response;

    try {
      const params = options.params
        ? parseParams(options.params, (await context?.params) ?? {})
        : undefined;
      const query = options.query
        ? parseWith(options.query, Object.fromEntries(new URL(request.url).searchParams))
        : undefined;
      const body = options.body ? parseWith(options.body, await readJsonBody(request)) : undefined;

      response = await fn({ request, requestId, params, query, body } as HandlerInput<S>);
    } catch (error) {
      if (error instanceof AppError) {
        if (error.status >= 500) {
          logger.error('request.failed', {
            requestId,
            route: options.route,
            code: error.code,
            err: error,
          });
        }
        response = errorResponse(error, requestId);
      } else {
        logger.error('request.unhandled_error', {
          requestId,
          method: request.method,
          route: options.route,
          err: error,
        });
        response = errorResponse(new AppError('INTERNAL_ERROR'), requestId);
      }
    }

    response.headers.set('x-request-id', requestId);
    logger.info('request', {
      requestId,
      method: request.method,
      route: options.route,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return response;
  };
}
