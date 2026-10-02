import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import { requireSession } from '@/modules/auth';
import { findMembership } from './members.repository';
import { requireAdmin, resolveWeddingContext } from './members.service';

vi.mock('@/modules/auth', () => ({ requireSession: vi.fn() }));
vi.mock('./members.repository', () => ({
  findMembership: vi.fn(),
  findUserMemberships: vi.fn(),
  insertMembership: vi.fn(),
}));

const userId = new ObjectId();
const weddingId = new ObjectId();
const user = { id: userId.toHexString(), email: 'irfan@example.com', name: 'Irfan' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSession).mockResolvedValue({ userId, user });
});

describe('resolveWeddingContext', () => {
  it("returns the caller's role and side for a member", async () => {
    vi.mocked(findMembership).mockResolvedValueOnce({
      weddingId,
      userId,
      role: 'manager',
      sideScope: 'groom',
    } as never);
    const context = await resolveWeddingContext('token', weddingId);
    expect(context).toMatchObject({ userId, user, role: 'manager', sideScope: 'groom' });
    expect(context.weddingId.equals(weddingId)).toBe(true);
    expect(findMembership).toHaveBeenCalledWith(userId, weddingId);
  });

  it('answers 404, not 403, when the user is not a member', async () => {
    vi.mocked(findMembership).mockResolvedValueOnce(null);
    await expect(resolveWeddingContext('token', weddingId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('answers 401 without a session, before looking up any membership', async () => {
    vi.mocked(requireSession).mockRejectedValueOnce(new AppError('UNAUTHENTICATED'));
    await expect(resolveWeddingContext(undefined, weddingId)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(findMembership).not.toHaveBeenCalled();
  });
});

describe('requireAdmin', () => {
  it('lets admins through and stops managers with 403', () => {
    const base = { userId, user, weddingId: weddingId as never, sideScope: 'both' as const };
    expect(() => requireAdmin({ ...base, role: 'admin' })).not.toThrow();
    expect(() => requireAdmin({ ...base, role: 'manager' })).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });
});
