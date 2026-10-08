import { cn } from '@/shared/cn';

/** Small "Soon" tag on things whose feature isn't built yet (sidebar, dashboard, top bar). */
export function SoonTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'bg-background-alt text-text-muted shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium tracking-wide uppercase',
        className,
      )}
    >
      Soon
      <span className="sr-only"> (coming soon)</span>
    </span>
  );
}
