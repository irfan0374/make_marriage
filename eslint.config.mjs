import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// Architecture boundaries (CLAUDE.md "Architecture rules"). ESLint replaces, not merges,
// a rule's options when several blocks match a file, so each block lists its full set.

/** Outside a module, only its public `index.ts` and client-safe `<module>.schemas.ts`. */
const moduleInternals = {
  group: ['@/modules/*/*', '!@/modules/*/*.schemas'],
  message:
    "Import another module only through its public index ('@/modules/<name>') or its '<name>.schemas' file.",
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

/** Schemas are shared with client components: no server code. */
const serverOnlyCode = {
  group: [
    'mongodb',
    'server-only',
    '@/lib/db/*',
    '@/lib/env',
    '@/lib/logger',
    '@/lib/ids',
    '@/lib/http/*',
  ],
  message:
    '*.schemas.ts must stay client-safe: import only zod, @/lib/validation and other *.schemas files.',
};

/** A module's server-only index. (A regex: gitignore-style `!` can't re-include `*.schemas`.) */
const moduleIndex = {
  regex: '^@/modules/[^/]+$',
  message: serverOnlyCode.message,
};

const restrict = (...patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
});

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
    files: ['src/modules/**/*.schemas.ts'],
    rules: restrict(relativeParent, serverOnlyCode, moduleIndex),
  },
  {
    // Tests may reach into internals (e.g. to mock a repository).
    files: ['**/*.test.ts', 'tests/**/*.ts', 'scripts/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'coverage/**']),
]);

export default eslintConfig;
