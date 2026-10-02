'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/common/logo';
import { useMe, useWedding } from '@/features/weddings/hooks';
import { AccountMenu } from './account-menu';

/** Top bar inside a wedding: logo, which wedding this is (switchable), and the user menu. */
export function WeddingTopBar({ weddingId }: { weddingId: string }) {
  const { data: me } = useMe();
  const { data: wedding } = useWedding(weddingId);
  const canSwitch = (me?.weddings.length ?? 0) > 1;
  const weddingName = wedding ? `${wedding.brideName} & ${wedding.groomName}` : null;

  return (
    <header className="border-border border-b">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-5 md:px-8">
        <Logo href="/app" height={32} eager className="hidden sm:inline-flex" />
        <Logo href="/app" variant="mark" height={32} eager className="sm:hidden" />

        {weddingName &&
          (canSwitch ? (
            <Link
              href="/app"
              className="border-border hover:border-primary/30 flex min-w-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium"
            >
              <span aria-hidden className="bg-gold size-1.5 shrink-0 rounded-full" />
              <span className="truncate">{weddingName}</span>
              <span className="sr-only">(switch wedding)</span>
              <ChevronDown aria-hidden className="text-text-muted size-4 shrink-0" />
            </Link>
          ) : (
            <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <span aria-hidden className="bg-gold size-1.5 shrink-0 rounded-full" />
              <span className="truncate">{weddingName}</span>
            </p>
          ))}

        <AccountMenu
          settingsHref={wedding?.me.role === 'admin' ? `/app/${weddingId}/settings` : undefined}
        />
      </div>
    </header>
  );
}
