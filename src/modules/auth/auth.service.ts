import 'server-only';
import type { ObjectId } from 'mongodb';
import { hash, verify, type Algorithm } from '@node-rs/argon2';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { enforceRateLimits, HOUR, MINUTE } from '@/lib/rate-limit';
import { randomToken, sha256Hex } from '@/lib/tokens';
import {
  deleteSession,
  deleteUserSessions,
  DuplicateEmailError,
  extendSession,
  findActiveSession,
  findUserByEmail,
  findUserById,
  insertSession,
  insertUser,
  recordLogin,
} from './auth.repository';
import { isCommonPassword } from './common-passwords';
import type {
  ClientInfo,
  LoginInput,
  Me,
  PublicUser,
  SignupInput,
  UserDocument,
} from './auth.types';

// Accounts and sessions (architecture §6.1, api-spec §5).

export const SESSION_TTL_MS = 30 * 24 * HOUR;
/** Sessions slide forward at most once a day, so an active user stays logged in. */
const SESSION_REFRESH_MS = 24 * HOUR;

// OWASP-recommended Argon2id settings; matches the hashes in database-design §6.1.
// `Algorithm` is a const enum, which isolatedModules can't read at runtime: 2 is Argon2id.
const ARGON2 = {
  algorithm: 2 as Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

/** Verified against when the email has no account, so both paths take the same time. */
let dummyHash: Promise<string> | undefined;

export interface NewSession {
  user: PublicUser;
  /** Raw session id for the cookie. Never stored or logged. */
  token: string;
  expiresAt: Date;
}

export interface CurrentSession {
  userId: ObjectId;
  user: PublicUser;
  /** Set when the session was just extended, so the caller can refresh the cookie. */
  refreshedExpiresAt: Date | null;
}

export function toPublicUser(user: UserDocument): PublicUser {
  return { id: user._id.toHexString(), email: user.email, name: user.name };
}

async function startSession(
  user: UserDocument,
  client: ClientInfo,
  now: Date,
): Promise<NewSession> {
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await insertSession({
    tokenHash: sha256Hex(token),
    userId: user._id,
    expiresAt,
    lastSeenAt: now,
    userAgent: client.userAgent?.slice(0, 300) ?? null,
  });
  return { user: toPublicUser(user), token, expiresAt };
}

export async function signup(
  input: SignupInput,
  client: ClientInfo,
  now = new Date(),
): Promise<NewSession> {
  await enforceRateLimits([{ key: `signup:ip:${client.ip}`, limit: 5, windowMs: HOUR }], now);
  if (isCommonPassword(input.password)) throw new AppError('WEAK_PASSWORD');

  const passwordHash = await hash(input.password, ARGON2);
  let user: UserDocument;
  try {
    user = await insertUser({ email: input.email, name: input.name, passwordHash, now });
  } catch (error) {
    if (error instanceof DuplicateEmailError) throw new AppError('EMAIL_TAKEN');
    throw error;
  }
  logger.info('auth.signup', { userId: user._id.toHexString() });
  return startSession(user, client, now);
}

export async function login(
  input: LoginInput,
  client: ClientInfo,
  now = new Date(),
): Promise<NewSession> {
  await enforceRateLimits(
    [
      { key: `login:email:${input.email}`, limit: 5, windowMs: 15 * MINUTE },
      { key: `login:ip:${client.ip}`, limit: 20, windowMs: 15 * MINUTE },
    ],
    now,
  );

  const user = await findUserByEmail(input.email);
  dummyHash ??= hash('not-a-real-password', ARGON2);
  const valid = await verify(user?.passwordHash ?? (await dummyHash), input.password);
  // Same error whether or not the email has an account (architecture §6.1).
  if (!user || !valid) throw new AppError('INVALID_CREDENTIALS');

  await recordLogin(user._id, now);
  logger.info('auth.login', { userId: user._id.toHexString() });
  return startSession(user, client, now);
}

/** The user behind a session cookie, or null if it's missing, unknown or expired. */
export async function getSession(
  token: string | undefined,
  now = new Date(),
): Promise<CurrentSession | null> {
  if (!token) return null;
  const session = await findActiveSession(sha256Hex(token), now);
  if (!session) return null;
  const user = await findUserById(session.userId);
  if (!user) return null;

  let refreshedExpiresAt: Date | null = null;
  if (now.getTime() - session.lastSeenAt.getTime() >= SESSION_REFRESH_MS) {
    refreshedExpiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await extendSession(session._id, now, refreshedExpiresAt);
  }
  return { userId: user._id, user: toPublicUser(user), refreshedExpiresAt };
}

/** Like `getSession`, but throws 401 UNAUTHENTICATED when there's no valid session. */
export async function requireSession(token: string | undefined, now = new Date()) {
  const session = await getSession(token, now);
  if (!session) throw new AppError('UNAUTHENTICATED');
  return session;
}

export async function logout(token: string | undefined): Promise<void> {
  if (token) await deleteSession(sha256Hex(token));
}

export async function logoutAll(token: string | undefined, now = new Date()): Promise<void> {
  const session = await requireSession(token, now);
  await deleteUserSessions(session.userId);
}

export async function getMe(token: string | undefined, now = new Date()) {
  const session = await requireSession(token, now);
  const me: Me = { user: session.user, weddings: [] };
  return { me, refreshedExpiresAt: session.refreshedExpiresAt };
}
