# Project status

Where the build stands right now. Update this file in the same commit as any change that finishes, starts or blocks a piece of work. The specs live in the other `docs/` files; this file only tracks progress.

**Last updated:** 30 Sep 2026

## Current phase
Phase 1 (Core). **Auth step 1a (sign-up, login, logout) is built and works against the dev database.**

## Done
| Date | What | Notes |
|---|---|---|
| 28 Sep 2026 | Docs reconciled | PRD, architecture, database design and API spec agree on v1 decisions |
| 28 Sep 2026 | Scaffold | Next.js 16 modular monolith, `/api/health`, module-boundary lint rules, env validation, MongoDB client and tenant helper |
| 28 Sep 2026 | Design system | Colour tokens, Fraunces and Inter, pill buttons (architecture §18) |
| 29 Sep 2026 | Marketing homepage | Built from the Google Stitch design, adapted to §18 and v1 scope (PRD §5.12) |
| 29 Sep 2026 | Logos and favicons | Real files in `public/logo/` and `public/icons/`, shown through `Logo` |
| 29 Sep 2026 | Homepage fixes | Dashboard preview visible on phones; code review fixes |
| 30 Sep 2026 | Auth step 1a | Sign-up, login, logout, log out everywhere, `GET /api/me`, 30-day sessions, rate limits, Origin check on data-changing requests, `/login` and `/signup` pages from the Stitch design, `/app` placeholder behind `proxy.ts`, log out of all devices |
| 30 Sep 2026 | Auth review fixes | Sessions slide on both sides (proxy refreshes the cookie), clearer form and logout errors, weak passwords don't use the sign-up limit, fixed dummy hash for unknown emails, origin check accepts `APP_URL`, rate-limit storage in a repository file |

## Next
1. **Run the integration tests** once a test database string is in `.env.test.local`: `pnpm test:integration`.
2. **Auth step 1b:** forgot and reset password (needs Resend set up), and `PATCH /api/me`.
3. The rest of Phase 1: create a wedding, events, guests, invitations and RSVP, basic email (PRD §10).

## Open items
- **Test database not set up:** integration tests are skipped until `TEST_MONGODB_URI` is set in `.env.test.local`. The dev database is connected and has its collections and indexes.
- **Pages not built yet:** `/privacy` and `/forgot-password` (the login page has no "Forgot password?" link until step 1b).
- **Stitch designs:** the Stitch project also has screens for the dashboard, events, guests, invitations, tasks, expenses, vendors, website, gallery, team, settings and login. Use them as the visual reference when building each feature.
- **Doc gaps to settle:** video invitation thumbnail; households with no side when sides are turned on; daily digest listed in Phase 2 but deferred in NOTIF-5; `website_cover` upload being Admin-only; missing index in database design §7.2; doc version numbers out of sync; floral theme and red accent.
- **Security:** rotate the Stitch API key that was shared in chat.
