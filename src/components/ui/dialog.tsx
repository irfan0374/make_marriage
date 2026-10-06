'use client';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { cn } from '@/shared/cn';

// Modal dialog (architecture §18): warm dimmed backdrop, white 16px card. Full-screen sheet on
// phones, centered on larger screens. Focus is trapped and Escape closes it.

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Buttons, kept at the bottom (sticky on phones). */
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="bg-text/35 fixed inset-0 z-40 backdrop-blur-[2px]" />
        <DialogPrimitive.Popup
          className={cn(
            'bg-surface border-border fixed z-50 flex flex-col outline-none',
            // Phone: a full-screen sheet. Larger: a centered card.
            'sm:rounded-card inset-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[90dvh] sm:w-[calc(100%-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:border sm:shadow-xl',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-6">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-xl">{title}</DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-text-muted mt-1 text-sm">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="text-text-muted hover:bg-background-alt hover:text-text -mr-2 rounded-full p-2"
            >
              <X aria-hidden className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && (
            <div className="border-border flex flex-col-reverse gap-3 border-t px-6 py-4 sm:flex-row sm:justify-end">
              {footer}
            </div>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
