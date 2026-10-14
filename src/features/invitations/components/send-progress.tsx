'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { guestsKey } from '@/features/guests/hooks';
import { useCancelBatch, useEmailBatches } from '@/features/invitations/hooks';
import type { BatchCounts } from '@/modules/jobs/jobs.types';
import { ApiError } from '@/shared/api-client';

// Progress of email sends (Stitch "Sending batch of 280 invitations", api-spec §10.5–10.6): what
// has gone, what failed, what's still waiting, and Cancel. Families' statuses refresh as emails
// go out.

const NOUNS: Record<BatchCounts['type'], [string, string]> = {
  'invitation.send': ['invitation', 'invitations'],
  'rsvp.remind': ['reminder', 'reminders'],
  'event.updated_notice': ['event update', 'event updates'],
};

const label = (batch: BatchCounts) => NOUNS[batch.type][batch.total === 1 ? 0 : 1];

function BatchRow({ weddingId, batch }: { weddingId: string; batch: BatchCounts }) {
  const cancel = useCancelBatch(weddingId);
  const active = batch.waiting > 0;
  const done = batch.sent + batch.skipped + batch.failed;
  const sendable = batch.total - batch.cancelled;
  // A fully cancelled send has nothing done: an empty bar, not a full one.
  const percent = sendable > 0 ? Math.round((done / sendable) * 100) : 0;
  // Once finished, say what actually happened: "Cancelled", "Sent 1 of 3" or "Sent 3".
  const heading = active
    ? `Sending ${batch.total} ${label(batch)}`
    : batch.sent === 0 && batch.failed === 0 && batch.cancelled > 0
      ? `Cancelled ${batch.total} ${label(batch)}`
      : batch.sent < batch.total
        ? `Sent ${batch.sent} of ${batch.total} ${label(batch)}`
        : `Sent ${batch.total} ${label(batch)}`;
  const dot = active
    ? 'bg-pending-text animate-pulse'
    : batch.sent > 0
      ? 'bg-success-text'
      : 'bg-text-muted';
  const parts = [
    `${batch.sent} sent`,
    batch.skipped > 0 && `${batch.skipped} not needed`,
    batch.failed > 0 && `${batch.failed} failed`,
    batch.waiting > 0 && `${batch.waiting} waiting`,
    batch.cancelled > 0 && `${batch.cancelled} cancelled`,
  ].filter(Boolean);

  return (
    <div className="bg-background rounded-card space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm">
          <span aria-hidden className={`${dot} size-2.5 rounded-full`} />
          <strong className="font-semibold">{heading}</strong>
          <span className="text-text-muted">· {parts.join(' · ')}</span>
        </p>
        {active && (
          <button
            type="button"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(batch.batchId)}
            className="text-danger-text text-sm font-semibold hover:underline disabled:opacity-60"
          >
            {cancel.isPending ? 'Cancelling…' : 'Cancel send'}
          </button>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={`Progress of ${batch.total} ${label(batch)}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="bg-background-alt h-2 overflow-hidden rounded-full"
      >
        <div
          className="bg-primary h-full rounded-full transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      {active && (
        <p className="text-text-muted text-xs">
          A few emails go out every minute, within the daily email limit. You can leave this page.
        </p>
      )}
      {cancel.error && (
        <p role="alert" className="text-danger-text text-xs">
          {cancel.error instanceof ApiError ? cancel.error.message : 'Could not cancel. Try again.'}
        </p>
      )}
    </div>
  );
}

export function SendProgress({ weddingId }: { weddingId: string }) {
  const { data: batches } = useEmailBatches(weddingId);
  const queryClient = useQueryClient();
  // Families' invite statuses change as emails go out: refresh the lists and totals.
  const progressed =
    batches?.reduce((n, b) => n + b.sent + b.skipped + b.failed + b.cancelled, 0) ?? 0;
  useEffect(() => {
    if (progressed > 0) void queryClient.invalidateQueries({ queryKey: guestsKey(weddingId) });
  }, [progressed, queryClient, weddingId]);

  if (!batches || batches.length === 0) return null;
  // Every send still going, plus the most recent finished one.
  const active = batches.filter((b) => b.waiting > 0);
  const lastFinished = batches.find((b) => b.waiting === 0);
  const shown = lastFinished && active.length === 0 ? [lastFinished] : active;
  return (
    <div aria-live="polite" className="space-y-3">
      {shown.map((batch) => (
        <BatchRow key={batch.batchId} weddingId={weddingId} batch={batch} />
      ))}
    </div>
  );
}
