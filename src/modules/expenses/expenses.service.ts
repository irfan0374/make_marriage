import 'server-only';
import { ObjectId, type ClientSession, type Filter } from 'mongodb';
import { MAX_EXPENSES_PER_WEDDING } from '@/config/constants';
import { withTransaction } from '@/lib/db/transaction';
import { AppError } from '@/lib/errors';
import { toObjectId, type WeddingId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { getUsersByIds } from '@/modules/auth';
import { getEvent, listWeddingEvents } from '@/modules/events';
import { fileViewUrl, removeFile, verifyUploadedFile } from '@/modules/files';
import {
  isMember,
  requireAdmin,
  resolveWeddingContext,
  type WeddingContext,
} from '@/modules/members';
import { vendorNames } from '@/modules/vendors';
import {
  getWeddingRecord,
  lockWeddingTasks,
  requireWritableWedding,
  saveCustomExpenseCategories,
} from '@/modules/weddings';
import { makeCsv } from '@/shared/csv';
import {
  clearEvent,
  countExpenses,
  countUsingCategory,
  deleteExpense as deleteExpenseDoc,
  findAllExpenses,
  findExpense,
  insertExpense,
  listExpenses as listExpenseDocs,
  summarizeExpenses,
  updateExpense,
} from './expenses.repository';
import { categoryLabel, PRESET_CATEGORIES } from './expenses.schemas';
import type {
  CreateExpenseInput,
  Expense,
  ExpenseCategoriesInput,
  ExpenseDocument,
  ExpenseSummary,
  ListExpensesQuery,
  PaidByDocument,
  SummaryQuery,
  UpdateExpenseInput,
} from './expenses.types';

// The expense tracker (api-spec §13, PRD EXP-1 to EXP-8). Every member logs and views expenses;
// an archived wedding is read-only. Writes run under the wedding lock, so an event or a custom
// category can't disappear while an expense is being linked to it. Amounts are integer paise.

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function fieldError(path: string, message: string): AppError {
  return new AppError('VALIDATION_ERROR', undefined, { details: [{ path, message }] });
}

async function toExpenses(weddingId: WeddingId, docs: ExpenseDocument[]): Promise<Expense[]> {
  const vendorIds = [
    ...new Map(
      docs.flatMap((d) => (d.vendorId ? [[d.vendorId.toHexString(), d.vendorId] as const] : [])),
    ).values(),
  ];
  const [names, users] = await Promise.all([
    vendorNames(weddingId, vendorIds),
    getUsersByIds([...new Set(docs.map((d) => d.editedByUserId.toHexString()))].map(toObjectId)),
  ]);
  return docs.map((doc) => {
    const editor = users.get(doc.editedByUserId.toHexString());
    const vendorId = doc.vendorId?.toHexString() ?? null;
    // A vendor that still exists shows its current name; a deleted one keeps the saved name.
    const vendor =
      vendorId && names.has(vendorId)
        ? { id: vendorId, name: names.get(vendorId)! }
        : doc.vendorNameSnapshot
          ? { id: null, name: doc.vendorNameSnapshot }
          : null;
    return {
      id: doc._id.toHexString(),
      amountPaise: doc.amountPaise,
      date: doc.date,
      category: doc.category,
      description: doc.description,
      eventId: doc.eventId?.toHexString() ?? null,
      vendor,
      paidBy:
        doc.paidBy.type === 'member'
          ? { type: 'member', userId: doc.paidBy.userId.toHexString(), name: doc.paidBy.name }
          : { type: 'name', name: doc.paidBy.name },
      notes: doc.notes,
      receipt: doc.receipt
        ? {
            fileName: doc.receipt.fileName,
            contentType: doc.receipt.contentType,
            sizeBytes: doc.receipt.sizeBytes,
          }
        : null,
      editedBy: editor ? { userId: editor.id, name: editor.name } : null,
      editedAt: doc.editedAt.toISOString(),
      createdAt: doc.createdAt.toISOString(),
    };
  });
}

/** An expense change: a member, a wedding that isn't archived, under the wedding lock. */
async function writeExpenses<T>(
  token: string | undefined,
  weddingId: ObjectId,
  fn: (args: {
    context: WeddingContext;
    customCategories: string[];
    session: ClientSession;
  }) => Promise<T>,
): Promise<T> {
  const context = await resolveWeddingContext(token, weddingId);
  await requireWritableWedding(context.weddingId);
  return withTransaction(async (session) => {
    const wedding = await lockWeddingTasks(context.weddingId, session);
    // Removed from the team a moment ago? Then not any more.
    if (!(await isMember(context.weddingId, context.userId, session))) {
      throw new AppError('NOT_FOUND');
    }
    return fn({ context, customCategories: wedding.customExpenseCategories ?? [], session });
  });
}

/** A preset key, or one of the wedding's custom categories in its saved spelling. */
function resolveCategory(category: string, custom: string[]): string {
  if ((PRESET_CATEGORIES as readonly string[]).includes(category)) return category;
  const match = custom.find((c) => c.toLowerCase() === category.toLowerCase());
  if (!match) throw fieldError('category', 'Choose a category from the list');
  return match;
}

/** Who paid: a current member (their name is kept with the expense), or a name typed in. */
async function resolvePaidBy(
  weddingId: WeddingId,
  paidBy: CreateExpenseInput['paidBy'],
  session: ClientSession,
): Promise<PaidByDocument> {
  if (paidBy.type === 'name') return { type: 'name', name: paidBy.name };
  const userId = toObjectId(paidBy.userId);
  if (!(await isMember(weddingId, userId, session))) {
    throw fieldError('paidBy', 'Choose someone on the team, or type a name');
  }
  const user = (await getUsersByIds([userId])).get(userId.toHexString());
  return { type: 'member', userId, name: user?.name ?? 'Team member' };
}

async function resolveEvent(weddingId: WeddingId, id: string | null, session: ClientSession) {
  if (!id) return null;
  const eventId = toObjectId(id);
  if (!(await getEvent(weddingId, eventId, session))) {
    throw fieldError('eventId', 'Choose an event from this wedding');
  }
  return eventId;
}

async function resolveVendor(weddingId: WeddingId, id: string | null, session: ClientSession) {
  if (!id) return { vendorId: null, vendorNameSnapshot: null };
  const vendorId = toObjectId(id);
  const name = (await vendorNames(weddingId, [vendorId], session)).get(id);
  if (!name) throw fieldError('vendorId', 'Choose a vendor from your list');
  return { vendorId, vendorNameSnapshot: name };
}

async function resolveReceipt(weddingId: WeddingId, receipt: CreateExpenseInput['receipt']) {
  if (!receipt) return null;
  const file = await verifyUploadedFile(weddingId, 'receipt', receipt.key);
  return {
    key: file.key,
    fileName: receipt.fileName,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
  };
}

/** The list's filters as a query (api-spec §13.1). */
function filterOf(query: Partial<ListExpensesQuery>): Filter<ExpenseDocument> {
  const filter: Filter<ExpenseDocument> = {};
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ description: pattern }, { notes: pattern }];
  }
  if (query.category?.length) filter.category = { $in: query.category };
  if (query.eventId) {
    filter.eventId = query.eventId === 'general' ? null : toObjectId(query.eventId);
  }
  if (query.vendorId) filter.vendorId = toObjectId(query.vendorId);
  if (query.paidBy) filter['paidBy.name'] = query.paidBy;
  if (query.from || query.to) {
    filter.date = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }
  return filter;
}

