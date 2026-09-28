# Wedding planning app

A web app where a couple and their family plan a multi-event Indian wedding together. The product name is not final; it lives in `src/config/app.ts` (`APP_NAME`).

## Start here

- `CLAUDE.md`: rules for working in this codebase
- `docs/`: PRD, system architecture (including file structure §4.5 and design system §18), database design, API spec

## Setup

Requires Node 22 and pnpm (`corepack enable pnpm`).

```bash
pnpm install
cp .env.example .env.local            # fill in APP_URL, MONGODB_URI, MONGODB_DB_NAME
echo "TEST_MONGODB_URI=" > .env.test.local   # dedicated Atlas test cluster for integration tests
pnpm db:indexes
pnpm dev                              # http://localhost:3000, health check at /api/health
```

## Commands

| Task                           | Command                                                 |
| ------------------------------ | ------------------------------------------------------- |
| Dev server                     | `pnpm dev`                                              |
| Build and run                  | `pnpm build` then `pnpm start`                          |
| Lint, type check, format       | `pnpm lint`, `pnpm typecheck`, `pnpm format`            |
| Tests (unit + integration)     | `pnpm test` (`pnpm test:unit`, `pnpm test:integration`) |
| Create collections and indexes | `pnpm db:indexes`                                       |
