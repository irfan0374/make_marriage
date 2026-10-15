import type {
  CreateExpenseInput,
  Expense,
  ExpenseSummary,
  UpdateExpenseInput,
} from '@/modules/expenses/expenses.types';
import { ApiError, apiFetch, postJson } from '@/shared/api-client';
import type { ErrorCode } from '@/shared/error-codes';

const base = (weddingId: string) => `/api/weddings/${weddingId}/expenses`;

export interface ExpensePage {
  expenses: Expense[];
  total: number;
  totalAmountPaise: number;
  nextCursor: string | null;
}

/** One page of the list, with the count and total amount for the filters (the envelope's `meta`). */
export async function getExpenses(weddingId: string, query: URLSearchParams): Promise<ExpensePage> {
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
  return {
    expenses: body.data,
    total: body.meta.total,
    totalAmountPaise: body.meta.totalAmountPaise,
    nextCursor: body.meta.nextCursor,
  };
}

export const getExpenseSummary = (weddingId: string) =>
  apiFetch<ExpenseSummary>(`${base(weddingId)}/summary`);
export const createExpense = (weddingId: string, input: CreateExpenseInput) =>
  postJson<Expense>(base(weddingId), input);
export const updateExpense = (weddingId: string, id: string, input: UpdateExpenseInput) =>
  apiFetch<Expense>(`${base(weddingId)}/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
export const deleteExpense = (weddingId: string, id: string) =>
  apiFetch<void>(`${base(weddingId)}/${id}`, { method: 'DELETE' });
export const receiptUrl = (weddingId: string, id: string) => `${base(weddingId)}/${id}/receipt`;
export const exportUrl = (weddingId: string, query: URLSearchParams) =>
  `${base(weddingId)}/export?${query.toString()}`;

const categories = (weddingId: string) => `/api/weddings/${weddingId}/expense-categories`;
export const getExpenseCategories = (weddingId: string) =>
  apiFetch<string[]>(categories(weddingId));
export const saveExpenseCategories = (weddingId: string, list: string[]) =>
  apiFetch<string[]>(categories(weddingId), {
    method: 'PUT',
    body: JSON.stringify({ categories: list }),
  });
