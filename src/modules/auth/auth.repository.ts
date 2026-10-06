import 'server-only';
import { MongoServerError, ObjectId } from 'mongodb';
import { globalCollection } from '@/lib/db/client';
import { SESSIONS, USERS } from './auth.indexes';
import type { SessionDocument, UserDocument } from './auth.types';

// Global collections: users and sessions belong to people, not to one wedding.

const users = () => globalCollection<UserDocument>(USERS);
const sessions = () => globalCollection<SessionDocument>(SESSIONS);

export class DuplicateEmailError extends Error {}

export async function insertUser(input: {
  email: string;
  name: string;
  passwordHash: string;
  now: Date;
}): Promise<UserDocument> {
  const doc: UserDocument = {
    _id: new ObjectId(),
    email: input.email,
    name: input.name,
    passwordHash: input.passwordHash,
    lastLoginAt: input.now,
    passwordChangedAt: null,
    schemaVersion: 1,
    createdAt: input.now,
    updatedAt: input.now,
  };
  try {
    await users().insertOne(doc);
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) throw new DuplicateEmailError();
    throw error;
  }
  return doc;
}

export function findUserByEmail(email: string) {
  return users().findOne({ email });
}

/** Several users at once (for team lists). `passwordHash` is never read here. */
export function findUsersByIds(ids: ObjectId[]) {
  return users()
    .find({ _id: { $in: ids } }, { projection: { email: 1, name: 1 } })
    .toArray();
}

export function findUserById(id: ObjectId) {
  return users().findOne({ _id: id });
}

export async function recordLogin(userId: ObjectId, now: Date): Promise<void> {
  await users().updateOne({ _id: userId }, { $set: { lastLoginAt: now, updatedAt: now } });
}

export async function insertSession(doc: Omit<SessionDocument, '_id'>): Promise<void> {
  await sessions().insertOne({ _id: new ObjectId(), ...doc });
}

/** A session that hasn't expired yet (the TTL index removes old ones, but lags up to a minute). */
export function findActiveSession(tokenHash: string, now: Date) {
  return sessions().findOne({ tokenHash, expiresAt: { $gt: now } });
}

export async function extendSession(id: ObjectId, lastSeenAt: Date, expiresAt: Date) {
  await sessions().updateOne({ _id: id }, { $set: { lastSeenAt, expiresAt } });
}

export async function deleteSession(tokenHash: string): Promise<void> {
  await sessions().deleteOne({ tokenHash });
}

/** End every session of a user. For password reset (architecture §6.2); no endpoint calls it. */
export async function deleteUserSessions(userId: ObjectId): Promise<void> {
  await sessions().deleteMany({ userId });
}
