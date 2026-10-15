'use client';

import { CheckCircle2, CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import type { ZipProgress } from '../use-zip-download';

// Progress of a ZIP download (PRD GAL-8): each part of about 500 photos is fetched, zipped in the
// browser and saved before the next one starts.

export function ZipDialog({
  progress,
  onCancel,
  onClose,
}: {
  progress: ZipProgress;
  onCancel: () => void;
  onClose: () => void;
}) {
  if (progress.status === 'idle') return null;
  const working = progress.status === 'working';
  const percent = progress.inPart > 0 ? Math.round((progress.fetched / progress.inPart) * 100) : 0;
  const parts = progress.totalParts > 1;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && (working ? onCancel() : onClose())}
      title={
        working
          ? 'Preparing your download'
          : progress.status === 'done'
            ? 'Download ready'
            : 'Download stopped'
      }
      description={
        working
          ? parts
            ? 'Large galleries download in parts of about 500 photos. Your browser may ask to allow several downloads.'
            : 'Keep this page open until it finishes.'
          : undefined
      }
      footer={
        working ? (
          <Button variant="outline" className="h-11 px-6" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <Button className="h-11 px-6" onClick={onClose}>
            Done
          </Button>
        )
      }
    >
      {working ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {parts ? `Part ${progress.part} of ${progress.totalParts} · ` : ''}
              {progress.fetched.toLocaleString('en-IN')} of{' '}
              {progress.inPart.toLocaleString('en-IN')} photos
            </span>
            <span className="text-primary font-semibold">{percent}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Download progress"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="bg-border h-2 w-full overflow-hidden rounded-full"
          >
            <div
              className="bg-primary h-full rounded-full transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      ) : progress.status === 'done' ? (
        <p className="flex items-start gap-2 text-sm">
          <CheckCircle2 aria-hidden className="text-success-text mt-0.5 size-5 shrink-0" />
          <span>
            {progress.saved.toLocaleString('en-IN')}{' '}
            {progress.saved === 1 ? 'photo was' : 'photos were'} saved
            {progress.totalParts > 1 ? ` in ${progress.totalParts} ZIP files` : ' as a ZIP file'} to
            your downloads.
            {progress.failed > 0 &&
              ` ${progress.failed} couldn't be fetched; try downloading them again later.`}
          </span>
        </p>
      ) : (
        <p role="alert" className="text-danger-text flex items-start gap-2 text-sm">
          <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
          <span>
            {progress.message}
            {progress.saved > 0 && ` ${progress.saved} photos were saved before it stopped.`}
          </span>
        </p>
      )}
    </Dialog>
  );
}
