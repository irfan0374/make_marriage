import type { LoginInput, PublicUser, SignupInput } from '@/modules/auth/auth.types';
import { postJson } from '@/shared/api-client';

export const signup = (input: SignupInput) =>
  postJson<{ user: PublicUser }>('/api/auth/signup', input);
export const login = (input: LoginInput) =>
  postJson<{ user: PublicUser }>('/api/auth/login', input);
export const logout = () => postJson<void>('/api/auth/logout');
