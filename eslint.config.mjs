import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// ESLint stays on v9 (marked deprecated upstream): v10 crashes eslint-plugin-react 7.37.5, which
// eslint-config-next 16.3.6 bundles ("contextOrFilename.getFilename is not a function").
// Retry the upgrade when eslint-config-next ships a compatible plugin.

// File structure rules (docs/system-architecture.md §4.6, CLAUDE.md "Architecture rules").
// ESLint replaces, not merges, a rule's options when several blocks match a file, so each block
// lists its full set.

/** Outside a module: only its public index, `<name>.schemas` and `<name>.types`. */
const moduleInternals = {
  group: ['@/modules/*/*', '!@/modules/*/*.schemas', '!@/modules/*/*.types'],
  message:
    "Import another module only through its public index ('@/modules/<name>'), '<name>.schemas' or '<name>.types'.",
};

/** Raw database access is for repositories only. */
const rawDb = {
  group: ['@/lib/db/client', '@/lib/db/tenant'],
  message: 'Only *.repository.ts files may touch MongoDB (use the module service instead).',
};

/** Modules reach outside their folder with '@/...', never '../', so boundaries stay visible. */
const relativeParent = {
  group: ['../*'],
  message: "Use '@/...' imports to reach outside this module.",
};

const CLIENT_SAFE_MESSAGE =
  'Client-safe code (features, components, shared, config, *.schemas, *.types) must not import server code.';

/** Server-only code: lib/, server-only, Node built-ins. */
const serverCode = {
  group: ['server-only', 'node:*', '@/lib/*'],
  message: CLIENT_SAFE_MESSAGE,
};

/** A module's server-only index. (A regex: gitignore-style `!` can't re-include `*.schemas`.) */
const moduleIndex = { regex: '^@/modules/[^/]+$', message: CLIENT_SAFE_MESSAGE };

/** shared/ and config/ sit below everything else and depend on nothing app-specific. */
const appLayers = {
  group: ['@/modules/*', '@/features/*', '@/components/*', '@/app/*'],
  message: 'shared/ and config/ must not depend on modules, features, components or app.',
};

const restrict = (...patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
});

/** `import type { ObjectId } from 'mongodb'` is erased at build time, so it is allowed. */
const noMongoValues = {
  '@typescript-eslint/no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: ['mongodb'],
          allowTypeImports: true,
          message: `${CLIENT_SAFE_MESSAGE} Use 'import type' for driver types.`,
        },
      ],
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: restrict(moduleInternals, rawDb),
  },
  {
    files: ['src/modules/**/*.{ts,tsx}'],
    rules: restrict(moduleInternals, rawDb, relativeParent),
  },
  {
    files: ['src/modules/**/*.repository.ts'],
    rules: restrict(moduleInternals, relativeParent),
  },
  {
    files: ['src/lib/db/**/*.ts'],
    rules: restrict(moduleInternals),
  },
  {
    files: ['src/features/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    rules: { ...restrict(moduleInternals, serverCode, moduleIndex), ...noMongoValues },
  },
  {
    files: ['src/modules/**/*.schemas.ts', 'src/modules/**/*.types.ts'],
    rules: {
      ...restrict(moduleInternals, relativeParent, serverCode, moduleIndex),
      ...noMongoValues,
    },
  },
  {
    files: ['src/shared/**/*.{ts,tsx}', 'src/config/**/*.ts'],
    rules: { ...restrict(serverCode, appLayers), ...noMongoValues },
  },
  {
    // Tests may reach into internals (e.g. to mock a repository).
    files: ['**/*.test.ts', 'tests/**/*.ts', 'scripts/**/*.ts'],
    rules: { 'no-restricted-imports': 'off', '@typescript-eslint/no-restricted-imports': 'off' },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'coverage/**']),
]);

export default eslintConfig;
