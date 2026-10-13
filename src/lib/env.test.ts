import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEnv, requireEnv, resetEnvCache } from './env';

const valid = {
  APP_URL: 'http://localhost:3000',
  MONGODB_URI: 'mongodb+srv://cluster0.example.mongodb.net',
  MONGODB_DB_NAME: 'make_marriage_dev',
  RESEND_API_KEY: 're_test_key',
  EMAIL_FROM: 'Make My Marriage <invites@example.com>',
  R2_ACCOUNT_ID: 'test-account',
  R2_ACCESS_KEY_ID: 'test-access-key',
  R2_SECRET_ACCESS_KEY: 'test-secret',
  R2_BUCKET: 'make-marriage-dev',
  CRON_SECRET: 'cron-secret-that-is-at-least-32-chars',
};

describe('parseEnv', () => {
  it('boots with only the required app, database, email and storage variables', () => {
    const env = parseEnv(valid);
    expect(env).toMatchObject({
      ...valid,
      NODE_ENV: 'development',
      MONGODB_MAX_POOL_SIZE: 5,
      LOG_LEVEL: 'info',
      EMAIL_DAILY_LIMIT: 100,
    });
    expect(env.RESEND_WEBHOOK_SECRET).toBeUndefined();
    expect(env.GOOGLE_PLACES_API_KEY).toBeUndefined();
  });

  it('requires the Resend key and sender', () => {
    expect(() => parseEnv({ ...valid, RESEND_API_KEY: undefined })).toThrow(/RESEND_API_KEY/);
    expect(() => parseEnv({ ...valid, EMAIL_FROM: undefined })).toThrow(/EMAIL_FROM/);
  });

  it('requires the cron secret', () => {
    expect(() => parseEnv({ ...valid, CRON_SECRET: undefined })).toThrow(/CRON_SECRET/);
  });

  it('requires the R2 storage variables', () => {
    expect(() => parseEnv({ ...valid, R2_SECRET_ACCESS_KEY: '' })).toThrow(/R2_SECRET_ACCESS_KEY/);
    expect(() => parseEnv({ ...valid, R2_BUCKET: undefined })).toThrow(/R2_BUCKET/);
  });

  it('treats empty optional variables (KEY= from .env.example) as not set', () => {
    const env = parseEnv({
      ...valid,
      RESEND_WEBHOOK_SECRET: '',
      GOOGLE_PLACES_API_KEY: '',
    });
    expect(env.RESEND_WEBHOOK_SECRET).toBeUndefined();
    expect(env.GOOGLE_PLACES_API_KEY).toBeUndefined();
  });

  it('accepts an optional development email redirect', () => {
    expect(parseEnv(valid).EMAIL_DEV_REDIRECT_TO).toBeUndefined();
    expect(
      parseEnv({ ...valid, EMAIL_DEV_REDIRECT_TO: 'me@example.com' }).EMAIL_DEV_REDIRECT_TO,
    ).toBe('me@example.com');
    expect(() => parseEnv({ ...valid, EMAIL_DEV_REDIRECT_TO: 'not-an-email' })).toThrow(
      /EMAIL_DEV_REDIRECT_TO/,
    );
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
    stubEnv({ RESEND_WEBHOOK_SECRET: 'whsec_test', GOOGLE_PLACES_API_KEY: 'places-key' });
    expect(requireEnv('RESEND_WEBHOOK_SECRET', 'GOOGLE_PLACES_API_KEY')).toEqual({
      RESEND_WEBHOOK_SECRET: 'whsec_test',
      GOOGLE_PLACES_API_KEY: 'places-key',
    });
  });

  it('names the missing variables and never prints values', () => {
    stubEnv({ RESEND_WEBHOOK_SECRET: 'whsec-secret-value-123', GOOGLE_PLACES_API_KEY: '' });
    expect(() => requireEnv('RESEND_WEBHOOK_SECRET', 'GOOGLE_PLACES_API_KEY')).toThrow(
      'GOOGLE_PLACES_API_KEY is required for this feature but not set. See .env.example.',
    );
    try {
      requireEnv('GOOGLE_PLACES_API_KEY', 'RESEND_WEBHOOK_SECRET');
    } catch (error) {
      expect((error as Error).message).not.toContain('whsec-secret-value-123');
    }
  });
});
