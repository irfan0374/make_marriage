import { Logo } from '@/components/common/logo';
import { LogoutButton } from './logout-button';

// Placeholder for the wedding picker (architecture §4.5 `app/page.tsx`) until weddings exist.
export function AppHome({ name }: { name: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-border border-b">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 md:px-8">
          <Logo eager />
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-3 px-5 py-16 text-center">
        <h1 className="text-3xl">Hi {name}, you&apos;re logged in</h1>
        <p className="text-text-muted">
          Creating your wedding comes next. For now, this is where your weddings will appear.
        </p>
      </main>
    </div>
  );
}
