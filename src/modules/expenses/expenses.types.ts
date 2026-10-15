import type { ObjectId } from 'mongodb';
import type { z } from 'zod';
import type {
  createExpenseSchema,
  expenseCategoriesSchema,
  listExpensesQuerySchema,
  summaryQuerySchema,
  updateExpenseSchema,
} from './expenses.schemas';

export type CreateExpenseInput = z.output<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.output<typeof updateExpenseSchema>;
export type ListExpensesQuery = z.output<typeof listExpensesQuerySchema>;
export type SummaryQuery = z.output<typeof summaryQuerySchema>;
export type ExpenseCategoriesInput = z.output<typeof expenseCategoriesSchema>;

export type PaidByDocument =
  { type: 'member'; userId: ObjectId; name: string } | { type: 'name'; name: string };

/** `expenses` collection (database-design §7.7). */
export interface ExpenseDocument {
  _id: ObjectId;
  weddingId: ObjectId;
  amountPaise: number;
  /** `YYYY-MM-DD`. */
  date: string;
  /** A preset key, or one of the wedding's custom categories. */
  category: string;
  description: string;
  /** `null` means "General". */
  eventId: ObjectId | null;
  vendorId: ObjectId | null;
  /** The vendor's name when linked, kept if the vendor is deleted. */
  vendorNameSnapshot: string | null;
  paidBy: PaidByDocument;
  notes: string;
  receipt: { key: string; fileName: string; contentType: string; sizeBytes: number } | null;
  createdByUserId: ObjectId;
  editedByUserId: ObjectId;
  editedAt: Date;
  schemaVersion: 1;
  createdAt: Date;
  updatedAt: Date;
}

/** An expense as the API returns it (api-spec §4.8). */
export interface Expense {
  id: string;
  amountPaise: number;
  date: string;
  category: string;
  description: string;
  eventId: string | null;
  /** `id` is `null` when the vendor was deleted; the name stays. */
  vendor: { id: string | null; name: string } | null;
  paidBy: { type: 'member'; userId: string; name: string } | { type: 'name'; name: string };
  notes: string;
  /** Opened through `GET .../expenses/{id}/receipt` (a redirect to a short-lived link). */
  receipt: { fileName: string; contentType: string; sizeBytes: number } | null;
  editedBy: { userId: string; name: string } | null;
  editedAt: string;
  createdAt: string;
}

/** Totals for the cards and the dashboard (api-spec §13.5). */
export interface ExpenseSummary {
  totalAmountPaise: number;
  count: number;
  byCategory: { category: string; amountPaise: number }[];
  byEvent: { eventId: string | null; name: string; amountPaise: number }[];
  byVendor: { vendorId: string | null; name: string; amountPaise: number }[];
  byPaidBy: { name: string; amountPaise: number }[];
}
