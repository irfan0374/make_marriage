# Project status

Where the build stands right now. Update this file in the same commit as any change that finishes, starts or blocks a piece of work. The specs live in the other `docs/` files; this file only tracks progress.

**Last updated:** 29 Sep 2026

## Current phase
Foundation done, marketing homepage done. **Next: Phase 1 (Core), starting with auth.**

## Done
| Date | What | Notes |
|---|---|---|
| 28 Sep 2026 | Docs reconciled | PRD, architecture, database design and API spec agree on v1 decisions |
| 28 Sep 2026 | Scaffold | Next.js 16 modular monolith, `/api/health`, module-boundary lint rules, env validation, MongoDB client and tenant helper |
| 28 Sep 2026 | Design system | Colour tokens, Fraunces and Inter, pill buttons (architecture §18) |
| 29 Sep 2026 | Marketing homepage | Built from the Google Stitch design, adapted to §18 and v1 scope (PRD §5.12) |
| 29 Sep 2026 | Logos and favicons | Real files in `public/logo/` and `public/icons/`, shown through `Logo` |
| 29 Sep 2026 | Homepage fixes | Dashboard preview visible on phones; code review fixes |

## Next
1. **Phase 1a: auth.** Signup, login, logout, forgot and reset password, sessions. A plan was drafted earlier and set aside; re-plan before building.
2. The rest of Phase 1: wedding setup and events, guests, invitations and RSVP, basic email (PRD §10).

## Open items
- **Local database:** `.env.local` has a placeholder `MONGODB_URI` so `pnpm dev` starts without a database. Replace it with the Atlas connection string before building auth.
- **Pages not built yet:** the homepage links to `/signup`, `/login` and `/privacy`, which show the 404 page for now.
- **Stitch designs:** the Stitch project also has screens for the dashboard, events, guests, invitations, tasks, expenses, vendors, website, gallery, team, settings and login. Use them as the visual reference when building each feature.
- **Doc gaps to settle:** video invitation thumbnail; households with no side when sides are turned on; daily digest listed in Phase 2 but deferred in NOTIF-5; `website_cover` upload being Admin-only; missing index in database design §7.2; doc version numbers out of sync; floral theme and red accent.
- **Security:** rotate the Stitch API key that was shared in chat.
