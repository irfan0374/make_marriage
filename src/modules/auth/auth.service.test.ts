import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import { enforceRateLimits } from '@/lib/rate-limit';
import { sha256Hex } from '@/lib/tokens';
import * as repo from './auth.repository';
import { getSession, login, requireSession, SESSION_TTL_MS, signup } from './auth.service';
import type { SessionDocument, UserDocument } from './auth.types';

vi.mock('./auth.repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./auth.repository')>();
  return {
    DuplicateEmailError: actual.DuplicateEmailError,
    insertUser: vi.fn(),
    findUserByEmail: vi.fn(),
    findUserById: vi.fn(),
    recordLogin: vi.fn(),
    insertSession: vi.fn(),
    findActiveSession: vi.fn(),
    extendSession: vi.fn(),
    deleteSession: vi.fn(),
    deleteUserSessions: vi.fn(),
  };
});
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  enforceRateLimits: vi.fn(),
}));

const client = { ip: '203.0.113.7', userAgent: 'Vitest' };
const now = new Date('2026-09-30T06:00:00Z');

function userDoc(overrides: Partial<UserDocument> = {}): UserDocument {
  return {
    _id: new ObjectId(),
    email: 'irfan@example.com',
    name: 'Irfan',
    passwordHash: '',
    lastLoginAt: null,
    passwordChangedAt: null,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.insertUser).mockImplementation(async (input) =>
    userDoc({ email: input.email, name: input.name, passwordHash: input.passwordHash }),
  );
});

async function signedUp(password = 'correct-horse-42') {
  await signup({ name: 'Irfan', email: 'irfan@example.com', password }, client, now);
  return vi.mocked(repo.insertUser).mock.calls[0]![0];
}

describe('signup', () => {
  it('stores an Argon2id hash, never the password, and starts a 30-day session', async () => {
    const result = await signup(
      { name: 'Irfan', email: 'irfan@example.com', password: 'correct-horse-42' },
      client,
      now,
    );
    const stored = vi.mocked(repo.insertUser).mock.calls[0]![0];
    expect(stored.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(stored.passwordHash).not.toContain('correct-horse-42');

    expect(result.user).toEqual({
      id: expect.any(String),
      email: 'irfan@example.com',
      name: 'Irfan',
    });
    expect(result.expiresAt.getTime()).toBe(now.getTime() + SESSION_TTL_MS);
    // Only the hash of the session token reaches the database.
    const session = vi.mocked(repo.insertSession).mock.calls[0]![0];
    expect(session.tokenHash).toBe(sha256Hex(result.token));
    expect(session.tokenHash).not.toBe(result.token);
  });

  it('rate-limits by IP: 5 per hour', async () => {
    await signedUp();
    expect(enforceRateLimits).toHaveBeenCalledWith(
      [{ key: 'signup:ip:203.0.113.7', limit: 5, windowMs: 3_600_000 }],
      now,
    );
  });

  it('rejects common passwords with WEAK_PASSWORD', async () => {
    await expect(
      signup({ name: 'Irfan', email: 'irfan@example.com', password: 'Password123' }, client, now),
    ).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
    expect(repo.insertUser).not.toHaveBeenCalled();
    // A weak password doesn't use up the sign-up limit.
    expect(enforceRateLimits).not.toHaveBeenCalled();
  });

  it('returns EMAIL_TAKEN when the email already has an account', async () => {
    vi.mocked(repo.insertUser).mockRejectedValueOnce(new repo.DuplicateEmailError());
    await expect(
      signup(
        { name: 'Irfan', email: 'irfan@example.com', password: 'correct-horse-42' },
        client,
        now,
      ),
    ).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
  });
});

describe('login', () => {
  it('logs in with the right password and records the login', async () => {
    const { passwordHash } = await signedUp();
    const user = userDoc({ passwordHash });
    vi.mocked(repo.findUserByEmail).mockResolvedValueOnce(user);

    const result = await login(
      { email: 'irfan@example.com', password: 'correct-horse-42' },
      client,
      now,
    );
    expect(result.user.id).toBe(user._id.toHexString());
    expect(repo.recordLogin).toHaveBeenCalledWith(user._id, now);
  });

  it('gives the same INVALID_CREDENTIALS for a wrong password and an unknown email', async () => {
    const { passwordHash } = await signedUp();
    vi.mocked(repo.findUserByEmail).mockResolvedValueOnce(userDoc({ passwordHash }));
    const wrongPassword = await login(
      { email: 'irfan@example.com', password: 'wrong-password' },
      client,
      now,
    ).catch((e: AppError) => e);

    vi.mocked(repo.findUserByEmail).mockResolvedValueOnce(null);
    const unknownEmail = await login(
      { email: 'nobody@example.com', password: 'wrong-password' },
      client,
      now,
    ).catch((e: AppError) => e);

    for (const error of [wrongPassword, unknownEmail]) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 });
    }
    expect((wrongPassword as AppError).message).toBe((unknownEmail as AppError).message);
    expect(repo.insertSession).toHaveBeenCalledTimes(1); // only the sign-up's session
  });

  it('rate-limits by email (5 per 15 min) and by IP (20 per 15 min)', async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValueOnce(null);
    await login({ email: 'irfan@example.com', password: 'x' }, client, now).catch(() => {});
    expect(enforceRateLimits).toHaveBeenCalledWith(
      [
        { key: 'login:email:irfan@example.com', limit: 5, windowMs: 900_000 },
        { key: 'login:ip:203.0.113.7', limit: 20, windowMs: 900_000 },
      ],
      now,
    );
  });

  it('stops before checking the password when rate-limited', async () => {
    vi.mocked(enforceRateLimits).mockRejectedValueOnce(new AppError('RATE_LIMITED'));
    await expect(
      login({ email: 'irfan@example.com', password: 'x' }, client, now),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(repo.findUserByEmail).not.toHaveBeenCalled();
  });
});

