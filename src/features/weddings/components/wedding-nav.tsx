'use client';

import { Menu } from '@base-ui/react/menu';
import { LayoutDashboard, Menu as MenuIcon, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/common/logo';
import { useWedding } from '@/features/weddings/hooks';
import { cn } from '@/shared/cn';

// The app's sections inside a wedding. Only what's built is listed; each new section is added
// here as it ships (events, guests, ...). Settings is for admins only.

function navItems(weddingId: string, isAdmin: boolean) {
  const base = `/app/${weddingId}`;
  return [
    { href: base, label: 'Overview', icon: LayoutDashboard, exact: true },
    { href: `${base}/team`, label: 'Team', icon: Users, exact: false },
    ...(isAdmin
      ? [{ href: `${base}/settings`, label: 'Settings', icon: Settings, exact: false }]
      : []),
  ];
}

function useNav(weddingId: string) {
  const pathname = usePathname();
  const { data: wedding } = useWedding(weddingId);
  return navItems(weddingId, wedding?.me.role === 'admin').map((item) => ({
    ...item,
    active: item.exact ? pathname === item.href : pathname.startsWith(item.href),
  }));
}

/** Desktop: a sidebar with the logo and sections. */
export function WeddingSidebar({ weddingId }: { weddingId: string }) {
  const items = useNav(weddingId);
  return (
    <aside className="border-border bg-surface sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r lg:flex">
      <div className="flex h-16 items-center px-6">
        <Logo href="/app" height={30} eager />
      </div>
      <nav aria-label="Wedding" className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {items.map(({ href, label, icon: Icon, active }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-full px-4 py-2.5 text-sm transition-colors',
                  active
                    ? 'bg-primary-tint text-primary font-medium'
                    : 'text-text-muted hover:bg-background-alt hover:text-text',
                )}
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

/** Phones and tablets: a menu button that opens the same sections. */
export function WeddingMobileNav({ weddingId }: { weddingId: string }) {
  const items = useNav(weddingId);
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
          <Menu.Popup className="border-border bg-surface rounded-card min-w-56 border p-1.5 shadow-lg outline-none">
            {items.map(({ href, label, icon: Icon, active }) => (
              <Menu.LinkItem
                key={href}
                render={<Link href={href} aria-current={active ? 'page' : undefined} />}
                className={cn(
                  'data-[highlighted]:bg-background-alt rounded-input flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm outline-none',
                  active && 'text-primary font-medium',
                )}
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </Menu.LinkItem>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
