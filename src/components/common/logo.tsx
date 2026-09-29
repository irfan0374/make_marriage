import Image from 'next/image';
import Link from 'next/link';
import { APP_NAME } from '@/config/app';
import { cn } from '@/shared/cn';

// Logo files live in public/logo/ (architecture §18.5).
const LOGOS = {
  horizontal: { src: '/logo/logo-horizontal-plum.svg', width: 471, height: 116 },
  stacked: { src: '/logo/logo-stacked-plum.svg', width: 328, height: 203 },
  mark: { src: '/logo/mark-plum.svg', width: 96, height: 96 },
} as const;

type LogoProps = {
  variant?: keyof typeof LOGOS;
  /** Rendered height in pixels; width follows the file's aspect ratio. */
  height?: number;
  priority?: boolean;
  className?: string;
};

export function Logo({ variant = 'horizontal', height = 44, priority, className }: LogoProps) {
  const logo = LOGOS[variant];
  return (
    <Link href="/" className={cn('inline-flex shrink-0', className)}>
      <Image
        src={logo.src}
        alt={APP_NAME}
        width={Math.round((logo.width / logo.height) * height)}
        height={height}
        priority={priority}
        // SVGs are already optimal; the image optimizer would reject them without extra config.
        unoptimized
      />
    </Link>
  );
}
