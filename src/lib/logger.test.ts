import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger, redact, scrub } from './logger';

afterEach(() => vi.restoreAllMocks());

describe('redact', () => {
  it('masks secret-looking keys at any depth', () => {
    expect(
      redact({
        email: 'a@example.com',
        password: 'p',
        user: { sessionId: 's', resetToken: 't', name: 'Irfan', passwordHash: 'h' },
        headers: { authorization: 'Bearer x', cookie: 'c' },
        MONGODB_URI: 'mongodb://u:p@h',
        inviteLink: 'https://app.example/invited/abc',
        uploadUrl: 'https://r2.example/put',
      }),
    ).toEqual({
      email: 'a@example.com',
      password: '[redacted]',
      user: {
        sessionId: '[redacted]',
        resetToken: '[redacted]',
        name: 'Irfan',
        passwordHash: '[redacted]',
      },
      headers: { authorization: '[redacted]', cookie: '[redacted]' },
      MONGODB_URI: '[redacted]',
      inviteLink: '[redacted]',
      uploadUrl: '[redacted]',
    });
  });

  it('scrubs secrets hidden in values under harmless keys', () => {
    expect(
      redact({
        note: 'guest opened https://app.example/invited/Hk3nP0xQ7rT2wY5zA9bC1d',
        target:
          'https://acct.r2.cloudflarestorage.com/b/k?X-Amz-Signature=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
        conn: 'mongodb+srv://admin:s3cret@cluster0.example.mongodb.net/db',
        header: 'Bearer abc.def.ghi',
      }),
    ).toEqual({
      note: 'guest opened https://app.example/invited/[redacted]',
      target: 'https://acct.r2.cloudflarestorage.com/b/k?X-Amz-Signature=[redacted]',
      conn: 'mongodb+srv://[redacted]@cluster0.example.mongodb.net/db',
      header: 'Bearer [redacted]',
    });
  });

  it('keeps ordinary values, ids and route patterns readable', () => {
    const fields = {
      route: '/api/public/invitations/[token]',
      requestId: 'req_7f3a9c21',
      weddingId: '66f1b0000000000000000001',
      code: 'NOT_FOUND',
      status: 404,
    };
    expect(redact(fields)).toEqual(fields);
  });

  it('serialises errors and scrubs their message, stack and cause', () => {
    const cause = new Error('reset link /reset-password/Zx9vQ2mLp4rS7tU1wY3aB5c used');
    const error = new Error('failed for mongodb://root:pw@db.example', { cause });
    const out = redact(error) as { message: string; stack: string; cause: { message: string } };
    expect(out.message).toBe('failed for mongodb://[redacted]@db.example');
    expect(out.stack).not.toContain('root:pw');
    expect(out.cause.message).toBe('reset link /reset-password/[redacted] used');
  });
});

describe('logger', () => {
  it('writes one JSON line and scrubs the message itself', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((line: string) => void lines.push(line));
    logger.error('login failed for Bearer abc123', { password: 'hunter2' });
    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({
      level: 'error',
      msg: 'login failed for Bearer [redacted]',
      password: '[redacted]',
    });
    expect(lines[0]).not.toContain('hunter2');
  });

  it('scrub is a no-op for plain text', () => {
    expect(scrub('health.db_unreachable')).toBe('health.db_unreachable');
  });
});