/** GET /api/weddings/{weddingId}/expenses (api-spec §13.1). */
export async function listExpenses(
  token: string | undefined,
  weddingId: ObjectId,
  query: ListExpensesQuery,
): Promise<{
  expenses: Expense[];
  nextCursor: string | null;
  total: number;
  totalAmountPaise: number;
}> {
  const context = await resolveWeddingContext(token, weddingId);
  const skip = query.cursor ? Number(query.cursor) : 0;
  const { docs, total, totalAmountPaise } = await listExpenseDocs(
    context.weddingId,
    filterOf(query),
    { sort: query.sort, skip, limit: query.limit },
  );
  return {
    expenses: await toExpenses(context.weddingId, docs),
    nextCursor: skip + docs.length < total ? String(skip + docs.length) : null,
    total,
    totalAmountPaise,
  };
}

/** POST /api/weddings/{weddingId}/expenses (api-spec §13.2). */
export async function createExpense(
  token: string | undefined,
  weddingId: ObjectId,
  input: CreateExpenseInput,
  now = new Date(),
): Promise<Expense> {
  const context = await resolveWeddingContext(token, weddingId);
  // Checked before the transaction: it reads storage, which can't be part of one.
  const receipt = await resolveReceipt(context.weddingId, input.receipt);
  const doc = await writeExpenses(token, weddingId, async ({ customCategories, session }) => {
    if ((await countExpenses(context.weddingId, session)) >= MAX_EXPENSES_PER_WEDDING) {
      throw new AppError('EXPENSE_LIMIT_REACHED');
    }
    return insertExpense(
      context.weddingId,
      {
        _id: new ObjectId(),
        amountPaise: input.amountPaise,
        date: input.date,
        category: resolveCategory(input.category, customCategories),
        description: input.description,
        eventId: await resolveEvent(context.weddingId, input.eventId, session),
        ...(await resolveVendor(context.weddingId, input.vendorId, session)),
        paidBy: await resolvePaidBy(context.weddingId, input.paidBy, session),
        notes: input.notes,
        receipt,
        createdByUserId: context.userId,
        editedByUserId: context.userId,
        editedAt: now,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
      },
      session,
    );
  });
  logger.info('expense.created', { weddingId: context.weddingId.toHexString() });
  return (await toExpenses(context.weddingId, [doc]))[0]!;
}

