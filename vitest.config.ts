import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Integration tests need a dedicated Atlas test database (never the dev or production one).
if (existsSync('.env.test.local')) process.loadEnvFile('.env.test.local');
const hasTestDb = Boolean(process.env.TEST_MONGODB_URI);
if (!hasTestDb) {
  console.warn(
    '[vitest] TEST_MONGODB_URI is not set (.env.test.local): integration tests are skipped.',
  );
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // `server-only` throws outside a React Server Components bundle; tests run plain Node.
    alias: { 'server-only': new URL('./tests/helpers/server-only.ts', import.meta.url).pathname },
  },
  test: {
    environment: 'node',
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          // Placeholders so code that reads the validated env works; unit tests never connect.
          env: {
            NODE_ENV: 'test' as const,
            LOG_LEVEL: 'error',
            APP_URL: 'https://app.example',
            MONGODB_URI: 'mongodb://127.0.0.1:27017',
            MONGODB_DB_NAME: 'unit',
            // Tests never send email: src/lib/email.ts keeps messages in memory under NODE_ENV=test.
            RESEND_API_KEY: 're_test_placeholder',
            EMAIL_FROM: 'Make My Marriage <invites@example.com>',
          },
        },
      },
      ...(hasTestDb
        ? [
            {
              test: {
                name: 'integration',
                include: ['tests/integration/**/*.test.ts'],
                globalSetup: ['tests/helpers/global-setup.ts'],
                setupFiles: ['tests/helpers/test-db.ts'],
                env: { NODE_ENV: 'test' as const, LOG_LEVEL: 'error' },
                testTimeout: 30_000,
                hookTimeout: 60_000,
              },
            },
          ]
        : []),
    ],
  },
});
