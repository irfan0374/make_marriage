# Project guide for Claude Code

## What this is
A web app where an Indian couple (bride and groom) and their family plan a multi-event wedding together: events, guest families, invitations and RSVP, tasks, expenses, vendors, a wedding website with a YouTube live stream, and a private photo gallery. Guests never create accounts; they use personal links.

The product name is not final. Keep it in one config value (`APP_NAME`) and never hardcode it elsewhere.

## Source of truth
Read the relevant doc before planning any feature:
- `docs/prd.md`: features, scope, priorities
- `docs/system-architecture.md`: architecture, modules, auth, security, jobs, storage
- `docs/database-design.md`: collections, fields, indexes, queries, cascades
- `docs/api-spec.md`: endpoints, request and response shapes, error codes

If the code needs to differ from a doc, stop and ask. When a decision changes, update the doc in the same change.

## Stack
- Next.js (App Router), TypeScript in strict mode
- Next.js Route Handlers as a REST API under `/api`
- MongoDB Atlas with the official `mongodb` driver (no Mongoose)
- Zod for all validation, shared between forms and API
- Tailwind CSS and shadcn/ui, TanStack Query on the client
- Custom auth: email and password (Argon2id), sessions in MongoDB, HttpOnly cookie
- Cloudflare R2 for files (presigned URLs), Resend for email
- Hosting on Vercel, region Mumbai

## Architecture rules
1. Modular monolith. Code lives in `src/modules/<module>/` as `<module>.routes.ts`, `.service.ts`, `.repository.ts`, `.schemas.ts`, `.types.ts`, `.indexes.ts`, and a public `index.ts`. Files in `src/app/api/**/route.ts` only re-export handlers from a module.
2. Route handlers stay thin: validate with Zod, resolve auth context, call one service function, return the response envelope.
3. Business rules and permission checks live in services.
4. Only repositories touch MongoDB. Every tenant repository function takes `weddingId` first and always filters by it, including updates and deletes.
5. Modules call each other only through their public `index.ts` (server-only), never another module's repository. The one other importable file is `<module>.schemas.ts`: client-safe Zod schemas shared with forms, which must never import server code.
6. The browser reads and writes only through the REST API. Server-rendered pages (public site, invitation, gallery) call the same module services directly through `index.ts`, never their own `/api` over HTTP.
7. Files go directly between the browser and R2. Never stream uploads through the app.
8. No long-running processes. Background work runs as short batches triggered by the cron route.

## Security rules
- Never log passwords, tokens, session IDs or full email bodies.
- Session and password-reset tokens are stored hashed.
- Guest invitation tokens and gallery tokens are intentionally stored raw so couples can re-copy links. This is a documented tradeoff; do not change it.
- A user who isn't a member of a wedding gets `404 NOT_FOUND`, never 403.
- Side scoping (bride side / groom side) is enforced inside the households repository.

## Conventions
- Response envelope: `{ data, meta }` for success, `{ error: { code, message, details, requestId } }` for errors, using the codes in `docs/api-spec.md`.
- Money as integer paise. Calendar dates as `YYYY-MM-DD`, times as `HH:mm`, timestamps as UTC `Date`.
- Environment variables are validated with Zod at startup in `src/lib/env.ts`. Add a variable to the schema in the phase that first needs it, and to `.env.example` in the same change.
- Tenant repositories use `scopedCollection(name, weddingId)` from `src/lib/db/tenant.ts`, never a raw collection.
- Integration tests use a dedicated Atlas test database (`TEST_MONGODB_URI`), never the dev or production database.

## Working rules
- Plan first. For any feature, propose a plan and wait for approval before writing code.
- Ask before installing any new dependency, and explain why it's needed.
- Work on one feature at a time and keep changes small.
- Write tests for services and route handlers, including tenant isolation where relevant.
- Run lint, type check and tests before saying a task is done, and show the results.
- Don't edit files in `docs/` unless asked or as part of an approved decision change.

## Commands
To be filled in after the scaffold is created (dev, build, lint, typecheck, test, create indexes, seed).
