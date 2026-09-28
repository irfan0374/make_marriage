import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const valid = {
  APP_URL: 'http://localhost:3000',
  MONGODB_URI: 'mongodb+srv://user:hunter2@cluster0.example.mongodb.net',
  MONGODB_DB_NAME: 'make_marriage_dev',
};

describe('parseEnv', () => {
  it('accepts a valid environment and applies defaults', () => {
    expect(parseEnv(valid)).toMatchObject({
      ...valid,
      NODE_ENV: 'development',
      MONGODB_MAX_POOL_SIZE: 10,
      LOG_LEVEL: 'info',
    });
  });

  it('names every missing or invalid variable without printing values', () => {
    let message = '';
    try {
      parseEnv({ ...valid, MONGODB_URI: undefined, APP_URL: 'not a url hunter2' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('MONGODB_URI');
    expect(message).toContain('APP_URL');
    expect(message).not.toContain('hunter2');
  });

  it('rejects a non-MongoDB connection string', () => {
    expect(() => parseEnv({ ...valid, MONGODB_URI: 'postgres://localhost' })).toThrow(
      /MONGODB_URI/,
    );
  });
});
