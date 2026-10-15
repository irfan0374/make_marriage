'use client';

import {
  Download,
  FileText,
  Image as ImageIcon,
  Mail,
  MessageCircle,
  Paperclip,
  Pencil,
  Phone,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { FormAlert } from '@/components/common/form-field';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { fileCheck } from '@/features/files/upload';
import { attachmentUrl } from '@/features/vendors/api';
import { useAddAttachment, useDeleteVendor, useRemoveAttachment } from '@/features/vendors/hooks';
import type { WeddingEvent } from '@/modules/events/events.types';
import { FILE_RULES } from '@/modules/files/files.schemas';
import { MAX_ATTACHMENTS, VENDOR_CATEGORY_LABELS } from '@/modules/vendors/vendors.schemas';
import type { Vendor, VendorAttachment } from '@/modules/vendors/vendors.types';
import { ApiError } from '@/shared/api-client';
import { formatDate, todayIn } from '@/shared/dates';
import { formatRupees } from '@/shared/money';
import { formatPhone } from '@/shared/phone';
import { StatusChip } from './vendor-card';

// The vendor details panel beside the cards (Stitch "Vendors"): how to reach them, what's
// agreed, the events they're working, and their quotes and contracts.

const label = 'text-text-muted mb-2 text-[11px] font-semibold tracking-[0.08em] uppercase';
const action =
  'border-border bg-surface hover:border-primary/40 flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold';

function messageOf(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Could not reach the server. Check your connection and try again.';
}

const sizeOf = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

const digits = (phone: string) => phone.replace(/\D/g, '');

function DeleteVendorDialog({
  weddingId,
  vendor,
  onClose,
  onDeleted,
}: {
  weddingId: string;
  vendor: Vendor;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const mutation = useDeleteVendor(weddingId);
  const files = vendor.attachments.length;
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Delete ${vendor.name}?`}
      description={
        files > 0
          ? `Their ${files} ${files === 1 ? 'file' : 'files'} will be deleted too. Expenses already linked to them keep the vendor's name.`
          : "Expenses already linked to them keep the vendor's name."
      }
      footer={
        <>
          <Button variant="outline" className="h-11 px-6" onClick={onClose}>
            Keep vendor
          </Button>
          <Button
            variant="destructive"
            className="h-11 px-6"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(vendor.id, { onSuccess: onDeleted })}
          >
            {mutation.isPending ? 'Deleting…' : 'Delete vendor'}
          </Button>
        </>
      }
    >
      <FormAlert message={mutation.error ? messageOf(mutation.error) : null} />
    </Dialog>
  );
}

