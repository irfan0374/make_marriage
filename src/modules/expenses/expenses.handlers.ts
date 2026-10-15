import 'server-only';
import { z } from 'zod';
import { created, defineHandler, list, noContent, ok } from '@/lib/http';
import { toObjectId } from '@/lib/ids';
import { readSessionToken } from '@/modules/auth';
import { objectIdString } from '@/shared/validation';
import {
  createExpenseSchema,
  expenseCategoriesSchema,
  listExpensesQuerySchema,
  summaryQuerySchema,
  updateExpenseSchema,
} from './expenses.schemas';
import {
  createExpense,
  deleteExpense,
  expenseReceiptUrl,
  exportExpenses,
  getExpenseCategories,
  getExpenseSummary,
  listExpenses,
  setExpenseCategories,
  updateExpenseDetails,
} from './expenses.service';

const weddingParams = z.strictObject({ weddingId: objectIdString });
const expenseParams = z.strictObject({ weddingId: objectIdString, expenseId: objectIdString });

// GET /api/weddings/{weddingId}/expenses (api-spec §13.1)
export const listExpensesHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/expenses',
    params: weddingParams,
    query: listExpensesQuerySchema,
  },
  async ({ request, params, query }) => {
    const { expenses, nextCursor, total, totalAmountPaise } = await listExpenses(
      readSessionToken(request),
      toObjectId(params.weddingId),
      query,
    );
    return list(expenses, { nextCursor, total, totalAmountPaise });
  },
);

// POST /api/weddings/{weddingId}/expenses (api-spec §13.2)
export const createExpenseHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/expenses', params: weddingParams, body: createExpenseSchema },
  async ({ request, params, body }) =>
    created(await createExpense(readSessionToken(request), toObjectId(params.weddingId), body)),
);

// PATCH /api/weddings/{weddingId}/expenses/{expenseId} (api-spec §13.3)
export const updateExpenseHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/expenses/[expenseId]',
    params: expenseParams,
    body: updateExpenseSchema,
  },
  async ({ request, params, body }) =>
    ok(
      await updateExpenseDetails(
        readSessionToken(request),
        toObjectId(params.weddingId),
        toObjectId(params.expenseId),
        body,
      ),
    ),
);

// DELETE /api/weddings/{weddingId}/expenses/{expenseId} (api-spec §13.4)
export const deleteExpenseHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/expenses/[expenseId]', params: expenseParams },
  async ({ request, params }) => {
    await deleteExpense(
      readSessionToken(request),
      toObjectId(params.weddingId),
      toObjectId(params.expenseId),
    );
    return noContent();
  },
);

// GET /api/weddings/{weddingId}/expenses/{expenseId}/receipt (api-spec §13.8)
export const openReceiptHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/expenses/[expenseId]/receipt', params: expenseParams },
  async ({ request, params }) =>
    new Response(null, {
      status: 302,
      headers: {
        location: await expenseReceiptUrl(
          readSessionToken(request),
          toObjectId(params.weddingId),
          toObjectId(params.expenseId),
        ),
        'cache-control': 'no-store',
      },
    }),
);

// GET /api/weddings/{weddingId}/expenses/summary (api-spec §13.5)
export const expenseSummaryHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/expenses/summary',
    params: weddingParams,
    query: summaryQuerySchema,
  },
  async ({ request, params, query }) =>
    ok(await getExpenseSummary(readSessionToken(request), toObjectId(params.weddingId), query)),
);

// GET /api/weddings/{weddingId}/expenses/export (api-spec §13.6)
export const exportExpensesHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/expenses/export',
    params: weddingParams,
    query: listExpensesQuerySchema,
  },
  async ({ request, params, query }) =>
    new Response(
      await exportExpenses(readSessionToken(request), toObjectId(params.weddingId), query),
      {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="expenses.csv"',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      },
    ),
);

// GET and PUT /api/weddings/{weddingId}/expense-categories (api-spec §13.7)
export const getExpenseCategoriesHandler = defineHandler(
  { route: '/api/weddings/[weddingId]/expense-categories', params: weddingParams },
  async ({ request, params }) =>
    ok(await getExpenseCategories(readSessionToken(request), toObjectId(params.weddingId))),
);

export const setExpenseCategoriesHandler = defineHandler(
  {
    route: '/api/weddings/[weddingId]/expense-categories',
    params: weddingParams,
    body: expenseCategoriesSchema,
  },
  async ({ request, params, body }) =>
    ok(await setExpenseCategories(readSessionToken(request), toObjectId(params.weddingId), body)),
);
