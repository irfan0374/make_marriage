import 'server-only';
import type { ClientSession, Filter, ObjectId, UpdateFilter } from 'mongodb';
import { scopedCollection } from '@/lib/db/tenant';
import type { WeddingId } from '@/lib/ids';
import { EXPENSES } from './expenses.indexes';
import type { ExpenseDocument } from './expenses.types';

const scoped = (weddingId: WeddingId) => scopedCollection<ExpenseDocument>(EXPENSES, weddingId);

const SORTS = {
  '-date': { date: -1, createdAt: -1, _id: -1 },
  date: { date: 1, createdAt: 1, _id: 1 },
  '-amountPaise': { amountPaise: -1, _id: -1 },
} as const;

/** One page of expenses, the number matching and their total. */
export async function listExpenses(
  weddingId: WeddingId,
  filter: Filter<ExpenseDocument>,
  { sort, skip, limit }: { sort: keyof typeof SORTS; skip: number; limit: number },
) {
  const [docs, [totals]] = await Promise.all([
    scoped(weddingId).find(filter, { sort: SORTS[sort], skip, limit }).toArray(),
    scoped(weddingId)
      .aggregate<{ count: number; amountPaise: number }>([
        { $match: filter },
        { $group: { _id: null, count: { $sum: 1 }, amountPaise: { $sum: '$amountPaise' } } },
      ])
      .toArray(),
  ]);
  return { docs, total: totals?.count ?? 0, totalAmountPaise: totals?.amountPaise ?? 0 };
}

/** Every matching expense (the CSV export); a wedding has at most a few thousand. */
export function findAllExpenses(
  weddingId: WeddingId,
  filter: Filter<ExpenseDocument>,
  sort: keyof typeof SORTS,
) {
  return scoped(weddingId).find(filter, { sort: SORTS[sort] }).toArray();
}

export function countExpenses(weddingId: WeddingId, session?: ClientSession) {
  return scoped(weddingId).countDocuments({}, { session });
}

export function findExpense(weddingId: WeddingId, expenseId: ObjectId, session?: ClientSession) {
  return scoped(weddingId).findOne({ _id: expenseId }, { session });
}

export async function insertExpense(
  weddingId: WeddingId,
  doc: Omit<ExpenseDocument, 'weddingId'>,
  session: ClientSession,
): Promise<ExpenseDocument> {
  await scoped(weddingId).insertOne(doc, { session });
  return { ...doc, weddingId };
}

export function updateExpense(
  weddingId: WeddingId,
  expenseId: ObjectId,
  update: UpdateFilter<ExpenseDocument>,
  session: ClientSession,
) {
  return scoped(weddingId).findOneAndUpdate({ _id: expenseId }, update, {
    returnDocument: 'after',
    session,
  });
}

/** Deletes it and returns it (for its receipt), or `null` if there was none. */
export async function deleteExpense(
  weddingId: WeddingId,
  expenseId: ObjectId,
  session: ClientSession,
): Promise<ExpenseDocument | null> {
  const doc = await scoped(weddingId).findOne({ _id: expenseId }, { session });
  if (!doc) return null;
  const result = await scoped(weddingId).deleteOne({ _id: expenseId }, { session });
  return result.deletedCount > 0 ? doc : null;
}

/** Totals by category, event, vendor and who paid (database-design §7.7). */
export async function summarizeExpenses(weddingId: WeddingId, filter: Filter<ExpenseDocument>) {
  const group = (key: string) => [
    {
      $group: {
        _id: key,
        amountPaise: { $sum: '$amountPaise' },
        vendorNameSnapshot: { $first: '$vendorNameSnapshot' },
      },
    },
    { $sort: { amountPaise: -1 } },
  ];
  const [result] = await scoped(weddingId)
    .aggregate<{
      total: { amountPaise: number; count: number }[];
      byCategory: { _id: string; amountPaise: number }[];
      byEvent: { _id: ObjectId | null; amountPaise: number }[];
      byVendor: { _id: ObjectId; amountPaise: number; vendorNameSnapshot: string | null }[];
      byPaidBy: { _id: string; amountPaise: number }[];
    }>([
      { $match: filter },
      {
        $facet: {
          total: [
            { $group: { _id: null, amountPaise: { $sum: '$amountPaise' }, count: { $sum: 1 } } },
          ],
          byCategory: group('$category'),
          byEvent: group('$eventId'),
          byVendor: [{ $match: { vendorId: { $ne: null } } }, ...group('$vendorId')],
          byPaidBy: group('$paidBy.name'),
        },
      },
    ])
    .toArray();
  return result!;
}

/** How many expenses use a category (a custom category can't be removed while used). */
export function countUsingCategory(weddingId: WeddingId, category: string, session: ClientSession) {
  return scoped(weddingId).countDocuments({ category }, { session });
}

/** A deleted event's expenses move to "General" (database-design §8). */
export async function clearEvent(weddingId: WeddingId, eventId: ObjectId, session: ClientSession) {
  await scoped(weddingId).updateMany({ eventId }, { $set: { eventId: null } }, { session });
}
