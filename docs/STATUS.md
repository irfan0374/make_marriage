# Project status

Where the build stands right now. Update this file in the same commit as any change that finishes, starts or blocks a piece of work. The specs live in the other `docs/` files; this file only tracks progress.

**Last updated:** 2 Oct 2026

## Current phase
Phase 1 (Core). **Auth step 1a and wedding onboarding step 1 (create a wedding) are built.**

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
| 1 Oct 2026 | Integration tests running | `TEST_MONGODB_URI` set (dev cluster, throwaway `test_*` databases). Auth, health and tenant tests pass; fixed a tenant test that expected the wrong result for a caller-supplied `weddingId` |
| 1 Oct 2026 | Wedding onboarding step 1 | `members` module (memberships, membership check: non-members get 404) and `weddings` module (`POST /api/weddings`, `GET /api/weddings/{id}`, `GET /api/me` with weddings, moved from auth). Wedding + admin membership in one transaction with DB §7.1 defaults and a suggested website address. `/app` routes to create / open / pick a wedding; `/app/new` and the wedding overview from the Stitch designs. Date must be today or later; several weddings per person allowed |
| 2 Oct 2026 | Onboarding form v2 (Stitch update) | Create-wedding form gains an optional free-text venue and a timezone picker (India, Gulf, UK, US Eastern, Singapore); "today or later" is checked in the chosen timezone; step bar removed. Overview shows the venue and timezone. Docs: `venue` field added (DB §7.1, API §4.3/§6.1/§6.3, PRD SETUP-1) |
| 2 Oct 2026 | Onboarding QA fixes | Account menu in every app header with "Create a wedding" and (several weddings) "Your weddings"; Back after creating no longer returns to a blank form; "Back to your wedding" on the create page; logo goes to `/app` inside the app; wedding date at most 5 years ahead; names need a letter; timezones stored in standard spelling; field errors clear while typing; inputs capped at schema lengths; plain API wording for missing or wrong-type fields; tab title shows the couple; malformed, missing and other people's weddings get the same in-app 404 from the server; Privacy links hidden until the page exists |

## Next
1. **Auth step 1b:** forgot and reset password (needs Resend set up), and `PATCH /api/me`.
2. **Events module** (PRD §5.2), then onboarding step 2 "Add your events" and the overview checklist link.
3. The rest of Phase 1: guests, invitations and RSVP, team invites, basic email (PRD §10).

## Open items
- **Test database shares the dev cluster:** tests only create and drop `test_*` databases. A separate Atlas user or cluster would be safer before real data arrives.
- **Pages not built yet:** `/privacy` and `/forgot-password`. The Privacy links (homepage footer, login and sign-up pages) are removed until the page exists; add them back with it. The login page has no "Forgot password?" link until step 1b.
- **Wedding settings not built:** editing the wedding (`PATCH /api/weddings/{id}`), archive/unarchive and the "Edit details" button come with the Settings page. The overview checklist buttons show "Coming soon" until their features exist.
- **Stitch screens made through the API don't appear on the canvas:** "Onboarding: Create your wedding" and "Wedding overview" exist in the project (fetchable by id) but aren't placed on the canvas. Generate future screens from Stitch's own chat if they need editing there.
- **Stitch designs:** the Stitch project also has screens for the dashboard, events, guests, invitations, tasks, expenses, vendors, website, gallery, team, settings and login. Use them as the visual reference when building each feature.
- **Doc gaps to settle:** video invitation thumbnail; households with no side when sides are turned on; daily digest listed in Phase 2 but deferred in NOTIF-5; `website_cover` upload being Admin-only; search-engine indexing missing from the Admin-only row in architecture §7.2; doc version numbers out of sync; floral theme and red accent.
- **Security:** rotate the Stitch API key that was shared in chat.
