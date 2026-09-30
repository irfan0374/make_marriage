'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { login, logout, logoutAll, signup } from '@/features/auth/api';
import { ApiError } from '@/shared/api-client';

/** After signing up or logging in, go to the app; refresh so server pages see the new cookie. */
function useGoTo(path: string) {
  const router = useRouter();
  return () => {
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

export function useSignup() {
  const onSuccess = useGoTo('/app');
  return useMutation({ mutationFn: signup, onSuccess });
}

export function useLogin() {
  const onSuccess = useGoTo('/app');
  return useMutation({ mutationFn: login, onSuccess });
}

export function useLogout() {
  const onSuccess = useGoTo('/login');
  return useMutation({ mutationFn: ignoreLoggedOut(logout), onSuccess });
}

export function useLogoutAll() {
  const onSuccess = useGoTo('/login');
  return useMutation({ mutationFn: ignoreLoggedOut(logoutAll), onSuccess });
}