describe('sessions', () => {
  function sessionDoc(lastSeenAt: Date, userId = new ObjectId()): SessionDocument {
    return {
      _id: new ObjectId(),
      tokenHash: sha256Hex('token'),
      userId,
      lastSeenAt,
      expiresAt: new Date(lastSeenAt.getTime() + SESSION_TTL_MS),
      userAgent: null,
    };
  }

  it('returns null without a cookie, or for an unknown or expired session', async () => {
    expect(await getSession(undefined, now)).toBeNull();
    vi.mocked(repo.findActiveSession).mockResolvedValueOnce(null);
    expect(await getSession('token', now)).toBeNull();
    expect(repo.findActiveSession).toHaveBeenCalledWith(sha256Hex('token'), now);
  });

  it('does not extend a session seen within the last day', async () => {
    const user = userDoc();
    vi.mocked(repo.findActiveSession).mockResolvedValueOnce(
      sessionDoc(new Date(now.getTime() - 3_600_000), user._id),
    );
    vi.mocked(repo.findUserById).mockResolvedValueOnce(user);
    const session = await getSession('token', now);
    expect(session?.user.email).toBe('irfan@example.com');
    expect(repo.extendSession).not.toHaveBeenCalled();
  });

  it('slides the expiry forward 30 days once a day while active', async () => {
    const user = userDoc();
    const stale = sessionDoc(new Date(now.getTime() - 25 * 3_600_000), user._id);
    vi.mocked(repo.findActiveSession).mockResolvedValueOnce(stale);
    vi.mocked(repo.findUserById).mockResolvedValueOnce(user);
    const session = await getSession('token', now);
    const expected = new Date(now.getTime() + SESSION_TTL_MS);
    expect(session?.user.email).toBe('irfan@example.com');
    expect(repo.extendSession).toHaveBeenCalledWith(stale._id, now, expected);
  });

  it('requireSession throws UNAUTHENTICATED without a valid session', async () => {
    await expect(requireSession(undefined, now)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
