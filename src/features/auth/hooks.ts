'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { login, logout, signup } from '@/features/auth/api';

/** After signing up or logging in, go to the app; refresh so server pages see the new cookie. */
function useGoTo(path: string) {
  const router = useRouter();
  return () => {
    router.replace(path);
    router.refresh();
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
  return useMutation({ mutationFn: logout, onSuccess });
}
