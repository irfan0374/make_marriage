import type {
  CreateWeddingInput,
  Me,
  UpdateWeddingInput,
  Wedding,
} from '@/modules/weddings/weddings.types';
import { apiFetch, postJson } from '@/shared/api-client';

export const getMe = () => apiFetch<Me>('/api/me');
export const getWedding = (weddingId: string) => apiFetch<Wedding>(`/api/weddings/${weddingId}`);
export const createWedding = (input: CreateWeddingInput) =>
  postJson<Wedding>('/api/weddings', input);
export const updateWedding = (weddingId: string, input: UpdateWeddingInput) =>
  apiFetch<Wedding>(`/api/weddings/${weddingId}`, { method: 'PATCH', body: JSON.stringify(input) });
