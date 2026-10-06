'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { login, logout, signup } from '@/features/auth/api';
import { ApiError } from '@/shared/api-client';

/**
 * After logging in, signing up or logging out: forget everything loaded for the previous
 * account (who you are, weddings, team), then go on. Without this, the next account on the
 * same device briefly sees the previous one's data and roles until a reload. `refresh` makes
 * server-rendered pages read the new cookie too.
 */
function useSwitchAccount(path: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  return () => {
    queryClient.clear();
    router.replace(path);
    router.refresh();
  };
}

/** A 401 means the session is already gone, which is what logging out wanted anyway. */
function ignoreLoggedOut(request: () => Promise<void>) {
  return async () => {
    try {
      await request();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    }
  };
}

/** `next`: a page checked with `safeNextPath`, e.g. the invite being joined. */
export function useSignup(next: string | null = null) {
  const onSuccess = useSwitchAccount(next ?? '/app');
  return useMutation({ mutationFn: signup, onSuccess });
}

export function useLogin(next: string | null = null) {
  const onSuccess = useSwitchAccount(next ?? '/app');
  return useMutation({ mutationFn: login, onSuccess });
}

/** `then`: where to go afterwards, e.g. back to log in with another account. */
export function useLogout(then = '/login') {
  const onSuccess = useSwitchAccount(then);
  return useMutation({ mutationFn: ignoreLoggedOut(logout), onSuccess });
}
