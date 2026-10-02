import { Logo } from '@/components/common/logo';
import { AccountMenu } from './account-menu';

/** Header for app pages outside a wedding (create a wedding, the wedding picker). */
export function SimpleHeader() {
  return (
    <header className="border-border border-b">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 md:px-8">
        <Logo href="/app" height={36} eager />
        <AccountMenu />
      </div>
    </header>
  );
}
