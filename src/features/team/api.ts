import type { ChangeMemberInput, CreateInviteInput } from '@/modules/team/team.types';
import type { InviteLink, Team, TeamMember } from '@/modules/team/team.types';
import { apiFetch, postJson } from '@/shared/api-client';

const base = (weddingId: string) => `/api/weddings/${weddingId}/members`;

export const getTeam = (weddingId: string) => apiFetch<Team>(base(weddingId));
export const createInvite = (weddingId: string, input: CreateInviteInput) =>
  postJson<InviteLink>(`${base(weddingId)}/invites`, input);
export const renewInvite = (weddingId: string, inviteId: string) =>
  postJson<InviteLink>(`${base(weddingId)}/invites/${inviteId}/resend`);
export const cancelInvite = (weddingId: string, inviteId: string) =>
  apiFetch<void>(`${base(weddingId)}/invites/${inviteId}`, { method: 'DELETE' });
export const changeMember = (weddingId: string, memberId: string, input: ChangeMemberInput) =>
  apiFetch<TeamMember>(`${base(weddingId)}/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
export const removeMember = (weddingId: string, memberId: string) =>
  apiFetch<void>(`${base(weddingId)}/${memberId}`, { method: 'DELETE' });
export const acceptInvite = (token: string) =>
  postJson<{ weddingId: string }>(`/api/member-invites/${token}/accept`);
