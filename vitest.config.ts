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
          env: { NODE_ENV: 'test' as const, LOG_LEVEL: 'error' },
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
