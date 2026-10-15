'use client';

import { ChevronLeft, ChevronRight, Download, Paperclip, Plus, Search, Wallet } from 'lucide-react';
import { useState } from 'react';
import { FilterSelect } from '@/components/common/filter-select';
import { Button } from '@/components/ui/button';
import { useEvents } from '@/features/events/hooks';
import { exportUrl } from '@/features/expenses/api';
import { useExpenseCategories, useExpenses, useExpenseSummary } from '@/features/expenses/hooks';
import { useTeam } from '@/features/team/hooks';
import { useVendors } from '@/features/vendors/hooks';
import { useMe, useWedding } from '@/features/weddings/hooks';
import { categoryLabel, PRESET_CATEGORIES } from '@/modules/expenses/expenses.schemas';
import type { Expense } from '@/modules/expenses/expenses.types';
import { cn } from '@/shared/cn';
import { formatDate, todayIn } from '@/shared/dates';
import { formatRupees } from '@/shared/money';
import { ExpensePanel, type ExpensePanelMode } from './expense-panel';

// The Expenses page (Stitch "Expenses"; PRD EXP-1 to EXP-8): what's been spent, by category,
// event and who paid; the ledger with filters; and a panel to add or edit an expense.

const PAGE_SIZE = 50;
const card = 'border-border bg-surface rounded-card shadow-card border';

interface Filters {
  q: string;
  category: string;
  eventId: string;
  vendorId: string;
  paidBy: string;
  from: string;
  to: string;
}

const NO_FILTERS: Filters = {
  q: '',
  category: '',
  eventId: '',
  vendorId: '',
  paidBy: '',
  from: '',
  to: '',
};

