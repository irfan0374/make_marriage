'use client';

import { ChevronLeft, ChevronRight, X, ZoomIn } from 'lucide-react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { useRef, useState } from 'react';
import type { WebsiteTheme } from '@/modules/website/website.schemas';
import { cn } from '@/shared/cn';

// The couple's photos (PRD WEB-3, up to 12) laid out per theme, opening in a lightbox.

export function PhotoGallery({ urls, theme }: { urls: string[]; theme: WebsiteTheme }) {
  const [open, setOpen] = useState<number | null>(null);
  // The photo that opened the lightbox gets focus back when it closes.
  const opener = useRef<HTMLElement | null>(null);

  const tile = (url: string, i: number, className: string, rounded = 'rounded-xl') => (
    <button
      key={url}
      type="button"
      onClick={(e) => {
        opener.current = e.currentTarget;
        setOpen(i);
      }}
      aria-label={`Open photo ${i + 1} of ${urls.length}`}
      className={cn(
        'group bg-background-alt relative cursor-zoom-in overflow-hidden shadow-sm',
        rounded,
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a redirect to a signed link */}
      <img
        src={url}
        alt=""
        loading="lazy"
        className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      <span className="bg-site-deep/20 absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
        <ZoomIn aria-hidden className="size-7 text-white drop-shadow-md" />
      </span>
    </button>
  );

  let grid: React.ReactNode;
  if (theme === 'elegant' && urls.length >= 4) {
    // One tall portrait, one wide and two small beside it, then the rest in rows.
    const [a, b, c, d, ...rest] = urls as [string, string, string, string, ...string[]];
    grid = (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          {tile(a, 0, 'h-[360px] md:col-span-5 md:h-[480px]', 'rounded-2xl')}
          <div className="flex flex-col gap-4 md:col-span-7">
            {tile(b, 1, 'h-[230px] w-full', 'rounded-2xl')}
            <div className="grid grid-cols-2 gap-4">
              {tile(c, 2, 'h-[180px] md:h-[234px]', 'rounded-2xl')}
              {tile(d, 3, 'h-[180px] md:h-[234px]', 'rounded-2xl')}
            </div>
          </div>
        </div>
        {rest.length > 0 && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {rest.map((url, i) => tile(url, i + 4, 'aspect-[3/4]', 'rounded-2xl'))}
          </div>
        )}
      </div>
    );
  } else if (theme === 'modern') {
    grid = (
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {urls.map((url, i) => tile(url, i, 'aspect-[3/4]', 'rounded-lg'))}
      </div>
    );
  } else {
    grid = (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {urls.map((url, i) =>
          tile(
            url,
            i,
            i === 2 && urls.length >= 6
              ? 'aspect-[3/4] md:row-span-2 md:aspect-auto'
              : 'aspect-[3/4]',
          ),
        )}
      </div>
    );
  }

  return (
    <>
      {grid}
      {/* Always mounted, so opening is a real closed → open change and focus moves in. */}
      <Lightbox
        urls={urls}
        index={open}
        onIndex={setOpen}
        onClose={() => setOpen(null)}
        returnFocus={opener}
      />
    </>
  );
}

/**
 * The full-size photo, as a modal dialog (Base UI, like the app's dialogs): focus moves inside
 * and is trapped, Escape closes it, and focus returns to the photo that opened it.
 */
function Lightbox({
  urls,
  index,
  onIndex,
  onClose,
  returnFocus,
}: {
  urls: string[];
  /** The photo shown, or `null` while closed. */
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
  returnFocus: React.RefObject<HTMLElement | null>;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const shown = index ?? 0;
  const go = (step: number) => onIndex((shown + step + urls.length) % urls.length);
  const arrow =
    'absolute top-1/2 -translate-y-1/2 rounded-full p-2 text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none';

  return (
    <DialogPrimitive.Root open={index !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md" />
        <DialogPrimitive.Popup
          initialFocus={closeRef}
          finalFocus={returnFocus}
          className="fixed inset-0 z-[61] flex items-center justify-center p-4 outline-none"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') go(1);
            if (e.key === 'ArrowLeft') go(-1);
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            Photo {shown + 1} of {urls.length}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close
            ref={closeRef}
            aria-label="Close"
            className="absolute top-4 right-4 rounded-full p-2 text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
          >
            <X aria-hidden className="size-7" />
          </DialogPrimitive.Close>
          {urls.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={() => go(-1)}
                className={cn(arrow, 'left-2 sm:left-6')}
              >
                <ChevronLeft aria-hidden className="size-8" />
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={() => go(1)}
                className={cn(arrow, 'right-2 sm:right-6')}
              >
                <ChevronRight aria-hidden className="size-8" />
              </button>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element -- a redirect to a signed link */}
          <img
            src={urls[shown]}
            alt={`Photo ${shown + 1} of ${urls.length}`}
            className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl"
          />
          <p aria-hidden className="absolute bottom-4 text-sm text-white/70">
            {shown + 1} / {urls.length}
          </p>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
