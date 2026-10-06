'use client';

import { CircleAlert, CircleCheck, Clock, Link2Off, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormAlert } from '@/components/common/form-field';
import { Logo } from '@/components/common/logo';
import { Button, buttonVariants } from '@/components/ui/button';
import { APP_NAME } from '@/config/app';
import { useLogout } from '@/features/auth/hooks';
import { useAcceptInvite } from '@/features/team/hooks';
import type { InvitePreview, InviteProblem, JoinPageState } from '@/modules/team/team.types';
import { ApiError } from '@/shared/api-client';
import { cn } from '@/shared/cn';
import { authHref } from '@/shared/next-path';
import { ROLE_LABELS, SIDE_LABELS } from './role-fields';

// `/join/{token}` (Stitch "Join wedding" states): log in or sign up, join, or a clear message
// when the link can't be used.

const PROBLEMS: Record<InviteProblem, { title: string; text: string }> = {
  expired: {
    title: 'This invite has expired',
    text: 'Invite links work for 7 days. Ask the couple for a new link.',
  },
  cancelled: {
    title: 'This invite was cancelled',
    text: 'Ask the couple to invite you again if you should have access.',
  },
  used: {
    title: 'This invite was already used',
    text: 'If that was you, log in to open the wedding.',
  },
  unknown: {
    title: "This invite link isn't valid",
    text: 'Check that you opened the whole link, or ask the couple for a new one.',
  },
};

function roleText(invite: InvitePreview) {
  const side = invite.sideScope ? ` (${SIDE_LABELS[invite.sideScope]})` : '';
  return `${ROLE_LABELS[invite.role]}${side}`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center px-5 py-10 md:py-16">
      <Logo height={36} eager />
      <main className="border-border bg-surface rounded-card mt-8 w-full max-w-md border p-6 shadow-sm md:p-8">
        {children}
      </main>
      <p className="text-text-muted mt-6 text-xs">{APP_NAME} · Private and secure</p>
    </div>
  );
}

function Heading({ invite }: { invite: InvitePreview }) {
  return (
    <>
      <p className="text-text-muted flex items-center gap-2 text-xs font-medium tracking-[0.12em] uppercase">
        <span aria-hidden className="bg-gold size-1.5 rounded-full" />
        You&apos;re invited
      </p>
      <h1 className="mt-3 text-2xl md:text-3xl">Join {invite.weddingName}&apos;s wedding team</h1>
      <p className="text-text-muted mt-3 text-sm leading-relaxed">
        {invite.invitedByName} invited <strong className="text-text">{invite.invitedEmail}</strong>{' '}
        as <strong className="text-text">{roleText(invite)}</strong>.
      </p>
    </>
  );
}

function JoinButton({ token }: { token: string }) {
  const router = useRouter();
  const mutation = useAcceptInvite();
  const error = mutation.error;
  const message =
    error instanceof ApiError
      ? error.code === 'ALREADY_HAS_WEDDING'
        ? "You're already an admin of your own wedding, so you can't join another as an admin. Ask the couple to invite you as a Manager."
        : error.message
      : error
        ? 'Could not reach the server. Check your connection and try again.'
        : null;
  return (
    <div className="space-y-4">
      <FormAlert message={message} />
      <Button
        className="h-11 w-full"
        disabled={mutation.isPending || mutation.isSuccess}
        onClick={() =>
          mutation.mutate(token, {
            onSuccess: ({ weddingId }) => {
              router.replace(`/app/${weddingId}`);
              router.refresh();
            },
          })
        }
      >
        {mutation.isPending || mutation.isSuccess ? 'Joining…' : 'Join wedding'}
      </Button>
    </div>
  );
}

function SwitchAccountButton({ token, email }: { token: string; email: string }) {
  const logout = useLogout(authHref('/login', `/join/${token}`, email));
  return (
    <Button className="h-11 w-full" disabled={logout.isPending} onClick={() => logout.mutate()}>
      {logout.isPending ? 'Logging out…' : 'Log out and switch account'}
    </Button>
  );
}

export function JoinCard({ token, page }: { token: string; page: JoinPageState }) {
  if (page.state === 'problem') {
    const { title, text } = PROBLEMS[page.problem];
    const Icon = page.problem === 'expired' ? Clock : Link2Off;
    return (
      <Shell>
        <span className="bg-background-alt text-text-muted flex size-11 items-center justify-center rounded-full">
          <Icon aria-hidden className="size-5" />
        </span>
        <h1 className="mt-5 text-2xl">{title}</h1>
        <p className="text-text-muted mt-2 text-sm">{text}</p>
        {page.problem === 'used' && (
          <Link href="/login" className={cn(buttonVariants(), 'mt-6 h-11 w-full')}>
            Log in
          </Link>
        )}
      </Shell>
    );
  }

  const { invite } = page;
  const next = `/join/${token}`;

  if (page.state === 'logged_out') {
    return (
      <Shell>
        <Heading invite={invite} />
        <div className="mt-7 space-y-3">
          <Link
            href={authHref('/signup', next, invite.invitedEmail)}
            className={cn(buttonVariants(), 'h-11 w-full')}
          >
            Create an account
          </Link>
          <Link
            href={authHref('/login', next, invite.invitedEmail)}
            className={cn(buttonVariants({ variant: 'outline' }), 'h-11 w-full')}
          >
            I already have an account. Log in
          </Link>
        </div>
        <p className="text-text-muted mt-5 flex gap-2 text-xs">
          <MailCheck aria-hidden className="size-4 shrink-0" />
          Use {invite.invitedEmail} so the invite matches.
        </p>
      </Shell>
    );
  }

  if (page.state === 'mismatch') {
    return (
      <Shell>
        <span className="bg-pending-bg text-pending-text flex size-11 items-center justify-center rounded-full">
          <CircleAlert aria-hidden className="size-5" />
        </span>
        <h1 className="mt-5 text-2xl">This invite is for a different email</h1>
        <p className="text-text-muted mt-2 text-sm leading-relaxed">
          It was sent to <strong className="text-text">{invite.invitedEmail}</strong>, but
          you&apos;re logged in as <strong className="text-text">{page.currentEmail}</strong>.
        </p>
        <div className="mt-6 space-y-3">
          <SwitchAccountButton token={token} email={invite.invitedEmail} />
          <Link
            href="/app"
            className="text-primary block text-center text-sm font-medium hover:underline"
          >
            Go to my weddings
          </Link>
        </div>
      </Shell>
    );
  }

  if (page.state === 'member') {
    return (
      <Shell>
        <span className="bg-primary-tint text-primary flex size-11 items-center justify-center rounded-full">
          <CircleCheck aria-hidden className="size-5" />
        </span>
        <h1 className="mt-5 text-2xl">You&apos;re already on this team</h1>
        <p className="text-text-muted mt-2 text-sm">
          You&apos;re a member of {invite.weddingName}&apos;s wedding.
        </p>
        <Link href={`/app/${page.weddingId}`} className={cn(buttonVariants(), 'mt-6 h-11 w-full')}>
          Open the wedding
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <Heading invite={invite} />
      <p className="text-text-muted mt-2 text-sm">You&apos;re logged in as {page.currentEmail}.</p>
      <div className="mt-7">
        <JoinButton token={token} />
      </div>
    </Shell>
  );
}
