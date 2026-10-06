import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEnv, requireEnv, resetEnvCache } from './env';

const valid = {
  APP_URL: 'http://localhost:3000',
  MONGODB_URI: 'mongodb+srv://cluster0.example.mongodb.net',
  MONGODB_DB_NAME: 'make_marriage_dev',
  RESEND_API_KEY: 're_test_key',
  EMAIL_FROM: 'Make My Marriage <invites@example.com>',
};

describe('parseEnv', () => {
  it('boots with only the required app, database and email variables', () => {
    const env = parseEnv(valid);
    expect(env).toMatchObject({
      ...valid,
      NODE_ENV: 'development',
      MONGODB_MAX_POOL_SIZE: 5,
      LOG_LEVEL: 'info',
      EMAIL_DAILY_LIMIT: 100,
    });
    expect(env.RESEND_WEBHOOK_SECRET).toBeUndefined();
    expect(env.R2_BUCKET).toBeUndefined();
    expect(env.CRON_SECRET).toBeUndefined();
    expect(env.GOOGLE_PLACES_API_KEY).toBeUndefined();
  });

  it('requires the Resend key and sender', () => {
    expect(() => parseEnv({ ...valid, RESEND_API_KEY: undefined })).toThrow(/RESEND_API_KEY/);
    expect(() => parseEnv({ ...valid, EMAIL_FROM: undefined })).toThrow(/EMAIL_FROM/);
  });

  it('treats empty optional variables (KEY= from .env.example) as not set', () => {
    const env = parseEnv({ ...valid, RESEND_WEBHOOK_SECRET: '', R2_BUCKET: '', CRON_SECRET: '' });
    expect(env.RESEND_WEBHOOK_SECRET).toBeUndefined();
    expect(env.R2_BUCKET).toBeUndefined();
    expect(env.CRON_SECRET).toBeUndefined();
  });

  it('validates variables when they are set', () => {
    expect(() => parseEnv({ ...valid, CRON_SECRET: 'too-short-secret-value' })).toThrow(
      /CRON_SECRET/,
    );
    expect(() => parseEnv({ ...valid, EMAIL_FROM: 'not an address' })).toThrow(/EMAIL_FROM/);
    expect(() => parseEnv({ ...valid, R2_BUCKET: 'Bad_Bucket' })).toThrow(/R2_BUCKET/);
    expect(parseEnv({ ...valid, EMAIL_FROM: 'hello@example.com' }).EMAIL_FROM).toBe(
      'hello@example.com',
    );
  });

  it('names every missing or invalid variable without printing values', () => {
    let message = '';
    try {
      parseEnv({ ...valid, MONGODB_URI: undefined, APP_URL: 'not a url sekrit42' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('MONGODB_URI');
    expect(message).toContain('APP_URL');
    expect(message).not.toContain('sekrit42');
  });

  it('rejects a non-MongoDB connection string', () => {
    expect(() => parseEnv({ ...valid, MONGODB_URI: 'postgres://localhost' })).toThrow(
      /MONGODB_URI/,
    );
  });
});

describe('requireEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  function stubEnv(values: Record<string, string>) {
    for (const [key, value] of Object.entries({ ...valid, ...values })) vi.stubEnv(key, value);
    resetEnvCache();
  }

  it('returns the requested variables when set', () => {
    stubEnv({ R2_BUCKET: 'make-marriage-dev', CRON_SECRET: 'x'.repeat(32) });
    expect(requireEnv('R2_BUCKET', 'CRON_SECRET')).toEqual({
      R2_BUCKET: 'make-marriage-dev',
      CRON_SECRET: 'x'.repeat(32),
    });
  });

  it('names the missing variables and never prints values', () => {
    stubEnv({ CRON_SECRET: 'secret-value-that-is-long-enough-123', R2_BUCKET: '' });
    expect(() => requireEnv('CRON_SECRET', 'R2_BUCKET', 'GOOGLE_PLACES_API_KEY')).toThrow(
      'R2_BUCKET, GOOGLE_PLACES_API_KEY are required for this feature but not set. See .env.example.',
    );
    try {
      requireEnv('R2_BUCKET', 'CRON_SECRET');
    } catch (error) {
      expect((error as Error).message).not.toContain('secret-value-that-is-long-enough-123');
    }
  });
});
