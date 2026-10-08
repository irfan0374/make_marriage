'use client';

import { Menu } from '@base-ui/react/menu';
import { ChevronDown, LayoutList, LogOut, Settings, User } from 'lucide-react';
import Link from 'next/link';
import { useLogout } from '@/features/auth/hooks';
import { useMe } from '@/features/weddings/hooks';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : ''))
    .toUpperCase()
    .slice(0, 2);
}

const item =
  'data-[highlighted]:bg-background-alt rounded-input flex cursor-pointer items-center gap-2 px-3 py-2 text-sm outline-none';

/**
 * The user menu in every app header: wedding settings (admins, inside a wedding), switch
 * weddings, and log out. Creating a wedding isn't offered here: only someone on no wedding team
 * can, and the app takes them to the create page directly (PRD §4).
 */
export function AccountMenu({
  settingsHref,
  compact = false,
}: {
  settingsHref?: string;
  /** Just a round avatar button (the wedding top bar, Stitch "Dashboard"). */
  compact?: boolean;
} = {}) {
  const { data: me } = useMe();
  const logout = useLogout();
  if (!me) return null;
  const hasSeveral = me.weddings.length > 1;

  return (
    <div className={compact ? 'relative' : 'relative ml-auto'}>
      <Menu.Root>
        {compact ? (
          <Menu.Trigger
            aria-label={`Account menu for ${me.user.name}`}
            className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary/25 flex size-8 items-center justify-center rounded-full outline-none focus-visible:ring-3"
          >
            <User aria-hidden className="size-4.5" />
          </Menu.Trigger>
        ) : (
          <Menu.Trigger
            aria-label={`Account menu for ${me.user.name}`}
            className="hover:bg-background-alt focus-visible:ring-primary/25 flex items-center gap-2 rounded-full py-1 pr-2 pl-1 outline-none focus-visible:ring-3"
          >
            <span className="bg-primary-tint text-primary flex size-8 items-center justify-center rounded-full text-xs font-medium">
              {initials(me.user.name)}
            </span>
            <span className="hidden text-sm font-medium sm:inline">{me.user.name}</span>
            <ChevronDown aria-hidden className="text-text-muted size-4" />
          </Menu.Trigger>
        )}
        <Menu.Portal>
          <Menu.Positioner align="end" sideOffset={8}>
            <Menu.Popup className="border-border bg-surface rounded-card min-w-56 border p-1.5 shadow-lg outline-none">
              <div className="px-3 py-2">
                <p className="text-sm font-medium">{me.user.name}</p>
                <p className="text-text-muted truncate text-xs">{me.user.email}</p>
              </div>
              <div className="bg-border my-1 h-px" />
              {settingsHref && (
                <Menu.LinkItem render={<Link href={settingsHref} />} className={item}>
                  <Settings aria-hidden className="text-primary size-4" />
                  Wedding settings
                </Menu.LinkItem>
              )}
              {hasSeveral && (
                <Menu.LinkItem render={<Link href="/app" />} className={item}>
                  <LayoutList aria-hidden className="text-primary size-4" />
                  Your weddings
                </Menu.LinkItem>
              )}
              {(settingsHref || hasSeveral) && <div className="bg-border my-1 h-px" />}
              <Menu.Item onClick={() => logout.mutate()} className={item}>
                <LogOut aria-hidden className="text-primary size-4" />
                Log out
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {logout.isError && (
        <p
          role="alert"
          className="bg-danger-bg text-danger-text rounded-input absolute top-full right-0 mt-2 px-3 py-1.5 text-xs whitespace-nowrap"
        >
          Could not log out. Please try again.
        </p>
      )}
    </div>
  );
}
