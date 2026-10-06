'use client';

import { useState } from 'react';
import { FormAlert, FormField } from '@/components/common/form-field';
import { useForm } from '@/components/common/use-form';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useCreateInvite } from '@/features/team/hooks';
import { EMAIL_MAX } from '@/modules/auth/auth.schemas';
import type { Role, SideScope } from '@/modules/members/members.types';
import { createInviteSchema } from '@/modules/team/team.schemas';
import type { InviteLink } from '@/modules/team/team.types';
import { InviteLinkReady } from './invite-link-ready';
import { RoleCards, SideChoice } from './role-fields';

// "Invite someone" (Stitch): email, role and side, then the link-ready step.

function InviteForm({
  weddingId,
  sidesEnabled,
  onDone,
  onCancel,
}: {
  weddingId: string;
  sidesEnabled: boolean;
  onDone: (result: InviteLink) => void;
  onCancel: () => void;
}) {
  const mutation = useCreateInvite(weddingId);
  const { formRef, fieldErrors, formError, validate, showError, onInput } = useForm(
    createInviteSchema,
    { ALREADY_MEMBER: 'email', INVITE_PENDING: 'email', ADMIN_LIMIT_REACHED: 'role' },
  );
  const [role, setRole] = useState<Role>('manager');
  const [sideScope, setSideScope] = useState<SideScope>('both');

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = validate({ email: form.get('email'), role, sideScope });
    if (input) mutation.mutate(input, { onError: showError, onSuccess: onDone });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} onInput={onInput} noValidate className="space-y-5">
      <FormAlert message={formError} />
      <FormField
        label="Email address"
        name="email"
        type="email"
        autoComplete="off"
        maxLength={EMAIL_MAX}
        placeholder="someone@example.com"
        error={fieldErrors.email}
      />
      <RoleCards value={role} onChange={setRole} error={fieldErrors.role} />
      {sidesEnabled && role === 'manager' && (
        <SideChoice value={sideScope} onChange={setSideScope} />
      )}
      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="h-11 px-6" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="h-11 px-6" disabled={mutation.isPending}>
          {mutation.isPending ? 'Sending…' : 'Send invitation'}
        </Button>
      </div>
    </form>
  );
}

export function InviteDialog({
  open,
  onOpenChange,
  weddingId,
  weddingName,
  sidesEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weddingId: string;
  weddingName: string;
  sidesEnabled: boolean;
}) {
  const [result, setResult] = useState<InviteLink | null>(null);

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) setResult(null); // Next time, start with an empty form.
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={result ? 'Invite link ready' : 'Invite someone to your wedding team'}
      description={result ? undefined : 'They’ll get an email with a link to join.'}
      footer={
        result ? (
          <Button className="h-11 px-6" onClick={() => close(false)}>
            Done
          </Button>
        ) : undefined
      }
    >
      {result ? (
        <InviteLinkReady result={result} weddingName={weddingName} />
      ) : (
        <InviteForm
          weddingId={weddingId}
          sidesEnabled={sidesEnabled}
          onDone={setResult}
          onCancel={() => close(false)}
        />
      )}
    </Dialog>
  );
}
