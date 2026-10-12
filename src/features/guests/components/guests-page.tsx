'use client';

import {
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Search,
  SearchX,
  Send,
  Tag,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { SoonTag } from '@/components/common/soon-tag';
import { Button } from '@/components/ui/button';
import { useEvents } from '@/features/events/hooks';
import { useHouseholds, useHouseholdSummary } from '@/features/guests/hooks';
import { useWedding } from '@/features/weddings/hooks';
import type { Household, InviteStatus } from '@/modules/households/households.types';
import { cn } from '@/shared/cn';
import {
  DeleteFamilyDialog,
  BulkDeleteDialog,
  BulkEventsDialog,
  BulkTagDialog,
} from './guest-dialogs';
import { FamilyDetails, SideChip } from './family-details';
import { FamilyModal, type FamilyModalMode } from './family-modal';

// The Guests page (Stitch "Guests (Interactive)"; PRD GUEST-1, 2, 4, 5, 6, 7): families, the
// events they're invited to, totals per event, and bulk actions. A Manager limited to one side
// only ever sees that side (the API enforces it; the page explains it).

const PAGE_SIZE = 50;
const card = 'border-border bg-surface rounded-card shadow-card border';
const select =
  'border-border bg-surface hover:border-primary/40 h-10 max-w-52 appearance-none truncate rounded-full border pr-9 pl-4 text-sm';

const INVITE_LABEL: Record<InviteStatus, string> = {
  not_sent: 'Not sent',
  queued: 'Sending',
  sent: 'Sent',
  sent_manually: 'Sent manually',
  failed: 'Failed',
};
const INVITE_STYLE: Record<InviteStatus, string> = {
  not_sent: 'text-text-muted',
  queued: 'bg-pending-bg text-pending-text',
  sent: 'bg-primary-tint text-primary',
  sent_manually: 'bg-background-alt text-text',
  failed: 'bg-danger-bg text-danger-text',
};

interface Filters {
  q: string;
  side: string;
  tag: string;
  eventId: string;
  inviteStatus: string;
  responseStatus: string;
}
const NO_FILTERS: Filters = {
  q: '',
  side: '',
  tag: '',
  eventId: '',
  inviteStatus: '',
  responseStatus: '',
};

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <span className="relative shrink-0">
      <select
        aria-label={`Filter by ${label.toLowerCase()}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={select}
      >
        <option value="">{label}: All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="text-text-muted pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2"
      />
    </span>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void; weddingId: string }) {
  return (
    <section className={cn(card, 'mx-auto mt-4 max-w-2xl px-6 py-12 text-center sm:px-10')}>
      <span className="bg-primary-tint text-primary mx-auto flex size-16 items-center justify-center rounded-full">
        <Users aria-hidden className="size-7" />
      </span>
      <h2 className="mt-6 text-3xl">Add your guest families</h2>
      <p className="text-text-muted mx-auto mt-3 max-w-md">
        Add each family once, choose which events they&apos;re invited to, and send their invitation
        from here.
      </p>
      <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button className="h-12 gap-2 px-6 text-base" onClick={onAdd}>
          <UserPlus aria-hidden className="size-4" />
          Add family
        </Button>
        <span
          aria-disabled="true"
          className="border-border text-text-muted flex h-12 cursor-default items-center gap-2 rounded-full border px-5 text-sm opacity-70"
        >
          <Upload aria-hidden className="size-4" />
          Import from CSV or Excel
          <SoonTag />
        </span>
      </div>
    </section>
  );
}

export function GuestsPage({ weddingId }: { weddingId: string }) {
  const { data: wedding } = useWedding(weddingId);
  const { data: events } = useEvents(weddingId);
  const { data: summary } = useHouseholdSummary(weddingId);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Map<string, Household>>(new Map());
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [modal, setModal] = useState<FamilyModalMode | null>(null);
  const [deleting, setDeleting] = useState<Household | null>(null);
  const [bulk, setBulk] = useState<'events' | 'tags' | 'delete' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Search as you type, a moment after the last key.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) => (f.q === search.trim() ? f : { ...f, q: search.trim() }));
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useMemo(() => {
    const q = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (filters.q) q.set('q', filters.q);
    if (filters.side) q.set('side', filters.side);
    if (filters.tag) q.set('tags', filters.tag);
    if (filters.eventId) q.set('eventId', filters.eventId);
    if (filters.inviteStatus) q.set('inviteStatus', filters.inviteStatus);
    if (filters.responseStatus) q.set('responseStatus', filters.responseStatus);
    if (offset > 0) q.set('cursor', String(offset));
    return q;
  }, [filters, offset]);
  const { data: page, error, isPending, refetch } = useHouseholds(weddingId, query);

  if (!wedding || !summary) {
    return (
      <p role="status" className="text-text-muted py-20 text-center">
        Loading your guests…
      </p>
    );
  }

  const eventList = events ?? [];
  const scope = summary.sideScope;
  const showSides = wedding.sidesEnabled;
  const filtered = Object.entries(filters).some(([, v]) => v !== '');
  const households = page?.households ?? [];
  const total = page?.total ?? 0;
  const details =
    households.find((h) => h.id === detailsId) ?? (detailsId ? selected.get(detailsId) : undefined);
  const selectedIds = [...selected.keys()];
  const allOnPage = households.length > 0 && households.every((h) => selected.has(h.id));
  const eventName = (id: string) => eventList.find((e) => e.id === id)?.name;

  function setFilter(patch: Partial<Filters>) {
    setFilters((f) => ({ ...f, ...patch }));
    setOffset(0);
    setSelected(new Map());
  }

  function toggle(h: Household, on: boolean) {
    setSelected((current) => {
      const next = new Map(current);
      if (on) next.set(h.id, h);
      else next.delete(h.id);
      return next;
    });
  }

  function togglePage(on: boolean) {
    setSelected((current) => {
      const next = new Map(current);
      for (const h of households) {
        if (on) next.set(h.id, h);
        else next.delete(h.id);
      }
      return next;
    });
  }

  const bulkDone = (verb: string) => (updated: number) => {
    setBulk(null);
    setSelected(new Map());
    setNotice(`${updated} ${updated === 1 ? 'family' : 'families'} ${verb}.`);
  };

  const people = (n: number) => `${n.toLocaleString('en-IN')} ${n === 1 ? 'person' : 'people'}`;
  const families = (n: number) => `${n.toLocaleString('en-IN')} ${n === 1 ? 'family' : 'families'}`;
  const sideName = scope === 'bride' ? 'Bride side' : 'Groom side';

  return (
    <div className="pb-16">
      <header className="mb-6 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-pending-text mb-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase">
            Guests
          </p>
          <h1 className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-4xl font-normal tracking-tight md:text-5xl">
            Guests
            <span className="text-text-muted font-sans text-base tracking-normal">
              {scope ? `${sideName} · ` : ''}
              {families(summary.households)} · {people(summary.people)}
            </span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            aria-disabled="true"
            className="border-border text-text-muted flex h-10 cursor-default items-center gap-2 rounded-full border px-4 text-sm opacity-70"
          >
            <Download aria-hidden className="size-4" /> Export <SoonTag />
          </span>
          <span
            aria-disabled="true"
            className="border-border text-text-muted flex h-10 cursor-default items-center gap-2 rounded-full border px-4 text-sm opacity-70"
          >
            <Upload aria-hidden className="size-4" /> Import CSV <SoonTag />
          </span>
          <Button className="h-10 gap-2 px-5" onClick={() => setModal({ kind: 'new' })}>
            <UserPlus aria-hidden className="size-4" />
            Add family
          </Button>
        </div>
      </header>

      {scope && (
        <p className="bg-primary-tint text-primary rounded-input mb-5 flex items-center gap-2 px-4 py-3 text-sm">
          <Info aria-hidden className="size-4 shrink-0" />
          You&apos;re seeing {scope} side guests only. Ask {wedding.brideName} or{' '}
          {wedding.groomName} to change your access.
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="bg-success-bg text-success-text rounded-input mb-5 flex items-center justify-between gap-3 px-4 py-3 text-sm"
        >
          {notice}
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="font-medium hover:underline"
          >
            Dismiss
          </button>
        </p>
      )}

      {summary.households === 0 && !filtered ? (
        <>
          <EmptyState weddingId={weddingId} onAdd={() => setModal({ kind: 'new' })} />
          {eventList.length === 0 && (
            <p className="text-text-muted mt-6 text-center text-sm">
              Tip: add your events first so you can choose them for each family.{' '}
              <Link
                href={`/app/${weddingId}/events`}
                className="text-primary font-medium hover:underline"
              >
                Go to events
              </Link>
            </p>
          )}
        </>
      ) : (
        <>
          {/* Totals per event (GUEST-5): tap one to filter by it. */}
          <div className="-mx-1 mb-6 flex gap-3 overflow-x-auto px-1 pb-1">
            <button
              type="button"
              aria-pressed={!filters.eventId}
              onClick={() => setFilter({ eventId: '' })}
              className={cn(
                'rounded-card flex shrink-0 items-center gap-3 border px-5 py-3 text-left transition-colors',
                !filters.eventId
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-border bg-surface hover:border-primary/40',
              )}
            >
              <Users aria-hidden className="size-5" />
              <span>
                <span className="block text-[11px] font-semibold tracking-wider uppercase opacity-80">
                  All guests
                </span>
                <span className="text-sm font-semibold">
                  {families(summary.households)} · {people(summary.people)}
                </span>
              </span>
            </button>
            {eventList.map((event) => {
              const t = summary.events.find((e) => e.eventId === event.id);
              const on = filters.eventId === event.id;
              return (
                <button
                  key={event.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter({ eventId: on ? '' : event.id })}
                  className={cn(
                    'rounded-card shrink-0 border px-5 py-3 text-left transition-colors',
                    on
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-border bg-surface hover:border-primary/40',
                  )}
                >
                  <span className="block text-xs opacity-80">{event.name}</span>
                  <span className="text-sm font-semibold whitespace-nowrap">
                    {families(t?.households ?? 0)} · {(t?.people ?? 0).toLocaleString('en-IN')}{' '}
                    invited
                  </span>
                </button>
              );
            })}
          </div>

          {selected.size > 0 && (
            <div className="bg-primary-tint/70 border-primary/15 rounded-card mb-4 flex flex-wrap items-center gap-3 border px-4 py-3">
              <p className="text-sm font-semibold">{families(selected.size)} selected</p>
              <button
                type="button"
                onClick={() => setSelected(new Map())}
                className="text-sm underline underline-offset-4"
              >
                Deselect all
              </button>
              <div className="flex flex-wrap gap-2 sm:ml-auto">
                <Button
                  variant="outline"
                  className="bg-surface h-9 gap-2 px-4"
                  onClick={() => setBulk('events')}
                >
                  <CalendarPlus aria-hidden className="size-4" /> Invite to events
                </Button>
                <Button
                  variant="outline"
                  className="bg-surface h-9 gap-2 px-4"
                  onClick={() => setBulk('tags')}
                >
                  <Tag aria-hidden className="size-4" /> Add tag
                </Button>
                <span
                  aria-disabled="true"
                  className="bg-primary text-primary-foreground flex h-9 cursor-default items-center gap-2 rounded-full px-4 text-sm opacity-60"
                >
                  <Send aria-hidden className="size-4" /> Send invitation
                  <SoonTag className="bg-primary-foreground/15 text-primary-foreground" />
                </span>
                <Button
                  variant="destructive"
                  className="h-9 gap-2 px-4"
                  onClick={() => setBulk('delete')}
                >
                  <Trash2 aria-hidden className="size-4" /> Delete
                </Button>
              </div>
            </div>
          )}

          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="border-border bg-surface flex h-10 items-center gap-2 rounded-full border px-4 lg:w-80 lg:shrink-0">
              <Search aria-hidden className="text-text-muted size-4" />
              <span className="sr-only">Search families</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search family name, guest, or phone…"
                className="placeholder:text-text-muted w-full bg-transparent text-sm outline-none"
              />
            </label>
            <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 lg:pb-0">
              {showSides && !scope && (
                <FilterSelect
                  label="Side"
                  value={filters.side}
                  onChange={(side) => setFilter({ side })}
                  options={[
                    { value: 'bride', label: 'Bride side' },
                    { value: 'groom', label: 'Groom side' },
                  ]}
                />
              )}
              <FilterSelect
                label="Tags"
                value={filters.tag}
                onChange={(tag) => setFilter({ tag })}
                options={wedding.guestTags.map((t) => ({ value: t, label: t }))}
              />
              <FilterSelect
                label="Event"
                value={filters.eventId}
                onChange={(eventId) => setFilter({ eventId })}
                options={eventList.map((e) => ({ value: e.id, label: e.name }))}
              />
              <FilterSelect
                label="Invite"
                value={filters.inviteStatus}
                onChange={(inviteStatus) => setFilter({ inviteStatus })}
                options={(Object.keys(INVITE_LABEL) as InviteStatus[]).map((s) => ({
                  value: s,
                  label: INVITE_LABEL[s],
                }))}
              />
              <FilterSelect
                label="Reply"
                value={filters.responseStatus}
                onChange={(responseStatus) => setFilter({ responseStatus })}
                options={[
                  { value: 'none', label: 'Waiting' },
                  { value: 'partial', label: 'Partly replied' },
                  { value: 'complete', label: 'Replied' },
                ]}
              />
            </div>
          </div>

          <div className={cn('grid gap-6', details && 'lg:grid-cols-[minmax(0,1fr)_380px]')}>
            <div className={cn(card, 'min-w-0 self-start overflow-hidden')}>
              {error ? (
                <div role="alert" className="space-y-3 py-16 text-center">
                  <p className="font-medium">We couldn&apos;t load your guests</p>
                  <button
                    type="button"
                    onClick={() => void refetch()}
                    className="text-primary text-sm font-medium hover:underline"
                  >
                    Try again
                  </button>
                </div>
              ) : isPending ? (
                <p role="status" className="text-text-muted py-16 text-center text-sm">
                  Loading families…
                </p>
              ) : households.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <SearchX aria-hidden className="text-text-muted size-7" />
                  <p className="font-medium">No families match these filters</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setFilter(NO_FILTERS);
                    }}
                    className="text-primary text-sm font-medium hover:underline"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <>
                  <table className="hidden w-full text-left text-sm md:table">
                    <thead className="bg-background text-text-muted text-[11px] font-semibold tracking-wider uppercase">
                      <tr>
                        <th className="w-12 py-3 pl-5">
                          <input
                            type="checkbox"
                            aria-label="Select all families on this page"
                            checked={allOnPage}
                            onChange={(e) => togglePage(e.target.checked)}
                            className="accent-primary size-4.5"
                          />
                        </th>
                        <th className="py-3 pr-4">Family</th>
                        {showSides && <th className="py-3 pr-4">Side</th>}
                        <th className="py-3 pr-4">Tags</th>
                        <th className="py-3 pr-4">Invited to</th>
                        <th className="py-3 pr-5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-border/60 divide-y">
                      {households.map((h) => (
                        <tr
                          key={h.id}
                          onClick={() => setDetailsId(h.id)}
                          className={cn(
                            'hover:bg-background cursor-pointer align-top transition-colors',
                            detailsId === h.id &&
                              'bg-background shadow-[inset_3px_0_0_var(--primary)]',
                          )}
                        >
                          <td className="py-4 pl-5" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={`Select ${h.displayName}`}
                              checked={selected.has(h.id)}
                              onChange={(e) => toggle(h, e.target.checked)}
                              className="accent-primary size-4.5"
                            />
                          </td>
                          <td className="py-4 pr-4">
                            <button type="button" className="text-left font-medium hover:underline">
                              {h.displayName}
                            </button>
                            <p className="text-text-muted mt-0.5 text-xs">
                              {people(h.headcount)}
                              {h.members.length > 0 &&
                                ` · ${h.members.map((m) => m.name.split(' ')[0]).join(', ')}`}
                            </p>
                          </td>
                          {showSides && (
                            <td className="py-4 pr-4">
                              <SideChip side={h.side} />
                            </td>
                          )}
                          <td className="py-4 pr-4">
                            <div className="flex max-w-40 flex-wrap gap-1">
                              {h.tags.map((t) => (
                                <span
                                  key={t}
                                  className="bg-background-alt rounded-full px-2 py-0.5 text-xs"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-4 pr-4">
                            <div className="flex max-w-48 flex-wrap gap-1">
                              {eventList.length > 0 &&
                              h.invitedEvents.length === eventList.length ? (
                                <span className="bg-primary-tint text-primary rounded-sm px-2 py-0.5 text-xs">
                                  All events ({eventList.length})
                                </span>
                              ) : h.invitedEvents.length === 0 ? (
                                <span className="text-text-muted text-xs">None yet</span>
                              ) : (
                                h.invitedEvents.map((e) => (
                                  <span
                                    key={e.eventId}
                                    className="bg-background-alt rounded-sm px-2 py-0.5 text-xs"
                                  >
                                    {eventName(e.eventId)}
                                  </span>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="py-4 pr-5">
                            <span
                              className={cn(
                                'rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
                                INVITE_STYLE[h.inviteStatus],
                              )}
                            >
                              {INVITE_LABEL[h.inviteStatus]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Phones: one card per family. */}
                  <ul className="divide-border/60 divide-y md:hidden">
                    {households.map((h) => (
                      <li key={h.id} className="flex gap-3 p-4">
                        <input
                          type="checkbox"
                          aria-label={`Select ${h.displayName}`}
                          checked={selected.has(h.id)}
                          onChange={(e) => toggle(h, e.target.checked)}
                          className="accent-primary mt-1 size-4.5 shrink-0"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setDetailsId(h.id);
                            // On phones the details sit below the list: bring them into view.
                            requestAnimationFrame(() =>
                              document
                                .querySelector('aside[aria-label$="details"]')
                                ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                            );
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="font-medium">{h.displayName}</p>
                          <p className="text-text-muted mt-0.5 text-xs">
                            {people(h.headcount)}
                            {h.members.length > 0 &&
                              ` · ${h.members.map((m) => m.name.split(' ')[0]).join(', ')}`}
                          </p>
                          <p className="mt-2 flex flex-wrap items-center gap-1.5">
                            <SideChip side={h.side} />
                            {h.tags.map((t) => (
                              <span
                                key={t}
                                className="bg-background-alt rounded-full px-2 py-0.5 text-xs"
                              >
                                {t}
                              </span>
                            ))}
                          </p>
                          <p className="text-text-muted mt-2 text-xs">
                            {h.invitedEvents.length === 0
                              ? 'Not invited to any event yet'
                              : h.invitedEvents.map((e) => eventName(e.eventId)).join(' · ')}
                          </p>
                          <p className="mt-2">
                            <span
                              className={cn(
                                'rounded-full px-2.5 py-0.5 text-xs font-medium',
                                INVITE_STYLE[h.inviteStatus],
                              )}
                            >
                              {INVITE_LABEL[h.inviteStatus]}
                            </span>
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>

                  <div className="border-border/60 bg-background flex items-center justify-between gap-3 border-t px-5 py-3 text-sm">
                    <p className="text-text-muted">
                      Showing {offset + 1}–{offset + households.length} of {families(total)}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="Previous page"
                        disabled={offset === 0}
                        onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                        className="border-border bg-surface flex size-8 items-center justify-center rounded-full border disabled:opacity-40"
                      >
                        <ChevronLeft aria-hidden className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Next page"
                        disabled={!page?.nextCursor}
                        onClick={() => setOffset(offset + PAGE_SIZE)}
                        className="border-border bg-surface flex size-8 items-center justify-center rounded-full border disabled:opacity-40"
                      >
                        <ChevronRight aria-hidden className="size-4" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {details && (
              <FamilyDetails
                household={details}
                events={eventList}
                timeZone={wedding.timezone}
                onEdit={() => setModal({ kind: 'edit', household: details })}
                onClose={() => setDetailsId(null)}
              />
            )}
          </div>
        </>
      )}

      {modal && (
        <FamilyModal
          key={modal.kind === 'edit' ? modal.household.id : 'new'}
          weddingId={weddingId}
          mode={modal}
          events={eventList}
          guestTags={wedding.guestTags}
          sidesEnabled={wedding.sidesEnabled}
          sideScope={scope}
          timeZone={wedding.timezone}
          onClose={() => setModal(null)}
          onSaved={(h) => {
            setDetailsId(h.id);
            setSelected((s) => (s.has(h.id) ? new Map(s).set(h.id, h) : s));
          }}
          onDelete={(h) => {
            setModal(null);
            setDeleting(h);
          }}
        />
      )}
      {deleting && (
        <DeleteFamilyDialog
          weddingId={weddingId}
          household={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            setDetailsId(null);
            setSelected((s) => {
              const next = new Map(s);
              next.delete(deleting.id);
              return next;
            });
          }}
        />
      )}
      {bulk === 'events' && (
        <BulkEventsDialog
          weddingId={weddingId}
          householdIds={selectedIds}
          events={eventList}
          onClose={() => setBulk(null)}
          onDone={bulkDone('invited')}
        />
      )}
      {bulk === 'tags' && (
        <BulkTagDialog
          weddingId={weddingId}
          householdIds={selectedIds}
          guestTags={wedding.guestTags}
          onClose={() => setBulk(null)}
          onDone={bulkDone('tagged')}
        />
      )}
      {bulk === 'delete' && (
        <BulkDeleteDialog
          weddingId={weddingId}
          households={[...selected.values()]}
          onClose={() => setBulk(null)}
          onDone={() => {
            setBulk(null);
            setNotice(`${families(selected.size)} deleted.`);
            setSelected(new Map());
            setDetailsId(null);
          }}
        />
      )}
    </div>
  );
}
