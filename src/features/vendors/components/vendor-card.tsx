'use client';

import { MessageCircle, Paperclip, Phone, User } from 'lucide-react';
import type { WeddingEvent } from '@/modules/events/events.types';
import { VENDOR_CATEGORY_LABELS, VENDOR_STATUS_LABELS } from '@/modules/vendors/vendors.schemas';
import type { Vendor, VendorStatus } from '@/modules/vendors/vendors.types';
import { cn } from '@/shared/cn';
import { formatRupees } from '@/shared/money';
import { formatPhone } from '@/shared/phone';

// One vendor in the grid (Stitch "Vendors"): category, status, name, contact with quick call and
// WhatsApp, the events they're working, the contract and files.

const STATUS_STYLE: Record<VendorStatus, string> = {
  shortlisted: 'bg-background text-text-muted',
  booked: 'bg-pending-bg text-pending-text',
  completed: 'bg-success-bg text-success-text',
};

export function StatusChip({ status }: { status: VendorStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        STATUS_STYLE[status],
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {VENDOR_STATUS_LABELS[status]}
    </span>
  );
}

/** "Paid 50% ₹75,000 / ₹1,50,000" with a bar, or just what's been paid without a contract. */
export function PaidLine({
  paidPaise,
  contractPaise,
}: {
  paidPaise: number;
  contractPaise: number | null;
}) {
  if (contractPaise === null || contractPaise === 0) {
    return (
      <p className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-text-muted">Paid</span>
        <span className="text-sm font-semibold">{formatRupees(paidPaise)}</span>
      </p>
    );
  }
  const share = Math.min(1, paidPaise / contractPaise);
  return (
    <>
      <p className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-text-muted">
          Paid {Math.round((paidPaise / contractPaise) * 100)}%
        </span>
        <span>
          <strong className="text-sm">{formatRupees(paidPaise)}</strong>
          <span className="text-text-muted"> / {formatRupees(contractPaise)}</span>
        </span>
      </p>
      <div aria-hidden className="bg-background mt-1.5 h-1.5 overflow-hidden rounded-full">
        <div className="bg-primary h-full rounded-full" style={{ width: `${share * 100}%` }} />
      </div>
    </>
  );
}

const iconButton =
  'flex size-8 shrink-0 items-center justify-center rounded-full transition-colors';

export function VendorCard({
  vendor,
  events,
  selected,
  paidPaise,
  onOpen,
}: {
  vendor: Vendor;
  events: WeddingEvent[];
  selected: boolean;
  /** Total of the expenses linked to this vendor. */
  paidPaise: number;
  onOpen: () => void;
}) {
  const linked = vendor.eventIds
    .map((id) => events.find((e) => e.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const whatsapp = vendor.whatsapp ?? vendor.phone;
  const files = vendor.attachments.length;

  return (
    <li
      className={cn(
        'bg-surface rounded-card shadow-card relative flex flex-col border p-5 transition-colors',
        selected
          ? 'border-primary ring-primary/20 ring-2'
          : 'border-border hover:border-primary/40',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-pending-text text-[11px] font-semibold tracking-[0.1em] uppercase">
          {VENDOR_CATEGORY_LABELS[vendor.category]}
        </p>
        <StatusChip status={vendor.status} />
      </div>
      <h3 className="mt-2 text-xl font-normal">
        {/* The whole card opens the details; the call and WhatsApp buttons sit above it. */}
        <button
          type="button"
          onClick={onOpen}
          aria-pressed={selected}
          className="text-left after:absolute after:inset-0 after:content-['']"
        >
          {vendor.name}
        </button>
      </h3>

      {(vendor.contactName || vendor.phone) && (
        <div className="mt-3 flex items-center gap-3">
          <User aria-hidden className="text-text-muted size-4 shrink-0" />
          <p className="min-w-0 flex-1 text-sm">
            <span className="block truncate">{vendor.contactName || 'Contact'}</span>
            {vendor.phone && (
              <span className="text-text-muted block text-xs">{formatPhone(vendor.phone)}</span>
            )}
          </p>
          {vendor.phone && (
            <a
              href={`tel:${vendor.phone}`}
              aria-label={`Call ${vendor.name}`}
              className={cn(iconButton, 'bg-background hover:bg-background-alt relative z-10')}
            >
              <Phone aria-hidden className="size-3.5" />
            </a>
          )}
          {whatsapp && (
            <a
              href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`WhatsApp ${vendor.name}`}
              className={cn(
                iconButton,
                'bg-success-bg text-success-text hover:bg-success-bg/70 relative z-10',
              )}
            >
              <MessageCircle aria-hidden className="size-3.5" />
            </a>
          )}
        </div>
      )}

      {linked.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-1.5">
          {linked.map((name) => (
            <span key={name} className="bg-background rounded-full px-2.5 py-0.5 text-xs">
              {name}
            </span>
          ))}
        </p>
      )}

      <div className="border-border/60 mt-auto border-t pt-3">
        <PaidLine paidPaise={paidPaise} contractPaise={vendor.contractAmountPaise} />
      </div>
      <p className="text-text-muted mt-2 flex items-center gap-1.5 text-xs">
        <Paperclip aria-hidden className="size-3.5" />
        {files === 0 ? 'No files' : `${files} ${files === 1 ? 'file' : 'files'}`}
      </p>
    </li>
  );
}
