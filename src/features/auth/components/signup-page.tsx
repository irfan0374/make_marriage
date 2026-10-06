import Link from 'next/link';
import { authHref } from '@/shared/next-path';
import { AuthShell } from './auth-shell';
import { SignupForm } from './signup-form';

export function SignupPage({
  next = null,
  email,
}: {
  next?: string | null;
  email?: string | null;
}) {
  return (
    <AuthShell
      title="Create your account"
      subtitle={
        next?.startsWith('/join/')
          ? 'Create your account to join the wedding team.'
          : 'Start planning your wedding with your family.'
      }
      footer={
        <>
          Already have an account?{' '}
          <Link
            href={authHref('/login', next, email)}
            className="text-primary font-medium hover:underline"
          >
            Log in
          </Link>
        </>
      }
    >
      <SignupForm next={next} email={email} />
    </AuthShell>
  );
}
