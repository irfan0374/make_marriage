'use client';

import { useState } from 'react';
import { FormAlert } from '@/components/common/form-field';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  useCancelInvite,
  useChangeMember,
  useRemoveMember,
  useRenewInvite,
} from '@/features/team/hooks';
import type { Role, SideScope } from '@/modules/members/members.types';
import type { InviteLink, PendingInvite, TeamMember } from '@/modules/team/team.types';
import { ApiError } from '@/shared/api-client';
import { InviteLinkReady } from './invite-link-ready';
import { RoleCards, SideChoice } from './role-fields';

function messageOf(error: unknown): string | null {
  if (!error) return null;
  return error instanceof ApiError
    ? error.message
    : 'Could not reach the server. Check your connection and try again.';
}

/** "Change role for Ahmed" (Stitch): role cards and, for Managers, which side they see. */
export function ChangeRoleDialog({
  member,
  weddingId,
  sidesEnabled,
  onClose,
}: {
  member: TeamMember;
  weddingId: string;
  sidesEnabled: boolean;
  onClose: () => void;
}) {
  const mutation = useChangeMember(weddingId);
  const [role, setRole] = useState<Role>(member.role);
  const [sideScope, setSideScope] = useState<SideScope>(member.sideScope);
  const unchanged = role === member.role && (role === 'admin' || sideScope === member.sideScope);

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Change role for ${member.user.name}`}
      description="The change applies the next time they open the app."
      footer={
        <>
          <Button variant="outline" className="h-11 px-6" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="h-11 px-6"
            disabled={unchanged || mutation.isPending}
            onClick={() =>
              mutation.mutate(
                { memberId: member.id, input: { role, sideScope } },
                { onSuccess: onClose },
              )
            }
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <FormAlert message={messageOf(mutation.error)} />
        <RoleCards value={role} onChange={setRole} />
        {sidesEnabled && role === 'manager' && (
          <SideChoice value={sideScope} onChange={setSideScope} />
        )}
      </div>
    </Dialog>
  );
}

/** "Cancel this invitation?" (Stitch): their link stops working. */
export function CancelInviteDialog({
  invite,
  weddingId,
  onClose,
}: {
  invite: PendingInvite;
  weddingId: string;
  onClose: () => void;
}) {
  const mutation = useCancelInvite(weddingId);
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Cancel this invitation?"
      description={`${invite.email} won't be able to join with their link. You can invite them again later.`}
      footer={
        <>
          <Button variant="outline" className="h-11 px-6" onClick={onClose}>
            Keep invitation
          </Button>
          <Button
            variant="destructive"
            className="h-11 px-6"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(invite.id, { onSuccess: onClose })}
          >
            {mutation.isPending ? 'Cancelling…' : 'Cancel invitation'}
          </Button>
        </>
      }
    >
      <FormAlert message={messageOf(mutation.error)} />
    </Dialog>
  );
}

/** "Get new link": replaces the link (the old one stops working) and emails it again. */
export function NewLinkDialog({
  invite,
  weddingId,
  weddingName,
  onClose,
}: {
  invite: PendingInvite;
  weddingId: string;
  weddingName: string;
  onClose: () => void;
}) {
  const mutation = useRenewInvite(weddingId);
  const [result, setResult] = useState<InviteLink | null>(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={result ? 'New invite link ready' : 'Get a new link?'}
      description={
        result
          ? undefined
          : `We'll make a new link for ${invite.email}, valid for 7 days, and email it to them. The old link stops working.`
      }
      footer={
        result ? (
          <Button className="h-11 px-6" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="outline" className="h-11 px-6" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="h-11 px-6"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(invite.id, { onSuccess: setResult })}
            >
              {mutation.isPending ? 'Sending…' : 'Get new link'}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <InviteLinkReady result={result} weddingName={weddingName} />
      ) : (
        <FormAlert message={messageOf(mutation.error)} />
      )}
    </Dialog>
  );
}

/** "Remove Ahmed from the wedding team?": they lose access right away and can be invited again. */
export function RemoveMemberDialog({
  member,
  weddingId,
  onClose,
}: {
  member: TeamMember;
  weddingId: string;
  onClose: () => void;
}) {
  const mutation = useRemoveMember(weddingId);
  const partner = member.role === 'admin';
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Remove ${member.user.name} from the wedding team?`}
      description={
        partner
          ? `${member.user.name} is an admin. They'll lose all access to this wedding right away, including settings and the team. You can invite them again later.`
          : `They'll lose access to this wedding right away. You can invite them again later.`
      }
      footer={
        <>
          <Button variant="outline" className="h-11 px-6" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="h-11 px-6"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(member.id, { onSuccess: onClose })}
          >
            {mutation.isPending ? 'Removing…' : 'Remove'}
          </Button>
        </>
      }
    >
      <FormAlert message={messageOf(mutation.error)} />
    </Dialog>
  );
}
