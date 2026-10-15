'use client';

import { Dialog } from '@base-ui/react/dialog';
import {
  CalendarDays,
  Globe,
  Images,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mail,
  Menu as MenuIcon,
  X,
  Settings,
  Store,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/common/logo';
import { SoonTag } from '@/components/common/soon-tag';
import { useLogout } from '@/features/auth/hooks';
import { useMe, useWedding } from '@/features/weddings/hooks';
import { cn } from '@/shared/cn';
import { daysUntil, formatDate } from '@/shared/dates';
import { initials } from './account-menu';

// The app's sections inside a wedding (Stitch "Dashboard" sidebar): a sidebar on desktop and the
// same content in a drawer on phones and tablets, which closes as soon as a section is picked.
// Sections not built yet are faded with a "Soon" tag and can't be clicked; give one an `href`
// when it ships. Settings is for admins only.

interface NavItem {
  label: string;
  icon: LucideIcon;
  /** `null` while the section isn't built ("Soon"). */
  href: string | null;
  exact?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

function navGroups(weddingId: string, isAdmin: boolean): NavGroup[] {
  const base = `/app/${weddingId}`;
  return [
    {
      label: 'Planning',
      items: [
        { label: 'Dashboard', icon: LayoutDashboard, href: base, exact: true },
        { label: 'Events', icon: CalendarDays, href: `${base}/events` },
        { label: 'Guests', icon: Users, href: `${base}/guests` },
        { label: 'Invitations & RSVP', icon: Mail, href: `${base}/invitations` },
        { label: 'Tasks', icon: ListChecks, href: `${base}/tasks` },
        { label: 'Expenses', icon: Wallet, href: `${base}/expenses` },
        { label: 'Vendors', icon: Store, href: `${base}/vendors` },
        { label: 'Website', icon: Globe, href: `${base}/website` },
        { label: 'Photo Gallery', icon: Images, href: `${base}/gallery` },
      ],
    },
    {
      label: 'Your wedding',
      items: [
        { label: 'Team', icon: UsersRound, href: `${base}/team` },
        ...(isAdmin ? [{ label: 'Settings', icon: Settings, href: `${base}/settings` }] : []),
      ],
    },
  ];
}

function useNav(weddingId: string) {
  const pathname = usePathname();
  const { data: wedding } = useWedding(weddingId);
  return navGroups(weddingId, wedding?.me.role === 'admin').map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      active:
        item.href !== null &&
        (item.exact ? pathname === item.href : pathname.startsWith(item.href)),
    })),
  }));
}

/** The wedding at the top of the menu: the couple, the date and how many days are left. */
function WeddingCard({ weddingId }: { weddingId: string }) {
  const { data: wedding } = useWedding(weddingId);
  if (!wedding) return <div className="bg-background-alt mx-3 h-[74px] rounded-xl" />;
  const days = daysUntil(wedding.weddingDate, wedding.timezone);
  return (
    <div className="bg-primary text-primary-foreground relative mx-3 overflow-hidden rounded-xl px-4 py-3 shadow-sm">
      <span
        aria-hidden
        className="border-gold/40 absolute -top-6 -right-6 size-20 rounded-full border-[3px]"
      />
      <span
        aria-hidden
        className="border-gold/25 absolute -top-3 right-5 size-14 rounded-full border-[3px]"
      />
      <p className="font-heading relative truncate text-base leading-tight">
        {wedding.brideName} &amp; {wedding.groomName}
      </p>
      <p className="relative mt-1 flex items-center gap-1.5 text-[11px] text-white/75">
        <span>{formatDate(wedding.weddingDate)}</span>
        {days >= 0 && (
          <>
            <span className="bg-gold size-1 rounded-full" />
            <span className="text-gold font-semibold">
              {days === 0 ? 'Today!' : `${days.toLocaleString('en-IN')} days to go`}
            </span>
          </>
        )}
      </p>
    </div>
  );
}

