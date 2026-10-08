'use client';

import { Menu } from '@base-ui/react/menu';
import {
  CalendarDays,
  Globe,
  Images,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mail,
  Menu as MenuIcon,
  Settings,
  Store,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/common/logo';
import { SoonTag } from '@/components/common/soon-tag';
import { useLogout } from '@/features/auth/hooks';
import { useMe, useWedding } from '@/features/weddings/hooks';
import { cn } from '@/shared/cn';
import { initials } from './account-menu';

// The app's sections inside a wedding (Stitch "Dashboard" sidebar). Sections not built yet are
// faded with a "Soon" tag and can't be clicked; give one an `href` when it ships. Settings is for
// admins only.

interface NavItem {
  label: string;
  icon: LucideIcon;
  /** `null` while the section isn't built ("Soon"). */
  href: string | null;
  exact?: boolean;
}

function navGroups(weddingId: string, isAdmin: boolean): NavItem[][] {
  const base = `/app/${weddingId}`;
  return [
    [
      { label: 'Dashboard', icon: LayoutDashboard, href: base, exact: true },
      { label: 'Events', icon: CalendarDays, href: null },
      { label: 'Guests', icon: Users, href: null },
      { label: 'Invitations & RSVP', icon: Mail, href: null },
      { label: 'Tasks', icon: ListChecks, href: null },
      { label: 'Expenses', icon: Wallet, href: null },
      { label: 'Vendors', icon: Store, href: null },
      { label: 'Website', icon: Globe, href: null },
      { label: 'Photo Gallery', icon: Images, href: null },
    ],
    [
      { label: 'Team', icon: UsersRound, href: `${base}/team` },
      ...(isAdmin ? [{ label: 'Settings', icon: Settings, href: `${base}/settings` }] : []),
    ],
  ];
}

function useNav(weddingId: string) {
  const pathname = usePathname();
  const { data: wedding } = useWedding(weddingId);
  return navGroups(weddingId, wedding?.me.role === 'admin').map((group) =>
    group.map((item) => ({
      ...item,
      active:
        item.href !== null &&
        (item.exact ? pathname === item.href : pathname.startsWith(item.href)),
    })),
  );
}

/** Who's signed in, their role on this wedding, and log out (bottom of the sidebar). */
function SidebarUser({ weddingId }: { weddingId: string }) {
  const { data: me } = useMe();
  const { data: wedding } = useWedding(weddingId);
  const logout = useLogout();
  if (!me) return null;
  return (
    <div className="border-border/60 border-t p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="bg-primary-tint text-primary flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
            {initials(me.user.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm leading-snug font-semibold">{me.user.name}</p>
            {wedding && (
              <p className="text-text-muted text-[11px] font-medium tracking-wide">
                {wedding.me.role === 'admin' ? 'Admin' : 'Manager'}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          aria-label="Log out"
          title="Log out"
          className="text-text-muted hover:text-danger-text hover:bg-danger-bg rounded-sm p-1.5 transition-colors"
        >
          <LogOut aria-hidden className="size-5" />
        </button>
      </div>
      {logout.isError && (
        <p role="alert" className="text-danger-text mt-2 text-xs">
          Could not log out. Please try again.
        </p>
      )}
    </div>
  );
}

/** Desktop: a sidebar with the logo, sections, and who's signed in. */
export function WeddingSidebar({ weddingId }: { weddingId: string }) {
  const groups = useNav(weddingId);
  return (
    <aside className="border-border/70 bg-surface shadow-chrome sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r lg:flex">
      <div className="border-border/60 flex items-center border-b px-6 py-6">
        <Logo href="/app" height={32} eager />
      </div>
      <nav aria-label="Wedding" className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group, index) => (
          <ul
            key={index}
            className={cn('space-y-1', index > 0 && 'border-border/60 mt-2 border-t pt-2')}
          >
            {group.map(({ href, label, icon: Icon, active }) => (
              <li key={label}>
                {href ? (
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-primary-tint text-primary font-semibold shadow-sm'
                        : 'text-text-muted hover:bg-background hover:text-text font-medium',
                    )}
                  >
                    <Icon aria-hidden className="text-primary size-5 shrink-0" />
                    {label}
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="text-text-muted flex cursor-default items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium"
                  >
                    <Icon aria-hidden className="text-primary size-5 shrink-0 opacity-50" />
                    <span className="whitespace-nowrap opacity-60">{label}</span>
                    <SoonTag className="ml-auto" />
                  </span>
                )}
              </li>
            ))}
          </ul>
        ))}
      </nav>
      <SidebarUser weddingId={weddingId} />
    </aside>
  );
}

/** Phones and tablets: a menu button that opens the same sections. */
export function WeddingMobileNav({ weddingId }: { weddingId: string }) {
  const groups = useNav(weddingId);
  const row =
    'flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-medium outline-none data-[highlighted]:bg-background';
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Open menu"
        className="hover:bg-background-alt focus-visible:ring-primary/25 -ml-2 rounded-full p-2 outline-none focus-visible:ring-3 lg:hidden"
      >
        <MenuIcon aria-hidden className="size-5" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="start" sideOffset={8}>
          <Menu.Popup className="border-border bg-surface rounded-card max-h-[80dvh] min-w-64 overflow-y-auto border p-1.5 shadow-lg outline-none">
            {groups.map((group, index) => (
              <div
                key={index}
                className={cn(index > 0 && 'border-border/60 mt-1.5 border-t pt-1.5')}
              >
                {group.map(({ href, label, icon: Icon, active }) =>
                  href ? (
                    <Menu.LinkItem
                      key={label}
                      render={<Link href={href} aria-current={active ? 'page' : undefined} />}
                      className={cn(
                        row,
                        'cursor-pointer',
                        active ? 'bg-primary-tint text-primary font-semibold' : 'text-text-muted',
                      )}
                    >
                      <Icon aria-hidden className="text-primary size-5 shrink-0" />
                      {label}
                    </Menu.LinkItem>
                  ) : (
                    <Menu.Item key={label} disabled className={cn(row, 'text-text-muted')}>
                      <Icon aria-hidden className="text-primary size-5 shrink-0 opacity-50" />
                      <span className="whitespace-nowrap opacity-60">{label}</span>
                      <SoonTag className="ml-auto" />
                    </Menu.Item>
                  ),
                )}
              </div>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
