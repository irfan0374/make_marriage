import type { CreateWeddingInput, Me, Wedding } from '@/modules/weddings/weddings.types';
import { apiFetch, postJson } from '@/shared/api-client';

export const getMe = () => apiFetch<Me>('/api/me');
export const getWedding = (weddingId: string) => apiFetch<Wedding>(`/api/weddings/${weddingId}`);
export const createWedding = (input: CreateWeddingInput) =>
  postJson<Wedding>('/api/weddings', input);
