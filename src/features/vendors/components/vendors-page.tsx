'use client';

import { BookUser, CircleCheck, Clock, FileSignature, Plus, Search, Store } from 'lucide-react';
import { useState } from 'react';
import { FilterSelect } from '@/components/common/filter-select';
import { SoonTag } from '@/components/common/soon-tag';
import { Button } from '@/components/ui/button';
import { useEvents } from '@/features/events/hooks';
import { useExpenseSummary } from '@/features/expenses/hooks';
import { useVendors } from '@/features/vendors/hooks';
import { useWedding } from '@/features/weddings/hooks';
import {
  VENDOR_CATEGORIES,
  VENDOR_CATEGORY_LABELS,
  VENDOR_STATUSES,
  VENDOR_STATUS_LABELS,
} from '@/modules/vendors/vendors.schemas';
import type { Vendor } from '@/modules/vendors/vendors.types';
import { cn } from '@/shared/cn';
import { formatRupees } from '@/shared/money';
import { VendorCard } from './vendor-card';
import { VendorDetails } from './vendor-details';
import { VendorModal, type VendorModalMode } from './vendor-modal';
import { WeddingLoader } from '@/components/common/wedding-loader';

// The Vendors page (Stitch "Vendors"; PRD VEND-1 to VEND-7): the couple's caterers,
// photographers and others as cards, filters, and a details panel. "Find nearby" (Google
// Places) comes later.

const card = 'border-border bg-surface rounded-card shadow-card border';

interface Filters {
  q: string;
  category: string;
  status: string;
  eventId: string;
}

function matches(vendor: Vendor, f: Filters): boolean {
  if (f.category && vendor.category !== f.category) return false;
  if (f.status && vendor.status !== f.status) return false;
  if (f.eventId && !vendor.eventIds.includes(f.eventId)) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    if (![vendor.name, vendor.contactName, vendor.notes].some((t) => t.toLowerCase().includes(q))) {
      return false;
    }
  }
  return true;
}

function EmptyState({ onAdd, readOnly }: { onAdd: () => void; readOnly: boolean }) {
  return (
    <section className={`${card} mx-auto mt-4 max-w-2xl px-6 py-12 text-center sm:px-10`}>
      <span className="bg-primary-tint text-primary mx-auto flex size-16 items-center justify-center rounded-full">
        <Store aria-hidden className="size-7" />
      </span>
      <h2 className="mt-6 text-3xl">Keep your vendors in one place</h2>
      <p className="text-text-muted mx-auto mt-3 max-w-md">
        Caterers, photographers, decorators and more: their contacts, what you&apos;ve agreed, the
        events they&apos;re working, and their quotes and contracts.
      </p>
      {!readOnly && (
        <Button className="mt-7 h-12 gap-2 px-6 text-base" onClick={onAdd}>
          <Plus aria-hidden className="size-4" />
          Add your first vendor
        </Button>
      )}
    </section>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Store }) {
  return (
    <div className={`${card} flex items-center justify-between gap-3 p-3 sm:p-5`}>
      <div className="min-w-0">
        <p className="text-text-muted text-[10px] font-semibold tracking-[0.1em] uppercase sm:text-[11px]">
          {label}
        </p>
        <p className="font-heading mt-1 truncate text-lg sm:text-2xl">{value}</p>
      </div>
      <span className="bg-primary-tint text-primary hidden size-10 shrink-0 items-center justify-center rounded-full sm:flex">
        <Icon aria-hidden className="size-4.5" />
      </span>
    </div>
  );
}