/** PATCH /api/weddings/{weddingId}/expenses/{expenseId} (api-spec §13.3). */
export async function updateExpenseDetails(
  token: string | undefined,
  weddingId: ObjectId,
  expenseId: ObjectId,
  input: UpdateExpenseInput,
  now = new Date(),
): Promise<Expense> {
  const context = await resolveWeddingContext(token, weddingId);
  const receipt =
    input.receipt === undefined
      ? undefined
      : await resolveReceipt(context.weddingId, input.receipt);
  const { doc, replaced } = await writeExpenses(
    token,
    weddingId,
    async ({ customCategories, session }) => {
      const current = await findExpense(context.weddingId, expenseId, session);
      if (!current) throw new AppError('NOT_FOUND');
      const set: Partial<ExpenseDocument> = {};
      if (input.amountPaise !== undefined) set.amountPaise = input.amountPaise;
      if (input.date !== undefined) set.date = input.date;
      if (input.category !== undefined) {
        set.category = resolveCategory(input.category, customCategories);
      }
      if (input.description !== undefined) set.description = input.description;
      if (input.notes !== undefined) set.notes = input.notes;
      if (input.eventId !== undefined) {
        set.eventId = await resolveEvent(context.weddingId, input.eventId, session);
      }
      if (input.vendorId !== undefined) {
        Object.assign(set, await resolveVendor(context.weddingId, input.vendorId, session));
      }
      if (input.paidBy !== undefined) {
        set.paidBy = await resolvePaidBy(context.weddingId, input.paidBy, session);
      }
      if (receipt !== undefined) set.receipt = receipt;
      const updated = await updateExpense(
        context.weddingId,
        expenseId,
        { $set: { ...set, editedByUserId: context.userId, editedAt: now, updatedAt: now } },
        session,
      );
      if (!updated) throw new AppError('NOT_FOUND');
      // The old receipt goes once it's been replaced or removed.
      const old = current.receipt?.key;
      return { doc: updated, replaced: old && old !== updated.receipt?.key ? old : null };
    },
  );
  if (replaced) await removeFile(replaced);
  return (await toExpenses(context.weddingId, [doc]))[0]!;
}

/** DELETE /api/weddings/{weddingId}/expenses/{expenseId} (api-spec §13.4): its receipt goes too. */
export async function deleteExpense(
  token: string | undefined,
  weddingId: ObjectId,
  expenseId: ObjectId,
): Promise<void> {
  const deleted = await writeExpenses(token, weddingId, async ({ context, session }) => {
    const doc = await deleteExpenseDoc(context.weddingId, expenseId, session);
    if (!doc) throw new AppError('NOT_FOUND');
    return doc;
  });
  if (deleted.receipt) await removeFile(deleted.receipt.key);
}

/** GET .../expenses/{expenseId}/receipt (api-spec §13.8): a short-lived link to the file. */
export async function expenseReceiptUrl(
  token: string | undefined,
  weddingId: ObjectId,
  expenseId: ObjectId,
): Promise<string> {
  const context = await resolveWeddingContext(token, weddingId);
  const doc = await findExpense(context.weddingId, expenseId);
  if (!doc?.receipt) throw new AppError('NOT_FOUND');
  return fileViewUrl(doc.receipt.key);
}

