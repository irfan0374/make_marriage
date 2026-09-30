'use client';

import { Button } from '@/components/ui/button';
import { useLogout, useLogoutAll } from '@/features/auth/hooks';

const FAILED = 'Could not log out. Please try again.';

export function LogoutButton() {
  const mutation = useLogout();
  return (
    <div className="relative">
      <Button
        variant="outline"
        className="h-10 px-5"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? 'Logging out…' : 'Log out'}
      </Button>
      {mutation.isError && (
        <p
          role="alert"
          className="text-danger-text absolute top-full right-0 mt-1 text-xs whitespace-nowrap"
        >
          {FAILED}
        </p>
      )}
    </div>
  );
}

/** "Log out of all devices" (architecture §6.1): ends every session, including this one. */
export function LogoutAllButton() {
  const mutation = useLogoutAll();
  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        variant="link"
        className="h-auto p-0"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? 'Logging out of all devices…' : 'Log out of all devices'}
      </Button>
      {mutation.isError && (
        <p role="alert" className="text-danger-text text-xs">
          {FAILED}
        </p>
      )}
    </div>
  );
}