/** One "By …" card: the top rows with a bar for each share of the total. */
function BreakdownCard({
  title,
  subtitle,
  rows,
  total,
}: {
  title: string;
  subtitle: string;
  rows: { key: string; label: string; amountPaise: number }[];
  total: number;
}) {
  return (
    <section className={`${card} p-5`}>
      <h2 className="text-lg font-normal">{title}</h2>
      <p className="text-text-muted text-xs">{subtitle}</p>
      {rows.length === 0 ? (
        <p className="text-text-muted mt-5 text-sm">Nothing yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.slice(0, 5).map((row) => {
            const share = total > 0 ? row.amountPaise / total : 0;
            return (
              <li key={row.key}>
                <p className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{row.label}</span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatRupees(row.amountPaise)}
                    <span className="text-text-muted ml-1 text-xs font-normal">
                      ({Math.round(share * 100)}%)
                    </span>
                  </span>
                </p>
                <div
                  aria-hidden
                  className="bg-background mt-1.5 h-1.5 overflow-hidden rounded-full"
                >
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{ width: `${share * 100}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const initial = (name: string) => name.trim().charAt(0).toUpperCase();

function Payer({ expense }: { expense: Expense }) {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className="bg-primary-tint text-primary flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
      >
        {initial(expense.paidBy.name)}
      </span>
      <span className="truncate">{expense.paidBy.name}</span>
    </span>
  );
}

function EmptyState({ onAdd, readOnly }: { onAdd: () => void; readOnly: boolean }) {
  return (
    <section className={`${card} mx-auto mt-4 max-w-2xl px-6 py-12 text-center sm:px-10`}>
      <span className="bg-primary-tint text-primary mx-auto flex size-16 items-center justify-center rounded-full">
        <Wallet aria-hidden className="size-7" />
      </span>
      <h2 className="mt-6 text-3xl">Track what the wedding costs</h2>
      <p className="text-text-muted mx-auto mt-3 max-w-md">
        Log each payment with its category, event, vendor and who paid, and keep the receipt. Totals
        add up as you go.
      </p>
      {!readOnly && (
        <Button className="mt-7 h-12 gap-2 px-6 text-base" onClick={onAdd}>
          <Plus aria-hidden className="size-4" />
          Add your first expense
        </Button>
      )}
    </section>
  );
}

export function ExpensesPage({ weddingId }: { weddingId: string }) {
  const { data: wedding } = useWedding(weddingId);
  const { data: me } = useMe();
  const { data: events } = useEvents(weddingId);
  const { data: vendors } = useVendors(weddingId);
  const { data: team } = useTeam(weddingId);
  const { data: custom } = useExpenseCategories(weddingId);
  const { data: summary } = useExpenseSummary(weddingId);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [offset, setOffset] = useState(0);
  const [panel, setPanel] = useState<ExpensePanelMode | null>(null);

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value);
  }
  const exportQuery = new URLSearchParams(query);
  query.set('limit', String(PAGE_SIZE));
  if (offset) query.set('cursor', String(offset));
  const { data: page, error, isPending, refetch } = useExpenses(weddingId, query);

  if (!wedding || !summary || (isPending && !page)) {
    return (
      <p role="status" className="text-text-muted py-20 text-center">
        Loading your expenses…
      </p>
    );
  }
  if (error && !page) {
    return (
      <div role="alert" className="space-y-3 py-20 text-center">
        <h1 className="text-2xl">We couldn&apos;t load your expenses</h1>
        <button
          type="button"
          onClick={() => void refetch()}
          className="text-primary font-medium hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const readOnly = wedding.status === 'archived';
  const eventList = events ?? [];
  const vendorList = vendors ?? [];
  const customCategories = custom ?? [];
  const eventName = (id: string | null) =>
    id ? (eventList.find((e) => e.id === id)?.name ?? 'Event') : 'General';
  const filtering = Object.values(filters).some(Boolean);
  const setFilter = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setOffset(0);
  };
  const expenses = page?.expenses ?? [];
  const total = page?.total ?? 0;
  const editingId = panel?.kind === 'edit' ? panel.expense.id : null;

  return (
    <div className="pb-16">
      <header className="border-border/70 mb-8 flex flex-col gap-5 border-b pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-pending-text mb-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase">
            Finance · Wedding ledger
          </p>
          <h1 className="flex flex-wrap items-baseline gap-x-3 text-4xl font-normal tracking-tight md:text-5xl">
            Expenses
            <span className="font-heading text-2xl md:text-3xl">
              {formatRupees(summary.totalAmountPaise)}
              <span className="text-text-muted ml-1.5 font-sans text-base">spent</span>
            </span>
          </h1>
          <p className="text-text-muted mt-2">
            {summary.count} {summary.count === 1 ? 'payment' : 'payments'} logged
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {summary.count > 0 && (
            <a
              href={exportUrl(weddingId, exportQuery)}
              download
              className="border-border bg-surface hover:border-primary/40 flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold"
            >
              <Download aria-hidden className="size-4" />
              Export CSV
            </a>
          )}
          {!readOnly && (
            <Button className="h-10 gap-2 px-5" onClick={() => setPanel({ kind: 'new' })}>
              <Plus aria-hidden className="size-4" />
              Add expense
            </Button>
          )}
        </div>
      </header>

      {readOnly && (
        <p
          role="status"
          className="bg-pending-bg text-pending-text rounded-input mb-5 px-4 py-3 text-sm"
        >
          This wedding is archived, so its expenses can&apos;t be changed.
        </p>
      )}

      {summary.count === 0 && !panel ? (
        <EmptyState onAdd={() => setPanel({ kind: 'new' })} readOnly={readOnly} />
      ) : (
        <>
          {summary.count > 0 && (
            <div className="mb-6 grid gap-5 lg:grid-cols-3">
              <BreakdownCard
                title="By category"
                subtitle={`Total tracked ${formatRupees(summary.totalAmountPaise)}`}
                total={summary.totalAmountPaise}
                rows={summary.byCategory.map((c) => ({
                  key: c.category,
                  label: categoryLabel(c.category),
                  amountPaise: c.amountPaise,
                }))}
              />
              <BreakdownCard
                title="By event"
                subtitle={`Across ${summary.byEvent.length} ${summary.byEvent.length === 1 ? 'event' : 'events'}`}
                total={summary.totalAmountPaise}
                rows={summary.byEvent.map((e) => ({
                  key: e.eventId ?? 'general',
                  label: e.name,
                  amountPaise: e.amountPaise,
                }))}
              />
              <BreakdownCard
                title="By who paid"
                subtitle="Family contributions"
                total={summary.totalAmountPaise}
                rows={summary.byPaidBy.map((p) => ({
                  key: p.name,
                  label: p.name,
                  amountPaise: p.amountPaise,
                }))}
              />
            </div>
          )}

          <section
            aria-label="Filters"
            className={`${card} mb-6 flex flex-wrap items-center gap-3 p-4`}
          >
            <label className="relative w-full lg:w-72">
              <span className="sr-only">Search expenses</span>
              <Search
                aria-hidden
                className="text-text-muted absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
              />
              <input
                type="search"
                value={filters.q}
                onChange={(e) => setFilter({ q: e.target.value })}
                placeholder="Search description or notes"
                className="border-border bg-surface h-10 w-full rounded-full border pr-4 pl-10 text-sm"
              />
            </label>
            <FilterSelect
              label="Category"
              value={filters.category}
              onChange={(category) => setFilter({ category })}
              options={[
                ...PRESET_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) })),
                ...customCategories.map((c) => ({ value: c, label: c })),
              ]}
            />
            <FilterSelect
              label="Event"
              value={filters.eventId}
              onChange={(eventId) => setFilter({ eventId })}
              options={[
                { value: 'general', label: 'General (no event)' },
                ...eventList.map((e) => ({ value: e.id, label: e.name })),
              ]}
            />
            {vendorList.length > 0 && (
              <FilterSelect
                label="Vendor"
                value={filters.vendorId}
                onChange={(vendorId) => setFilter({ vendorId })}
                options={vendorList.map((v) => ({ value: v.id, label: v.name }))}
              />
            )}
            <FilterSelect
              label="Paid by"
              value={filters.paidBy}
              onChange={(paidBy) => setFilter({ paidBy })}
              options={summary.byPaidBy.map((p) => ({ value: p.name, label: p.name }))}
            />
            <span className="flex items-center gap-1.5 text-sm">
              <label className="sr-only" htmlFor="expense-from">
                From
              </label>
              <input
                id="expense-from"
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(e) => setFilter({ from: e.target.value })}
                className="border-border bg-surface h-10 rounded-full border px-3 text-sm"
              />
              <span className="text-text-muted">to</span>
              <label className="sr-only" htmlFor="expense-to">
                To
              </label>
              <input
                id="expense-to"
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(e) => setFilter({ to: e.target.value })}
                className="border-border bg-surface h-10 rounded-full border px-3 text-sm"
              />
            </span>
            <p className="bg-background text-text-muted rounded-full px-3 py-1 text-xs">
              {total} {total === 1 ? 'payment' : 'payments'}
              {filtering && page ? ` · ${formatRupees(page.totalAmountPaise)}` : ''}
            </p>
          </section>

          <div className={cn('grid gap-6', panel && 'lg:grid-cols-[minmax(0,1fr)_400px]')}>
            <div className={`${card} self-start overflow-hidden`}>
              {expenses.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-text-muted">No expenses match these filters.</p>
                  {filtering && (
                    <button
                      type="button"
                      onClick={() => setFilter(NO_FILTERS)}
                      className="text-primary mt-2 font-medium hover:underline"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <table className="hidden w-full text-sm md:table">
                    <thead className="bg-background text-text-muted text-left text-xs">
                      <tr>
                        {['Date', 'Description', 'Category', 'Event', 'Vendor', 'Paid by'].map(
                          (h) => (
                            <th key={h} scope="col" className="px-4 py-3 font-semibold">
                              {h}
                            </th>
                          ),
                        )}
                        <th scope="col" className="px-4 py-3 text-right font-semibold">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-border/60 divide-y">
                      {expenses.map((expense) => (
                        <tr
                          key={expense.id}
                          className={cn(
                            'hover:bg-background/60 cursor-pointer',
                            expense.id === editingId && 'bg-primary-tint/40',
                          )}
                          onClick={() => setPanel({ kind: 'edit', expense })}
                        >
                          <td className="text-text-muted px-4 py-3.5 whitespace-nowrap">
                            {formatDate(expense.date)}
                          </td>
                          <td className="px-4 py-3.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPanel({ kind: 'edit', expense });
                              }}
                              className="text-left font-medium hover:underline"
                            >
                              {expense.description}
                            </button>
                            {expense.receipt && (
                              <Paperclip
                                aria-label="Has a receipt"
                                className="text-text-muted ml-1.5 inline size-3.5"
                              />
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="bg-primary-tint text-primary rounded-full px-2.5 py-0.5 text-xs whitespace-nowrap">
                              {categoryLabel(expense.category)}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">{eventName(expense.eventId)}</td>
                          <td className="text-text-muted px-4 py-3.5">
                            {expense.vendor?.name ?? '—'}
                          </td>
                          <td className="px-4 py-3.5">
                            <Payer expense={expense} />
                          </td>
                          <td className="px-4 py-3.5 text-right font-semibold whitespace-nowrap tabular-nums">
                            {formatRupees(expense.amountPaise)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <ul className="divide-border/60 divide-y md:hidden">
                    {expenses.map((expense) => (
                      <li key={expense.id}>
                        <button
                          type="button"
                          onClick={() => setPanel({ kind: 'edit', expense })}
                          className="w-full p-4 text-left"
                        >
                          <p className="flex items-baseline justify-between gap-3">
                            <span className="font-medium">{expense.description}</span>
                            <span className="shrink-0 font-semibold tabular-nums">
                              {formatRupees(expense.amountPaise)}
                            </span>
                          </p>
                          <p className="text-text-muted mt-1 text-xs">
                            {formatDate(expense.date)} · {categoryLabel(expense.category)} ·{' '}
                            {eventName(expense.eventId)}
                            {expense.vendor && ` · ${expense.vendor.name}`}
                          </p>
                          <p className="mt-2 text-xs">
                            <Payer expense={expense} />
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {total > PAGE_SIZE && (
                <div className="border-border/60 flex items-center justify-between border-t px-4 py-3 text-sm">
                  <span className="text-text-muted">
                    Showing {offset + 1}–{Math.min(offset + expenses.length, total)} of {total}
                  </span>
                  <span className="flex gap-1">
                    <button
                      type="button"
                      aria-label="Previous page"
                      disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                      className="hover:bg-background rounded-full p-2 disabled:opacity-40"
                    >
                      <ChevronLeft aria-hidden className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Next page"
                      disabled={!page?.nextCursor}
                      onClick={() => setOffset(offset + PAGE_SIZE)}
                      className="hover:bg-background rounded-full p-2 disabled:opacity-40"
                    >
                      <ChevronRight aria-hidden className="size-4" />
                    </button>
                  </span>
                </div>
              )}
            </div>

            {panel && me && (
              <ExpensePanel
                key={panel.kind === 'edit' ? panel.expense.id : 'new'}
                weddingId={weddingId}
                mode={panel}
                today={todayIn(wedding.timezone)}
                myUserId={me.user.id}
                members={team?.members ?? []}
                events={eventList}
                vendors={vendorList}
                customCategories={customCategories}
                readOnly={readOnly}
                onClose={() => setPanel(null)}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
