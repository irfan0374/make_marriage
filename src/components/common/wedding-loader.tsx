import { cn } from '@/shared/cn';

// The app's loader (architecture §18): two wedding rings that swing together with a heart beating
// above them, and a short label. Still when the person prefers reduced motion.

const SIZES = {
  /** A whole page loading. */
  page: { box: 'py-24', svg: 'h-16 w-24', text: 'text-base' },
  /** A card or a list inside a page. */
  section: { box: 'py-10', svg: 'h-11 w-16', text: 'text-sm' },
  /** A line, e.g. "Loading more". */
  inline: { box: 'py-6', svg: 'h-8 w-12', text: 'text-sm' },
} as const;

export function WeddingLoader({
  label = 'Loading',
  size = 'page',
  className,
}: {
  label?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center gap-3', s.box, className)}
    >
      <svg viewBox="0 0 96 64" aria-hidden className={cn('overflow-visible', s.svg)}>
        {/* Heart */}
        <g
          className="text-gold-deep motion-safe:animate-heart-beat"
          style={{ transformOrigin: '48px 9px', transformBox: 'view-box' }}
        >
          <path
            d="M48 15 C44 11.5 40.5 9 40.5 6 C40.5 3.6 42.3 2 44.4 2 C46 2 47.2 2.9 48 4.1 C48.8 2.9 50 2 51.6 2 C53.7 2 55.5 3.6 55.5 6 C55.5 9 52 11.5 48 15 Z"
            fill="currentColor"
          />
        </g>
        {/* Left ring, with its stone */}
        <g
          className="text-primary motion-safe:animate-ring-left"
          style={{ transformOrigin: '38px 40px', transformBox: 'view-box' }}
        >
          <circle cx="38" cy="40" r="17" fill="none" stroke="currentColor" strokeWidth="4" />
          <path d="M38 17 L42 21.5 L38 25 L34 21.5 Z" className="text-gold" fill="currentColor" />
        </g>
        {/* Right ring */}
        <g
          className="text-gold motion-safe:animate-ring-right"
          style={{ transformOrigin: '58px 40px', transformBox: 'view-box' }}
        >
          <circle cx="58" cy="40" r="17" fill="none" stroke="currentColor" strokeWidth="4" />
        </g>
      </svg>
      <p className={cn('font-heading text-text-muted italic', s.text)}>
        {label}
        <span aria-hidden>
          <span className="motion-safe:animate-loader-dot">.</span>
          <span className="motion-safe:animate-loader-dot [animation-delay:0.2s]">.</span>
          <span className="motion-safe:animate-loader-dot [animation-delay:0.4s]">.</span>
        </span>
      </p>
    </div>
  );
}
