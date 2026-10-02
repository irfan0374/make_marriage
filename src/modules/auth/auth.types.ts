import type { ObjectId } from 'mongodb';
import type { z } from 'zod';
import type { loginSchema, publicUserSchema, signupSchema } from './auth.schemas';

export type SignupInput = z.output<typeof signupSchema>;
export type LoginInput = z.output<typeof loginSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;

/** `users` collection (database-design §6.1). */
export interface UserDocument {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  lastLoginAt: Date | null;
  passwordChangedAt: Date | null;
  schemaVersion: 1;
  createdAt: Date;
  updatedAt: Date;
}

/** `sessions` collection (database-design §6.2). */
export interface SessionDocument {
  _id: ObjectId;
  tokenHash: string;
  userId: ObjectId;
  expiresAt: Date;
  lastSeenAt: Date;
  userAgent: string | null;
}

/** Where a request came from, for rate limits and the session's device label. */
export interface ClientInfo {
  ip: string;
  userAgent: string | null;
}
