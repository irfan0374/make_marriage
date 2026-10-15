'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createExpense,
  deleteExpense,
  getExpenseCategories,
  getExpenses,
  getExpenseSummary,
  saveExpenseCategories,
  updateExpense,
} from '@/features/expenses/api';
import type { CreateExpenseInput, UpdateExpenseInput } from '@/modules/expenses/expenses.types';

export const expensesKey = (weddingId: string) => ['weddings', weddingId, 'expenses'] as const;
const categoriesKey = (weddingId: string) => ['weddings', weddingId, 'expense-categories'] as const;

/** One page of expenses for these filters; the previous page stays while the next loads. */
export function useExpenses(weddingId: string, query: URLSearchParams) {
  return useQuery({
    queryKey: [...expensesKey(weddingId), 'list', query.toString()],
    queryFn: () => getExpenses(weddingId, query),
    placeholderData: keepPreviousData,
  });
}

/** Totals by category, event, vendor and who paid (also the dashboard and Vendors). */
export function useExpenseSummary(weddingId: string) {
  return useQuery({
    queryKey: [...expensesKey(weddingId), 'summary'],
    queryFn: () => getExpenseSummary(weddingId),
  });
}

function useRefresh(weddingId: string) {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: expensesKey(weddingId) });
}

export function useCreateExpense(weddingId: string) {
  const onSettled = useRefresh(weddingId);
  return useMutation({
    mutationFn: (input: CreateExpenseInput) => createExpense(weddingId, input),
    onSettled,
  });
}

export function useUpdateExpense(weddingId: string) {
  const onSettled = useRefresh(weddingId);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateExpenseInput }) =>
      updateExpense(weddingId, id, input),
    onSettled,
  });
}

export function useDeleteExpense(weddingId: string) {
  const onSettled = useRefresh(weddingId);
  return useMutation({ mutationFn: (id: string) => deleteExpense(weddingId, id), onSettled });
}

export function useExpenseCategories(weddingId: string) {
  return useQuery({
    queryKey: categoriesKey(weddingId),
    queryFn: () => getExpenseCategories(weddingId),
  });
}

export function useSaveExpenseCategories(weddingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (list: string[]) => saveExpenseCategories(weddingId, list),
    onSuccess: (data) => queryClient.setQueryData(categoriesKey(weddingId), data),
  });
}
