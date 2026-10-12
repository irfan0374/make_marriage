import type { ErrorCode, ErrorDetails } from '@/shared/error-codes';

// Browser-side calls to our own REST API (`/api/...`), unwrapping the response envelope.

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field errors from VALIDATION_ERROR, keyed by field path. */
  fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries(this.details.map((d) => [d.path, d.message]));
  }
}

/** Call the API and return the whole envelope body (`data` and `meta`). */
async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
    credentials: 'same-origin',
  });
  if (response.status === 204) return undefined;

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body?.error;
    throw new ApiError(
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? 'Something went wrong. Please try again.',
      response.status,
      error?.details,
    );
  }
  return body;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const body = await request(path, init);
  return body?.data as T;
}

/**
 * Every item of a paginated list (api-spec §2.5), following `meta.nextCursor` page by page.
 * For lists that are small by design (tasks are capped per wedding).
 */
export async function apiFetchAll<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  do {
    const separator = path.includes('?') ? '&' : '?';
    const url: string = cursor ? `${path}${separator}cursor=${encodeURIComponent(cursor)}` : path;
    const body = await request(url);
    items.push(...((body?.data ?? []) as T[]));
    cursor = body?.meta?.nextCursor ?? null;
  } while (cursor);
  return items;
}

export const postJson = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
