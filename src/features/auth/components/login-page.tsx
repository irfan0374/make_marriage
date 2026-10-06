import Link from 'next/link';
import { authHref } from '@/shared/next-path';
import { AuthShell } from './auth-shell';
import { LoginForm } from './login-form';

export function LoginPage({ next = null, email }: { next?: string | null; email?: string | null }) {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to continue planning."
      footer={
        <>
          New here?{' '}
          <Link
            href={authHref('/signup', next, email)}
            className="text-primary font-medium hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm next={next} email={email} />
    </AuthShell>
  );
}
