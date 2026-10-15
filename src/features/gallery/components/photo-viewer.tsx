'use client';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { PublicPhoto } from '@/modules/gallery/gallery.types';

// Stitch "Guest Photo Gallery (Viewer)": a photo full screen on a dark backdrop, with arrows,
// who shared it and a download. A Base UI dialog, so focus moves in, stays in, and returns.

export interface ViewerProps {
  photos: PublicPhoto[];
  /** The photo shown, or `null` while closed. */
  index: number | null;
  /** All photos in this view, if known (more may still be loading). */
  total: number | null;
  onIndex: (index: number) => void;
  onClose: () => void;
  /** Called near the end of what's loaded, to load more. */
  onNearEnd?: () => void;
  timeZone?: string;
}

function uploadedLabel(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).format(new Date(iso));
}

export function PhotoViewer({
  photos,
  index,
  total,
  onIndex,
  onClose,
  onNearEnd,
  timeZone,
}: ViewerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const shown = index === null ? null : photos[index];
  const count = total ?? photos.length;

  useEffect(() => {
    if (index !== null && index >= photos.length - 3) onNearEnd?.();
  }, [index, photos.length, onNearEnd]);

  const go = (step: number) => {
    if (index === null) return;
    const next = index + step;
    if (next >= 0 && next < photos.length) onIndex(next);
  };

  return (
    <DialogPrimitive.Root open={index !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-md" />
        <DialogPrimitive.Popup
          initialFocus={closeRef}
          className="fixed inset-0 z-[61] flex flex-col justify-between outline-none"
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') go(1);
            if (e.key === 'ArrowLeft') go(-1);
          }}
        >
          {shown && index !== null && (
            <>
              <div className="flex items-center justify-between px-4 py-4">
                <DialogPrimitive.Close
                  ref={closeRef}
                  aria-label="Close"
                  className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                >
                  <X aria-hidden className="size-5" />
                </DialogPrimitive.Close>
                <DialogPrimitive.Title className="text-xs font-medium tracking-wider text-white">
                  Photo {(index + 1).toLocaleString('en-IN')} of {count.toLocaleString('en-IN')}
                </DialogPrimitive.Title>
                <span className="size-10" />
              </div>

              <div className="relative flex flex-1 items-center justify-center px-2 select-none">
                {index > 0 && (
                  <button
                    type="button"
                    aria-label="Previous photo"
                    onClick={() => go(-1)}
                    className="absolute left-3 z-10 flex size-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                  >
                    <ChevronLeft aria-hidden className="size-6" />
                  </button>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL */}
                <img
                  key={shown.id}
                  src={shown.displayUrl}
                  alt={`Photo ${index + 1}${shown.uploaderName ? `, shared by ${shown.uploaderName}` : ''}`}
                  className="max-h-[78vh] max-w-full rounded-lg object-contain shadow-2xl"
                />
                {index < photos.length - 1 && (
                  <button
                    type="button"
                    aria-label="Next photo"
                    onClick={() => go(1)}
                    className="absolute right-3 z-10 flex size-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                  >
                    <ChevronRight aria-hidden className="size-6" />
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 bg-gradient-to-t from-black/80 to-transparent px-5 py-4">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-white">
                    {shown.uploaderName ? `Shared by ${shown.uploaderName}` : 'Shared by a guest'} ·{' '}
                    {shown.albumName}
                  </span>
                  <span className="text-sm text-white/60">
                    Added {uploadedLabel(shown.uploadedAt, timeZone)}
                  </span>
                </div>
                <a
                  href={shown.downloadUrl}
                  className="text-gold inline-flex shrink-0 items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-medium transition-colors hover:bg-white/20"
                >
                  <Download aria-hidden className="size-4" />
                  Download
                </a>
              </div>
            </>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
