import Link from 'next/link';
import { AuthShell } from './auth-shell';
import { LoginForm } from './login-form';

export function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to continue planning."
      footer={
        <>
          New here?{' '}
          <Link href="/signup" className="text-primary font-medium hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
