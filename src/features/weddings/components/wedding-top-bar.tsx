'use client';

import { ChevronDown, MailPlus } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/common/logo';
import { SoonTag } from '@/components/common/soon-tag';
import { useMe, useWedding } from '@/features/weddings/hooks';
import { AccountMenu } from './account-menu';
import { WeddingMobileNav } from './wedding-nav';

const pill =
  'border-border/80 bg-surface flex min-w-0 items-center gap-2 rounded-full border px-3 py-1.5';

/**
 * Top bar inside a wedding (Stitch "Dashboard"): which wedding this is (a switcher when you have
 * several), "Send invitations", and the account menu. On phones it also has the menu button and
 * logo; on desktop those are in the sidebar.
 */
export function WeddingTopBar({ weddingId }: { weddingId: string }) {
  const { data: me } = useMe();
  const { data: wedding } = useWedding(weddingId);
  const canSwitch = (me?.weddings.length ?? 0) > 1;
  const weddingName = wedding ? `${wedding.brideName} & ${wedding.groomName}` : null;
  const name = <span className="font-heading truncate text-base font-medium">{weddingName}</span>;

  return (
    <header className="border-border/60 bg-background/90 shadow-chrome sticky top-0 z-40 border-b backdrop-blur-xl">
      <div className="flex h-16 w-full items-center gap-3 px-5 md:px-8">
        <WeddingMobileNav weddingId={weddingId} />
        <Logo href="/app" variant="mark" height={30} eager className="lg:hidden" />

        {weddingName &&
          (canSwitch ? (
            <Link href="/app" className={`${pill} hover:bg-background transition-colors`}>
              {name}
              <span className="sr-only">(switch wedding)</span>
              <ChevronDown aria-hidden className="text-text-muted size-5 shrink-0" />
            </Link>
          ) : (
            <p className={pill}>{name}</p>
          ))}

        <div className="ml-auto flex items-center gap-4">
          <span
            aria-disabled="true"
            className="bg-primary text-primary-foreground hidden cursor-default items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold opacity-60 shadow-sm sm:inline-flex"
          >
            <MailPlus aria-hidden className="size-4.5" />
            Send invitations
            <SoonTag className="bg-primary-foreground/15 text-primary-foreground" />
          </span>
          <AccountMenu
            compact
            settingsHref={wedding?.me.role === 'admin' ? `/app/${weddingId}/settings` : undefined}
          />
        </div>
      </div>
    </header>
  );
}
