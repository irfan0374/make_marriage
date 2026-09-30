import Link from 'next/link';
import { AuthShell } from './auth-shell';
import { SignupForm } from './signup-form';

export function SignupPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Start planning your wedding with your family."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
