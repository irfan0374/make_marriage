'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useMe } from '@/features/weddings/hooks';

/** On the create page: a way back for people who already have a wedding (not first-timers). */
export function BackToWeddings() {
  const { data: me } = useMe();
  if (!me || me.weddings.length === 0) return null;
  return (
    <Link
      href="/app"
      className="text-text-muted hover:text-text mb-4 flex w-full max-w-xl items-center gap-1.5 text-sm"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {me.weddings.length === 1 ? 'Back to your wedding' : 'Back to your weddings'}
    </Link>
  );
}