/** The sections, grouped; `onNavigate` runs when one is picked (the drawer closes). */
function NavSections({ weddingId, onNavigate }: { weddingId: string; onNavigate?: () => void }) {
  const groups = useNav(weddingId);
  return (
    <nav aria-label="Wedding" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="text-text-muted/80 mb-1.5 px-3 text-[10px] font-semibold tracking-[0.14em] uppercase">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map(({ href, label, icon: Icon, active }) => (
              <li key={label}>
                {href ? (
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all',
                      active
                        ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                        : 'text-text-muted hover:bg-primary-tint hover:text-primary font-medium',
                    )}
                  >
                    <Icon
                      aria-hidden
                      className={cn(
                        'size-[18px] shrink-0 transition-colors',
                        active ? 'text-gold' : 'text-text-muted group-hover:text-primary',
                      )}
                    />
                    {label}
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="text-text-muted flex cursor-default items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium"
                  >
                    <Icon aria-hidden className="size-[18px] shrink-0 opacity-50" />
                    <span className="whitespace-nowrap opacity-60">{label}</span>
                    <SoonTag className="ml-auto" />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Who's signed in, their role on this wedding, and log out (bottom of the menu). */
function SidebarUser({ weddingId }: { weddingId: string }) {
  const { data: me } = useMe();
  const { data: wedding } = useWedding(weddingId);
  const logout = useLogout();
  if (!me) return null;
  return (
    <div className="border-border/60 border-t p-3">
      <div className="bg-background flex items-center justify-between gap-2 rounded-xl p-2.5">
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
          className="text-text-muted hover:text-danger-text hover:bg-danger-bg rounded-lg p-1.5 transition-colors"
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

/** Desktop: a sidebar with the logo, the wedding, sections, and who's signed in. */
export function WeddingSidebar({ weddingId }: { weddingId: string }) {
  return (
    <aside className="border-border/70 bg-surface shadow-chrome sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r lg:flex">
      <div className="flex items-center px-6 pt-6 pb-5">
        <Logo href="/app" height={32} eager />
      </div>
      <WeddingCard weddingId={weddingId} />
      <NavSections weddingId={weddingId} />
      <SidebarUser weddingId={weddingId} />
    </aside>
  );
}

/**
 * Phones and tablets: a menu button that slides in the same menu from the left. It closes when a
 * section is picked, when the page changes, on the backdrop or with Escape.
 */
export function WeddingMobileNav({ weddingId }: { weddingId: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [shownFor, setShownFor] = useState(pathname);
  // A new page (also from the back button) closes the menu.
  if (pathname !== shownFor) {
    setShownFor(pathname);
    if (open) setOpen(false);
  }
  // Wide screens show the sidebar instead.
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1024px)');
    const onChange = () => wide.matches && setOpen(false);
    wide.addEventListener('change', onChange);
    return () => wide.removeEventListener('change', onChange);
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label="Open menu"
        className="hover:bg-background-alt focus-visible:ring-primary/25 -ml-2 rounded-full p-2 outline-none focus-visible:ring-3 lg:hidden"
      >
        <MenuIcon aria-hidden className="size-5" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="bg-text/40 fixed inset-0 z-50 backdrop-blur-[2px] transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 lg:hidden" />
        <Dialog.Popup className="bg-surface fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[85vw] flex-col shadow-2xl transition-transform duration-200 ease-out outline-none data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full lg:hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-4">
            <Logo href="/app" height={28} />
            <Dialog.Close
              aria-label="Close menu"
              className="text-text-muted hover:bg-background-alt hover:text-text rounded-full p-2 transition-colors"
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>
          <Dialog.Title className="sr-only">Menu</Dialog.Title>
          <WeddingCard weddingId={weddingId} />
          <NavSections weddingId={weddingId} onNavigate={() => setOpen(false)} />
          <SidebarUser weddingId={weddingId} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
