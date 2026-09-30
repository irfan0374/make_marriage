import 'server-only';
import type { ObjectId } from 'mongodb';
import { cookies } from 'next/headers';
import { hash, verify, type Algorithm } from '@node-rs/argon2';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/config/app';
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
import type {
  ClientInfo,
  LoginInput,
  Me,
  PublicUser,
  SignupInput,
  UserDocument,
} from './auth.types';

// Accounts and sessions (architecture §6.1, api-spec §5).

export const SESSION_TTL_MS = SESSION_MAX_AGE_SECONDS * 1000;
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

/**
 * Checked against when the email has no account, so both paths do the same Argon2 work.
 * A fixed hash of a random, discarded password: nothing can ever match it.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$NBW+AZnxS6CAdq8E9O/MZQ$SfS071WTKQNdQq/AqoZoKqPTzNKYilOZFR5L6l5o8vI';

// Passwords of 8+ characters from the top of public breach lists. Signing up with one of these
// returns WEAK_PASSWORD (api-spec §5.1). Compared lowercased.
const COMMON = [
  '12345678',
  '123456789',
  '1234567890',
  '12345678910',
  '11111111',
  '00000000',
  '88888888',
  '87654321',
  '11223344',
  '12341234',
  '123123123',
  '147258369',
  '987654321',
  '1q2w3e4r',
  '1qaz2wsx',
  'qwertyui',
  'qwertyuiop',
  'asdfghjk',
  'asdfghjkl',
  'zxcvbnm1',
  'password',
  'password1',
  'password12',
  'password123',
  'passw0rd',
  'p@ssw0rd',
  'p@ssword',
  'iloveyou',
  'iloveyou1',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'welcome1',
  'welcome123',
  'superman',
  'starwars',
  'whatever',
  'trustno1',
  'letmein1',
  'computer',
  'michelle',
  'jennifer',
  'corvette',
  'mercedes',
  'qwerty123',
  'qwerty12',
  'abc12345',
  'abcd1234',
  'abcdefgh',
  'admin123',
  'administrator',
  'changeme',
  'internet',
  'charlie1',
  'football1',
  'monkey123',
  'dragon123',
  'master123',
  'shadow123',
  'india123',
  'india@123',
  'bharat123',
  'krishna1',
  'ganesh123',
  'wedding1',
  'wedding123',
  'marriage',
  'marriage1',
  'makemymarriage',
];
const COMMON_SET = new Set(COMMON);

export function isCommonPassword(password: string): boolean {
  return COMMON_SET.has(password.toLowerCase());
}

export interface NewSession {
  user: PublicUser;
  /** Raw session id for the cookie. Never stored or logged. */
  token: string;
  expiresAt: Date;
}

export interface CurrentSession {
  userId: ObjectId;
  user: PublicUser;
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
  // A weak password is a typo-level mistake: reject it before it counts against the limit.
  if (isCommonPassword(input.password)) throw new AppError('WEAK_PASSWORD');
  await enforceRateLimits([{ key: `signup:ip:${client.ip}`, limit: 5, windowMs: HOUR }], now);

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
  const valid = await verify(user?.passwordHash ?? DUMMY_HASH, input.password);
  // Same error whether or not the email has an account (architecture §6.1).
  if (!user || !valid) throw new AppError('INVALID_CREDENTIALS');

  const [session] = await Promise.all([
    startSession(user, client, now),
    recordLogin(user._id, now),
  ]);
  logger.info('auth.login', { userId: user._id.toHexString() });
  return session;
}

/**
 * The user behind a session cookie, or null if it's missing, unknown or expired. An active
 * session slides forward 30 days in the database at most once a day; `proxy.ts` slides the
 * cookie's own expiry on every app page load.
 */
export async function getSession(
  token: string | undefined,
  now = new Date(),
): Promise<CurrentSession | null> {
  if (!token) return null;
  const session = await findActiveSession(sha256Hex(token), now);
  if (!session) return null;
  const user = await findUserById(session.userId);
  if (!user) return null;

  if (now.getTime() - session.lastSeenAt.getTime() >= SESSION_REFRESH_MS) {
    await extendSession(session._id, now, new Date(now.getTime() + SESSION_TTL_MS));
  }
  return { userId: user._id, user: toPublicUser(user) };
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

export async function getMe(token: string | undefined, now = new Date()): Promise<Me> {
  const session = await requireSession(token, now);
  return { user: session.user, weddings: [] };
}

/** The logged-in session for a server-rendered page, or null. */
export async function getPageSession() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return getSession(token || undefined);
}
