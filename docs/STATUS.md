# Project status

Where the build stands right now. Update this file in the same commit as any change that finishes, starts or blocks a piece of work. The specs live in the other `docs/` files; this file only tracks progress.

**Last updated:** 6 Oct 2026

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
| 2 Oct 2026 | Edit wedding details | `PATCH /api/weddings/{id}` (admins only: Managers 403, non-members 404, archived 409; new dates checked, kept dates not; website address unchanged). `requireWritableWedding` for later modules. `/app/{id}/settings` from the Stitch Settings screen (details + sides), reached from "Edit details" on the overview and "Wedding settings" in the account menu; Managers are redirected to the overview. Create and settings forms share one set of fields |
| 2 Oct 2026 | Settings review fixes | Save returns to the overview with a "Wedding details saved" banner; text compared trimmed so a space alone isn't a change; warning before leaving with unsaved edits (links, logo, menu, Back, closing the tab); tab title "Settings · names"; warning when turning sides off; timezones always returned in standard spelling; clear error for a request with no body |
| 2 Oct 2026 | One admin wedding per person | Decision: each person can be an Admin of only one wedding (their own, as bride or groom); Managers can belong to any number. `POST /api/weddings` returns 409 `ALREADY_HAS_WEDDING`, enforced by a unique partial index on memberships. `/app/new` redirects to the user's own wedding, and "Create your wedding" shows only to people without one. Docs: PRD §4/AUTH-2/AUTH-3, architecture §7.2, DB §7.2, API §6.1/§7/§22. Extra test weddings removed from the dev database |
| 6 Oct 2026 | Team and member invites | New `team` module (invite, join, get new link, cancel, change role/side) and `notifications` module (Resend email + `emailLogs`). Invite email from "<inviter> via Make My Marriage"; the link is also shown once to copy or share on WhatsApp; a failed email keeps the invite. `/app/{id}/team` (admins manage, Managers read-only), `/join/{token}` with clear states (log in or sign up, wrong account, already a member, expired, cancelled, used). Login and sign-up keep a safe `?next=`. App sidebar (Overview, Team, Settings). "Invite your family" on the overview links to Team. Resend env vars now required. Packages: `resend`, `@react-email/render` |
| 6 Oct 2026 | Only the couple creates a wedding; no "log out of all devices" | Decisions: a Manager on any wedding team can't create a wedding (409 `ALREADY_ON_A_TEAM`; they'd sign up with another email); `/app/new` sends them to their weddings and no "Create your wedding" link is shown. "Log out of all devices" removed from the menu, and `POST /api/auth/logout-all` removed; ending all sessions stays internal for password reset. Docs: PRD §4/AUTH-2, architecture §6.1/§7.2, DB §6.2/§7.2, API §5.4/§6.1/§22 |
| 6 Oct 2026 | Fix: switching accounts showed the previous account | The browser's data cache (who you are, weddings, team) wasn't cleared on log in, sign up or log out, so the next account on the same device saw the previous one's data until a reload. Now cleared on all three. The server always checked the real account; no data was exposed |
| 6 Oct 2026 | Remove a team member | `DELETE /api/weddings/{id}/members/{memberId}` (admins only; last admin protected; access ends on the next request; can be re-invited). "Remove" button with confirmation on each member row except your own (PRD AUTH-8, API §7.6) |

## Next
1. **Events module** (PRD §5.2): plan approved earlier (drag-and-drop with `@dnd-kit`, Quick add, Sort by date); add Events to the sidebar.
2. **Guests (households)**, then **invitations and RSVP** (PRD §5.3–5.4).
3. **Forgot and reset password** (auth step 1b) now that email works, plus `PATCH /api/me` and leave wedding (API §7.7).

## Open items
- **Test database shares the dev cluster:** tests only create and drop `test_*` databases. A separate Atlas user or cluster would be safer before real data arrives.
- **Pages not built yet:** `/privacy` and `/forgot-password`. The Privacy links (homepage footer, login and sign-up pages) are removed until the page exists; add them back with it. The login page has no "Forgot password?" link until step 1b.
- **Rest of the Settings screen:** guest tags, expense categories, archive/unarchive and the vendor search radius come with their features. The overview checklist buttons show "Coming soon" until their features exist.
- **Stitch screens made through the API don't appear on the canvas:** "Onboarding: Create your wedding" and "Wedding overview" exist in the project (fetchable by id) but aren't placed on the canvas. Generate future screens from Stitch's own chat if they need editing there.
- **Stitch designs:** the Stitch project also has screens for the dashboard, events, guests, invitations, tasks, expenses, vendors, website, gallery, team, settings and login. Use them as the visual reference when building each feature.
- **Doc gaps to settle:** video invitation thumbnail; households with no side when sides are turned on; daily digest listed in Phase 2 but deferred in NOTIF-5; `website_cover` upload being Admin-only; search-engine indexing missing from the Admin-only row in architecture §7.2; doc version numbers out of sync; floral theme and red accent.
- **Security:** rotate the Stitch API key that was shared in chat.
- **Email sender:** `EMAIL_FROM` in `.env.local` uses Resend's `resend.dev` test address, which only delivers to the Resend account owner. Switch it to an address on the verified domain so invites reach family members.
- **Email delivery status:** Resend webhooks (delivered, bounced) aren't handled yet; they come with guest invitations.
