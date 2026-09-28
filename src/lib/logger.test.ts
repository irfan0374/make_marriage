import { describe, expect, it } from 'vitest';
import { redact } from './logger';

describe('redact', () => {
  it('masks secret-looking keys at any depth', () => {
    expect(
      redact({
        email: 'a@example.com',
        password: 'p',
        user: { sessionId: 's', resetToken: 't', name: 'Irfan' },
        headers: { authorization: 'Bearer x', cookie: 'c' },
        MONGODB_URI: 'mongodb://u:p@h',
      }),
    ).toEqual({
      email: 'a@example.com',
      password: '[redacted]',
      user: { sessionId: '[redacted]', resetToken: '[redacted]', name: 'Irfan' },
      headers: { authorization: '[redacted]', cookie: '[redacted]' },
      MONGODB_URI: '[redacted]',
    });
  });

  it('serialises errors', () => {
    expect(redact(new Error('x'))).toMatchObject({ name: 'Error', message: 'x' });
  });
});