function AttachmentRow({
  weddingId,
  vendor,
  attachment,
  readOnly,
  timeZone,
}: {
  weddingId: string;
  vendor: Vendor;
  attachment: VendorAttachment;
  readOnly: boolean;
  /** The wedding's timezone, for the day a file was added. */
  timeZone: string;
}) {
  const remove = useRemoveAttachment(weddingId);
  const isPdf = attachment.contentType === 'application/pdf';
  const Icon = isPdf ? FileText : ImageIcon;
  return (
    <li className="bg-background rounded-input flex items-center gap-3 p-3">
      <span className="bg-primary-tint text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
        <Icon aria-hidden className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <a
          href={attachmentUrl(weddingId, vendor.id, attachment.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm font-medium hover:underline"
        >
          {attachment.fileName}
        </a>
        <p className="text-text-muted text-xs">
          {sizeOf(attachment.sizeBytes)} · Added{' '}
          {formatDate(todayIn(timeZone, new Date(attachment.uploadedAt)))}
        </p>
      </div>
      <a
        href={attachmentUrl(weddingId, vendor.id, attachment.id)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${attachment.fileName}`}
        className="text-text-muted hover:text-text rounded-full p-1.5"
      >
        <Download aria-hidden className="size-4" />
      </a>
      {!readOnly && (
        <button
          type="button"
          aria-label={`Remove ${attachment.fileName}`}
          disabled={remove.isPending}
          onClick={() => remove.mutate({ vendorId: vendor.id, attachmentId: attachment.id })}
          className="text-text-muted hover:text-danger-text rounded-full p-1.5 disabled:opacity-50"
        >
          <Trash2 aria-hidden className="size-4" />
        </button>
      )}
    </li>
  );
}

export function VendorDetails({
  weddingId,
  vendor,
  events,
  readOnly,
  timeZone,
  paidPaise,
  onEdit,
  onClose,
}: {
  weddingId: string;
  vendor: Vendor;
  events: WeddingEvent[];
  readOnly: boolean;
  timeZone: string;
  /** Total of the expenses linked to this vendor. */
  paidPaise: number;
  onEdit: () => void;
  onClose: () => void;
}) {
  const add = useAddAttachment(weddingId);
  const [fileError, setFileError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  // On phones and tablets the panel sits below the cards: bring it into view when it opens.
  useEffect(() => {
    if (window.matchMedia('(max-width: 1023px)').matches) {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);
  const linked = vendor.eventIds
    .map((id) => events.find((e) => e.id === id))
    .filter((e): e is WeddingEvent => Boolean(e));
  const full = vendor.attachments.length >= MAX_ATTACHMENTS;

  async function choose(file: File | undefined) {
    if (!file) return;
    setFileError(null);
    const problem = await fileCheck('vendor_attachment', file);
    if (problem) {
      setFileError(problem);
    } else {
      add.mutate(
        { vendorId: vendor.id, file },
        { onError: (error) => setFileError(messageOf(error)) },
      );
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <aside
      ref={panelRef}
      aria-label={`${vendor.name} details`}
      className="border-border bg-surface rounded-card shadow-card scroll-mt-20 space-y-6 border p-6 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-xs">
            <StatusChip status={vendor.status} />
            <span className="text-text-muted">{VENDOR_CATEGORY_LABELS[vendor.category]}</span>
          </p>
          <h2 className="mt-2 text-2xl font-normal">{vendor.name}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="text-text-muted hover:text-text hover:bg-background -mr-2 rounded-full p-2"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>

      <section className="bg-background rounded-input space-y-3 p-4">
        {(vendor.contactName || vendor.contactRole) && (
          <p className="text-sm">
            <span className="font-medium">{vendor.contactName || 'Contact'}</span>
            {vendor.contactRole && (
              <span className="text-text-muted block text-xs">{vendor.contactRole}</span>
            )}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {vendor.phone && (
            <a href={`tel:${vendor.phone}`} className={action}>
              <Phone aria-hidden className="size-3.5" />
              Call {formatPhone(vendor.phone)}
            </a>
          )}
          {(vendor.whatsapp ?? vendor.phone) && (
            <a
              href={`https://wa.me/${digits(vendor.whatsapp ?? vendor.phone!)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={action}
            >
              <MessageCircle aria-hidden className="size-3.5" />
              WhatsApp
            </a>
          )}
          {vendor.email && (
            <a href={`mailto:${vendor.email}`} className={action}>
              <Mail aria-hidden className="size-3.5" />
              {vendor.email}
            </a>
          )}
        </div>
        {!vendor.phone && !vendor.whatsapp && !vendor.email && (
          <p className="text-text-muted text-xs">No phone or email yet.</p>
        )}
      </section>

      <section>
        <h3 className={label}>Payments</h3>
        <dl className="bg-background rounded-input grid grid-cols-3 gap-2 p-3 text-xs">
          <div>
            <dt className="text-text-muted">Contract</dt>
            <dd className="mt-0.5 text-sm font-semibold">
              {vendor.contractAmountPaise === null
                ? 'Not set'
                : formatRupees(vendor.contractAmountPaise)}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Paid</dt>
            <dd className="mt-0.5 text-sm font-semibold">{formatRupees(paidPaise)}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Balance</dt>
            <dd className="mt-0.5 text-sm font-semibold">
              {vendor.contractAmountPaise === null
                ? '—'
                : formatRupees(Math.max(0, vendor.contractAmountPaise - paidPaise))}
            </dd>
          </div>
        </dl>
        <p className="text-text-muted mt-1.5 text-xs">
          Paid is the total of expenses linked to this vendor.{' '}
          <Link
            href={`/app/${weddingId}/expenses`}
            className="text-primary font-medium hover:underline"
          >
            Log a payment
          </Link>
        </p>
      </section>

      {vendor.notes && (
        <section>
          <h3 className={label}>Scope &amp; notes</h3>
          <p className="border-primary/30 border-l-2 pl-3 text-sm whitespace-pre-line">
            {vendor.notes}
          </p>
        </section>
      )}

      <section>
        <h3 className={label}>Events</h3>
        {linked.length === 0 ? (
          <p className="text-text-muted text-sm">Not linked to an event yet.</p>
        ) : (
          <ul className="space-y-2">
            {linked.map((event) => (
              <li key={event.id} className="bg-background rounded-input px-3 py-2 text-sm">
                <span className="font-medium">{event.name}</span>
                <span className="text-text-muted">
                  {' '}
                  · {formatDate(event.date).slice(0, -5)}
                  {event.venueName && ` · ${event.venueName}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className={`${label} flex items-center justify-between`}>
          <span className="flex items-center gap-1.5">
            <Paperclip aria-hidden className="size-3.5" />
            Quotes &amp; contracts
          </span>
          {!readOnly && (
            <button
              type="button"
              disabled={add.isPending || full}
              onClick={() => fileRef.current?.click()}
              className="text-primary flex items-center gap-1 tracking-normal normal-case hover:underline disabled:opacity-50"
            >
              <Upload aria-hidden className="size-3.5" />
              {add.isPending ? 'Uploading…' : 'Upload'}
            </button>
          )}
        </h3>
        <input
          ref={fileRef}
          type="file"
          accept={FILE_RULES.vendor_attachment.types.join(',')}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => void choose(e.target.files?.[0])}
        />
        {vendor.attachments.length === 0 ? (
          <p className="text-text-muted text-sm">
            No files yet. Add quotes, contracts or invoices (PDF or image, up to 10 MB).
          </p>
        ) : (
          <ul className="space-y-2">
            {vendor.attachments.map((attachment) => (
              <AttachmentRow
                key={attachment.id}
                weddingId={weddingId}
                vendor={vendor}
                attachment={attachment}
                readOnly={readOnly}
                timeZone={timeZone}
              />
            ))}
          </ul>
        )}
        {full && !readOnly && (
          <p className="text-text-muted mt-2 text-xs">
            {MAX_ATTACHMENTS} files is the most a vendor can have. Remove one to add another.
          </p>
        )}
        <div className="mt-2">
          <FormAlert message={fileError} />
        </div>
      </section>

      {!readOnly && (
        <div className="border-border/60 flex items-center justify-between gap-3 border-t pt-4">
          <button
            type="button"
            onClick={() => setDeleting(true)}
            className="text-danger-text hover:bg-danger-bg -ml-2 flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium"
          >
            <Trash2 aria-hidden className="size-4" />
            Delete vendor
          </button>
          <Button className="h-10 gap-2 px-5" onClick={onEdit}>
            <Pencil aria-hidden className="size-4" />
            Edit details
          </Button>
        </div>
      )}
      {deleting && (
        <DeleteVendorDialog
          weddingId={weddingId}
          vendor={vendor}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            setDeleting(false);
            onClose();
          }}
        />
      )}
    </aside>
  );
}
