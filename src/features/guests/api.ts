import type {
  BulkHouseholdsInput,
  CreateHouseholdInput,
  Household,
  HouseholdSummary,
  PossibleDuplicate,
  UpdateHouseholdInput,
} from '@/modules/households/households.types';
import { ApiError, apiFetch, postJson } from '@/shared/api-client';
import type { ErrorCode } from '@/shared/error-codes';

const base = (weddingId: string) => `/api/weddings/${weddingId}/households`;

export interface HouseholdPage {
  households: Household[];
  total: number;
  nextCursor: string | null;
}

/** One page of the list, with its total (the envelope's `meta`). */
export async function getHouseholds(
  weddingId: string,
  query: URLSearchParams,
): Promise<HouseholdPage> {
  const response = await fetch(`${base(weddingId)}?${query.toString()}`, {
    credentials: 'same-origin',
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      (body?.error?.code ?? 'INTERNAL_ERROR') as ErrorCode,
      body?.error?.message ?? 'Something went wrong. Please try again.',
      response.status,
      body?.error?.details,
    );
  }
  return { households: body.data, total: body.meta.total, nextCursor: body.meta.nextCursor };
}

export const getHouseholdSummary = (weddingId: string) =>
  apiFetch<HouseholdSummary>(`${base(weddingId)}/summary`);

export const findDuplicates = (
  weddingId: string,
  input: { displayName?: string; email?: string; phone?: string; excludeId?: string },
) => {
  const query = new URLSearchParams(
    Object.entries(input).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  return apiFetch<PossibleDuplicate[]>(`${base(weddingId)}/duplicates?${query.toString()}`);
};

export const createHousehold = (weddingId: string, input: CreateHouseholdInput) =>
  postJson<Household>(base(weddingId), input);
export const updateHousehold = (weddingId: string, id: string, input: UpdateHouseholdInput) =>
  apiFetch<Household>(`${base(weddingId)}/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
export const deleteHousehold = (weddingId: string, id: string) =>
  apiFetch<void>(`${base(weddingId)}/${id}`, { method: 'DELETE' });
export const bulkHouseholds = (weddingId: string, input: BulkHouseholdsInput) =>
  postJson<{ updated: number }>(`${base(weddingId)}/bulk`, input);