export function VendorsPage({ weddingId }: { weddingId: string }) {
  const { data: wedding } = useWedding(weddingId);
  const { data: vendors, error, isPending, refetch } = useVendors(weddingId);
  const { data: events } = useEvents(weddingId);
  const { data: spending } = useExpenseSummary(weddingId);
  const [filters, setFilters] = useState<Filters>({ q: '', category: '', status: '', eventId: '' });
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [modal, setModal] = useState<VendorModalMode | null>(null);

  if (isPending || !wedding) {
    return <WeddingLoader label="Loading your vendors" size="page" />;
  }
  if (error) {
    return (
      <div role="alert" className="space-y-3 py-20 text-center">
        <h1 className="text-2xl">We couldn&apos;t load your vendors</h1>
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
  const shown = vendors.filter((v) => matches(v, filters));
  const details = vendors.find((v) => v.id === detailsId);
  const booked = vendors.filter((v) => v.status === 'booked').length;
  const shortlisted = vendors.filter((v) => v.status === 'shortlisted').length;
  const contracted = vendors.reduce((sum, v) => sum + (v.contractAmountPaise ?? 0), 0);
  // What's been paid comes from expenses linked to each vendor.
  const paidTo = new Map(
    (spending?.byVendor ?? []).flatMap((v) =>
      v.vendorId ? [[v.vendorId, v.amountPaise] as const] : [],
    ),
  );
  const paidOf = (vendor: Vendor) => paidTo.get(vendor.id) ?? 0;
  const paid = vendors.reduce((sum, v) => sum + paidOf(v), 0);
  // Still to pay on agreed contracts (never below zero for one vendor).
  const pending = vendors.reduce(
    (sum, v) =>
      sum + (v.contractAmountPaise === null ? 0 : Math.max(0, v.contractAmountPaise - paidOf(v))),
    0,
  );
  const filtering = Object.values(filters).some(Boolean);
  const setFilter = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div className="pb-16">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="bg-background-alt inline-flex rounded-full p-1 text-sm">
          <span className="bg-primary text-primary-foreground flex items-center gap-2 rounded-full px-4 py-1.5 font-semibold whitespace-nowrap">
            <BookUser aria-hidden className="size-4" />
            My vendors
            <span className="bg-primary-foreground/15 rounded-full px-1.5 text-xs">
              {vendors.length}
            </span>
          </span>
          <span
            aria-disabled="true"
            className="text-text-muted flex cursor-default items-center gap-2 px-4 py-1.5 whitespace-nowrap"
          >
            <Search aria-hidden className="size-4" />
            Find nearby
            <SoonTag />
          </span>
        </div>
      </div>

      <header className="border-border/70 mb-6 flex flex-col gap-5 border-b pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-4xl font-normal tracking-tight md:text-5xl">Vendors</h1>
          <p className="text-text-muted mt-2">
            Contacts, contracts, the events they&apos;re working, and their quotes.
          </p>
        </div>
        {!readOnly && (
          <Button className="h-10 gap-2 px-5" onClick={() => setModal({ kind: 'new' })}>
            <Plus aria-hidden className="size-4" />
            Add vendor
          </Button>
        )}
      </header>

      {readOnly && (
        <p
          role="status"
          className="bg-pending-bg text-pending-text rounded-input mb-5 px-4 py-3 text-sm"
        >
          This wedding is archived, so its vendors can&apos;t be changed.
        </p>
      )}

      {vendors.length === 0 ? (
        <EmptyState onAdd={() => setModal({ kind: 'new' })} readOnly={readOnly} />
      ) : (
        <>
          <section
            aria-label="Filters"
            className={`${card} mb-6 flex flex-wrap items-center gap-3 p-4`}
          >
            <label className="relative w-full lg:w-72">
              <span className="sr-only">Search vendors</span>
              <Search
                aria-hidden
                className="text-text-muted absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
              />
              <input
                type="search"
                value={filters.q}
                onChange={(e) => setFilter({ q: e.target.value })}
                placeholder="Search by name, contact or notes"
                className="border-border bg-surface h-10 w-full rounded-full border pr-4 pl-10 text-sm"
              />
            </label>
            <FilterSelect
              label="Category"
              value={filters.category}
              onChange={(category) => setFilter({ category })}
              options={VENDOR_CATEGORIES.map((c) => ({
                value: c,
                label: VENDOR_CATEGORY_LABELS[c],
              }))}
            />
            <FilterSelect
              label="Status"
              value={filters.status}
              onChange={(status) => setFilter({ status })}
              options={VENDOR_STATUSES.map((s) => ({ value: s, label: VENDOR_STATUS_LABELS[s] }))}
            />
            {eventList.length > 0 && (
              <FilterSelect
                label="Event"
                value={filters.eventId}
                onChange={(eventId) => setFilter({ eventId })}
                options={eventList.map((e) => ({ value: e.id, label: e.name }))}
              />
            )}
            <p className="text-text-muted ml-auto flex flex-wrap items-center gap-2 text-sm">
              <span>
                <strong className="text-text">{vendors.length}</strong> saved
              </span>
              <span className="bg-pending-bg text-pending-text rounded-full px-2 py-0.5 text-xs font-medium">
                {booked} booked
              </span>
              <span className="bg-background rounded-full px-2 py-0.5 text-xs font-medium">
                {shortlisted} shortlisted
              </span>
            </p>
          </section>

          <div className={cn('grid gap-6', details && 'lg:grid-cols-[minmax(0,1fr)_380px]')}>
            <div>
              <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-4">
                <Stat
                  label="Total contracted"
                  value={formatRupees(contracted)}
                  icon={FileSignature}
                />
                <Stat label="Paid" value={formatRupees(paid)} icon={CircleCheck} />
                <Stat label="Still to pay" value={formatRupees(pending)} icon={Clock} />
              </div>
              {shown.length === 0 ? (
                <div className={`${card} p-10 text-center`}>
                  <p className="text-text-muted">No vendors match these filters.</p>
                  {filtering && (
                    <button
                      type="button"
                      onClick={() => setFilters({ q: '', category: '', status: '', eventId: '' })}
                      className="text-primary mt-2 font-medium hover:underline"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <ul className="grid gap-5 sm:grid-cols-2">
                  {shown.map((vendor) => (
                    <VendorCard
                      key={vendor.id}
                      vendor={vendor}
                      events={eventList}
                      selected={vendor.id === detailsId}
                      paidPaise={paidOf(vendor)}
                      onOpen={() => setDetailsId(vendor.id === detailsId ? null : vendor.id)}
                    />
                  ))}
                </ul>
              )}
            </div>
            {details && (
              <VendorDetails
                key={details.id}
                weddingId={weddingId}
                vendor={details}
                events={eventList}
                readOnly={readOnly}
                timeZone={wedding.timezone}
                paidPaise={paidOf(details)}
                onEdit={() => setModal({ kind: 'edit', vendor: details })}
                onClose={() => setDetailsId(null)}
              />
            )}
          </div>
        </>
      )}

      {modal && (
        <VendorModal
          weddingId={weddingId}
          mode={modal}
          events={eventList}
          onClose={() => setModal(null)}
          onSaved={(vendor) => {
            setModal(null);
            setDetailsId(vendor.id);
          }}
        />
      )}
    </div>
  );
}