/** GET /api/weddings/{weddingId}/expenses/summary (api-spec §13.5). */
export async function getExpenseSummary(
  token: string | undefined,
  weddingId: ObjectId,
  query: SummaryQuery,
): Promise<ExpenseSummary> {
  const context = await resolveWeddingContext(token, weddingId);
  const result = await summarizeExpenses(context.weddingId, filterOf(query));
  const [events, names] = await Promise.all([
    listWeddingEvents(context.weddingId),
    vendorNames(
      context.weddingId,
      result.byVendor.map((v) => v._id),
    ),
  ]);
  const eventName = new Map(events.map((e) => [e.id, e.name]));
  return {
    totalAmountPaise: result.total[0]?.amountPaise ?? 0,
    count: result.total[0]?.count ?? 0,
    byCategory: result.byCategory.map((c) => ({ category: c._id, amountPaise: c.amountPaise })),
    byEvent: result.byEvent.map((e) => {
      const id = e._id?.toHexString() ?? null;
      return {
        eventId: id,
        name: id ? (eventName.get(id) ?? 'Event') : 'General',
        amountPaise: e.amountPaise,
      };
    }),
    byVendor: result.byVendor.map((v) => {
      const id = v._id.toHexString();
      return names.has(id)
        ? { vendorId: id, name: names.get(id)!, amountPaise: v.amountPaise }
        : { vendorId: null, name: v.vendorNameSnapshot ?? 'Vendor', amountPaise: v.amountPaise };
    }),
    byPaidBy: result.byPaidBy.map((p) => ({ name: p._id, amountPaise: p.amountPaise })),
  };
}

/** GET /api/weddings/{weddingId}/expenses/export (api-spec §13.6): amounts in rupees. */
export async function exportExpenses(
  token: string | undefined,
  weddingId: ObjectId,
  query: ListExpensesQuery,
): Promise<string> {
  const context = await resolveWeddingContext(token, weddingId);
  const docs = await findAllExpenses(context.weddingId, filterOf(query), query.sort);
  const [expenses, events] = await Promise.all([
    toExpenses(context.weddingId, docs),
    listWeddingEvents(context.weddingId),
  ]);
  const eventName = new Map(events.map((e) => [e.id, e.name]));
  return makeCsv([
    [
      'Date',
      'Description',
      'Category',
      'Amount (₹)',
      'Event',
      'Vendor',
      'Paid by',
      'Notes',
      'Receipt',
    ],
    ...expenses.map((e) => [
      e.date,
      e.description,
      categoryLabel(e.category),
      (e.amountPaise / 100).toFixed(2),
      e.eventId ? (eventName.get(e.eventId) ?? '') : 'General',
      e.vendor?.name ?? '',
      e.paidBy.name,
      e.notes,
      e.receipt?.fileName ?? '',
    ]),
  ]);
}

/** GET /api/weddings/{weddingId}/expense-categories: the custom categories (any member). */
export async function getExpenseCategories(
  token: string | undefined,
  weddingId: ObjectId,
): Promise<string[]> {
  const context = await resolveWeddingContext(token, weddingId);
  const wedding = await getWeddingRecord(context.weddingId);
  if (!wedding) throw new AppError('NOT_FOUND');
  return wedding.customExpenseCategories ?? [];
}

/**
 * PUT /api/weddings/{weddingId}/expense-categories (api-spec §13.7): Admins only. A category
 * still used by an expense can't be removed (409 CATEGORY_IN_USE with the count).
 */
export async function setExpenseCategories(
  token: string | undefined,
  weddingId: ObjectId,
  input: ExpenseCategoriesInput,
  now = new Date(),
): Promise<string[]> {
  const context = await resolveWeddingContext(token, weddingId);
  requireAdmin(context);
  await requireWritableWedding(context.weddingId);
  return withTransaction(async (session) => {
    const wedding = await lockWeddingTasks(context.weddingId, session);
    const keep = new Set(input.categories.map((c) => c.toLowerCase()));
    for (const removed of (wedding.customExpenseCategories ?? []).filter(
      (c) => !keep.has(c.toLowerCase()),
    )) {
      const used = await countUsingCategory(context.weddingId, removed, session);
      if (used > 0) {
        throw new AppError(
          'CATEGORY_IN_USE',
          `“${removed}” is used by ${used} ${used === 1 ? 'expense' : 'expenses'}. Change ${used === 1 ? 'it' : 'them'} to another category first.`,
          { details: { category: removed, expenses: used } },
        );
      }
    }
    await saveCustomExpenseCategories(context.weddingId, input.categories, session, now);
    return input.categories;
  });
}

/** Cleanup when an event is deleted (database-design §8): its expenses move to "General". */
export function moveEventExpensesToGeneral(
  weddingId: WeddingId,
  eventId: ObjectId,
  session: ClientSession,
): Promise<void> {
  return clearEvent(weddingId, eventId, session);
}
