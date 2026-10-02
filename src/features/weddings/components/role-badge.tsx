import type { Role } from '@/modules/members/members.types';

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className="bg-primary-tint text-primary rounded-full px-2.5 py-0.5 text-xs font-medium">
      {role === 'admin' ? 'Admin' : 'Manager'}
    </span>
  );
}
