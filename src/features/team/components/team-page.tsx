'use client';

import { Clock, Info, Link2, Mail, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTeam } from '@/features/team/hooks';
import { useMe, useWedding } from '@/features/weddings/hooks';
import type { PendingInvite, TeamMember } from '@/modules/team/team.types';
import { cn } from '@/shared/cn';
import { InviteDialog } from './invite-dialog';
import { ROLE_LABELS, SIDE_LABELS } from './role-fields';
import {
  CancelInviteDialog,
  ChangeRoleDialog,
  NewLinkDialog,
  RemoveMemberDialog,
} from './team-dialogs';

// Team (Stitch "Team" and "Team (Manager view)"): admins manage members and invitations;
// Managers see who's on the team, read-only.

const card = 'border-border bg-surface rounded-card border';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : ''))
    .toUpperCase()
    .slice(0, 2);
}

function Pill({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode;
  tone?: 'plum' | 'muted';
}) {
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-0.5 text-xs font-medium',
        tone === 'plum' ? 'bg-primary-tint text-primary' : 'border-border text-text-muted border',
      )}
    >
      {children}
    </span>
  );
}

const monthYear = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(new Date(iso));

function expiresIn(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return days <= 1 ? 'Expires today' : `Expires in ${days} days`;
}

type Dialogs =
  | { kind: 'invite' }
  | { kind: 'role'; member: TeamMember }
  | { kind: 'remove'; member: TeamMember }
  | { kind: 'cancel'; invite: PendingInvite }
  | { kind: 'newLink'; invite: PendingInvite }
  | null;

export function TeamPage({ weddingId }: { weddingId: string }) {
  const { data: team, isPending, error, refetch } = useTeam(weddingId);
  const { data: wedding } = useWedding(weddingId);
  const { data: me } = useMe();
  const [dialog, setDialog] = useState<Dialogs>(null);

  const isAdmin = wedding?.me.role === 'admin';
  const sidesEnabled = wedding?.sidesEnabled ?? false;
  const weddingName = wedding ? `${wedding.brideName} & ${wedding.groomName}` : '';
  const archived = wedding?.status === 'archived';
  const canManage = isAdmin && !archived;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl">Team</h1>
          <p className="text-text-muted mt-1 text-sm">
            {isAdmin
              ? 'Family members who help plan the wedding. Only the couple can invite or change roles.'
              : "Who's helping plan this wedding. Only the couple can invite people or change roles."}
          </p>
        </div>
        {canManage && (
          <Button className="h-11 px-5" onClick={() => setDialog({ kind: 'invite' })}>
            <UserPlus aria-hidden />
            Invite someone
          </Button>
        )}
      </div>

      {isPending ? (
        <p role="status" className="text-text-muted py-12 text-center">
          Loading the team…
        </p>
      ) : error ? (
        <div role="alert" className="space-y-3 py-12 text-center">
          <p className="text-text-muted">We couldn&apos;t load the team.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-primary font-medium hover:underline"
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <section className={card} aria-labelledby="members-heading">
            <h2 id="members-heading" className="border-border border-b px-5 py-4 text-lg">
              Members ({team.members.length})
            </h2>
            <ul className="divide-border divide-y">
              {team.members.map((member) => {
                const isYou = member.user.id === me?.user.id;
                return (
                  <li key={member.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <span className="bg-primary-tint text-primary flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-medium">
                      {initials(member.user.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {member.user.name}
                        {isYou && <span className="text-text-muted font-normal"> (you)</span>}
                      </p>
                      <p className="text-text-muted truncate text-xs">{member.user.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={member.role === 'admin' ? 'plum' : 'muted'}>
                        {ROLE_LABELS[member.role]}
                      </Pill>
                      {sidesEnabled && <Pill>{SIDE_LABELS[member.sideScope]}</Pill>}
                      <span className="text-text-muted text-xs">
                        Joined {monthYear(member.joinedAt)}
                      </span>
                    </div>
                    {/* Not on your own row (Stitch design): ask your partner to change your role. */}
                    {canManage && !isYou && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          className="text-primary h-9 px-3"
                          onClick={() => setDialog({ kind: 'role', member })}
                        >
                          Change role
                        </Button>
                        <Button
                          variant="ghost"
                          className="text-danger-text hover:bg-danger-bg h-9 px-3"
                          onClick={() => setDialog({ kind: 'remove', member })}
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {team.pendingInvites && (
            <section className={card} aria-labelledby="pending-heading">
              <h2 id="pending-heading" className="border-border border-b px-5 py-4 text-lg">
                Pending invitations ({team.pendingInvites.length})
              </h2>
              {team.pendingInvites.length === 0 ? (
                <p className="text-text-muted px-5 py-6 text-sm">
                  No pending invitations. Invite your partner and family to plan together.
                </p>
              ) : (
                <ul className="divide-border divide-y">
                  {team.pendingInvites.map((invite) => (
                    <li key={invite.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                      <span className="bg-background-alt text-primary flex size-10 shrink-0 items-center justify-center rounded-full">
                        <Mail aria-hidden className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{invite.email}</p>
                        <p
                          className={cn(
                            'flex items-center gap-1 text-xs',
                            invite.expired ? 'text-danger-text' : 'text-text-muted',
                          )}
                        >
                          <Clock aria-hidden className="size-3" />
                          {invite.expired ? 'Expired' : expiresIn(invite.expiresAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone={invite.role === 'admin' ? 'plum' : 'muted'}>
                          {ROLE_LABELS[invite.role]}
                        </Pill>
                        {sidesEnabled && invite.role === 'manager' && (
                          <Pill>{SIDE_LABELS[invite.sideScope]}</Pill>
                        )}
                      </div>
                      {canManage && (
                        <div className="flex w-full gap-2 sm:w-auto">
                          <Button
                            variant="outline"
                            className="h-9 flex-1 px-4 sm:flex-none"
                            onClick={() => setDialog({ kind: 'newLink', invite })}
                          >
                            <Link2 aria-hidden />
                            Get new link
                          </Button>
                          <Button
                            variant="outline"
                            className="h-9 flex-1 px-4 sm:flex-none"
                            onClick={() => setDialog({ kind: 'cancel', invite })}
                          >
                            Cancel invitation
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-text-muted border-border flex gap-2 border-t px-5 py-3 text-xs">
                <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                Invite links are shown once. If one is lost, use Get new link. The old link stops
                working immediately.
              </p>
            </section>
          )}
        </>
      )}

      <InviteDialog
        open={dialog?.kind === 'invite'}
        onOpenChange={(open) => setDialog(open ? { kind: 'invite' } : null)}
        weddingId={weddingId}
        weddingName={weddingName}
        sidesEnabled={sidesEnabled}
      />
      {dialog?.kind === 'role' && (
        <ChangeRoleDialog
          member={dialog.member}
          weddingId={weddingId}
          sidesEnabled={sidesEnabled}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'remove' && (
        <RemoveMemberDialog
          member={dialog.member}
          weddingId={weddingId}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'cancel' && (
        <CancelInviteDialog
          invite={dialog.invite}
          weddingId={weddingId}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'newLink' && (
        <NewLinkDialog
          invite={dialog.invite}
          weddingId={weddingId}
          weddingName={weddingName}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
