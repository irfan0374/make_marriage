'use client';

import { Button } from '@/components/ui/button';
import { useLogout } from '@/features/auth/hooks';

export function LogoutButton() {
  const mutation = useLogout();
  return (
    <Button
      variant="outline"
      className="h-10 px-5"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? 'Logging out…' : 'Log out'}
    </Button>
  );
}
