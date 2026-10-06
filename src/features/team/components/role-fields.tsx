'use client';

import { useId } from 'react';
import type { Role, SideScope } from '@/modules/members/members.types';
import { cn } from '@/shared/cn';

// Choosing a role and a side, shared by the invite and change-role dialogs (Stitch designs).

export const ROLE_LABELS: Record<Role, string> = { admin: 'Admin', manager: 'Manager' };
export const SIDE_LABELS: Record<SideScope, string> = {
  bride: 'Bride side',
  groom: 'Groom side',
  both: 'Both sides',
};

const ROLES: { value: Role; title: string; text: string }[] = [
  {
    value: 'manager',
    title: 'Manager',
    text: "Family who helps plan: guests, events, tasks, expenses. Can't change wedding settings or the team.",
  },
  {
    value: 'admin',
    title: 'Admin',
    text: 'Your partner. Full control, including settings and team. A wedding can have 2 admins.',
  },
];

export function RoleCards({
  value,
  onChange,
  error,
}: {
  value: Role;
  onChange: (role: Role) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Role</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {ROLES.map((role) => (
          <label
            key={role.value}
            className={cn(
              'border-border rounded-card hover:border-primary/40 flex cursor-pointer flex-col gap-1 border p-4 transition-colors',
              'has-[:focus-visible]:ring-primary/25 has-[:focus-visible]:ring-3',
              value === role.value && 'border-primary bg-primary-tint/50',
            )}
          >
            <input
              type="radio"
              name={`${id}-role`}
              value={role.value}
              checked={value === role.value}
              onChange={() => onChange(role.value)}
              className="sr-only"
            />
            <span className="flex items-center gap-2 text-sm font-medium">
              <span
                aria-hidden
                className={cn(
                  'border-border flex size-4 items-center justify-center rounded-full border',
                  value === role.value && 'border-primary',
                )}
              >
                {value === role.value && <span className="bg-primary size-2 rounded-full" />}
              </span>
              {role.title}
            </span>
            <span className="text-text-muted text-xs leading-relaxed">{role.text}</span>
          </label>
        ))}
      </div>
      {error && <p className="text-danger-text text-xs">{error}</p>}
    </fieldset>
  );
}

export function SideChoice({
  value,
  onChange,
}: {
  value: SideScope;
  onChange: (side: SideScope) => void;
}) {
  const id = useId();
  const options: SideScope[] = ['bride', 'groom', 'both'];
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Which guests can they see?</legend>
      <div className="bg-background-alt grid grid-cols-3 gap-1 rounded-full p-1">
        {options.map((side) => (
          <label
            key={side}
            className={cn(
              'cursor-pointer rounded-full px-3 py-2 text-center text-sm transition-colors',
              'has-[:focus-visible]:ring-primary/25 has-[:focus-visible]:ring-3',
              value === side ? 'bg-surface text-primary font-medium shadow-sm' : 'text-text-muted',
            )}
          >
            <input
              type="radio"
              name={`${id}-side`}
              value={side}
              checked={value === side}
              onChange={() => onChange(side)}
              className="sr-only"
            />
            {SIDE_LABELS[side]}
          </label>
        ))}
      </div>
      <p className="text-text-muted text-xs">
        They&apos;ll only see and manage that side&apos;s guest families.
      </p>
    </fieldset>
  );
}
