# Make My Marriage: Product Requirements Document

| | |
|---|---|
| **Version** | 1.1 (reconciled with Architecture v1.2, Database Design v1.1, API Spec v1.1) |
| **Date** | 28 September 2026 |
| **Owner** | Irfan |
| **Scope** | v1, responsive web application |

---

## 1. Overview

### 1.1 Summary
Make My Marriage is a web app where a bride and groom and their families plan an Indian wedding together. The couple creates the wedding's events (Mehendi, Haldi, Sangeet, Wedding, Reception, or custom ones), invites families to the events they are invited to, collects RSVPs, and tracks tasks, expenses and vendors. They also share a simple wedding website with an embedded YouTube live stream, and collect guest photos privately through a link and QR code.

Guests never create accounts. They use a personal invitation link and a gallery link.

### 1.2 Problem
An Indian wedding has many events, guest lists in the hundreds, and invitations addressed to families rather than individuals. Many relatives also take part in decisions. Most families run this on WhatsApp groups, spreadsheets and phone calls, so there is no single source of truth for who is invited to which event, who has replied, what has been spent, and what is still pending.

### 1.3 Product principles
1. **Family-first.** Guests are households, and each household gets one personal invitation.
2. **No accounts for guests.** A link is all a guest needs.
3. **The couple stays in control.** Every family member's access is set by the couple.
4. **Tracking, not budgeting.** The app records what happened and does not enforce limits.
5. **Simple over clever.** The couple uploads their own invite, YouTube handles streaming, and WhatsApp sharing works through copyable links.
6. **Mobile-first.** Most guests will open links inside WhatsApp on a phone.

---

## 2. Goals and non-goals

### 2.1 Goals (v1)
- **G1.** One place to set up and manage all wedding events.
- **G2.** Invite each family to only their events and collect per-event RSVPs without guest accounts.
- **G3.** Let parents, siblings and relatives collaborate with permissions the couple controls.
- **G4.** Track tasks, expenses and vendors.
- **G5.** Publish a wedding website with a live stream, and collect guest photos in a private gallery.

### 2.2 Non-goals (v1)
Budgeting or spending limits, shagun and gift tracking, accommodation and travel management, region- or religion-specific customisation, planner or multi-wedding management, WhatsApp and SMS sending, payments, a vendor marketplace (basic Google Places vendor search is in Phase 4), our own live streaming, invitation design tools and templates, video uploads in the gallery, and multiple languages.

### 2.3 Success metrics (targets to validate in a pilot)
| Metric | Target |
|---|---|
| Time from sign-up to first invitation sent (using CSV import) | Median under 30 minutes |
| Guest RSVP completion time, no login | Median under 60 seconds |
| Households responding before the RSVP deadline | 70% or more |
| Guest page load on 4G (largest contentful paint) | Under 2.5 seconds |
| Gallery upload success rate | 98% or more |
| Weddings with at least one family member (Manager) invited | 50% or more |

---

## 3. Users and roles

### 3.1 Roles
| Role | Description | Account |
|---|---|---|
| **Admin (couple)** | Bride and/or groom. Up to 2 admins per wedding. Full control. | Email login |
| **Manager** (family member) | Parents, siblings, uncles and others invited by an admin. Can work on everything except admin-only settings. | Email login |
| **Guest** | An invited household. Views their invitation and RSVPs. Uploads and views gallery photos. | None (links only) |

### 3.2 Permission model
Each wedding member has one role: **Admin** or **Manager**. There are no per-module permissions in v1.

| Capability | Admin | Manager |
|---|---|---|
| Events, guests, invitations, RSVPs, tasks, expenses, vendors, website content, gallery photos | ✅ | ✅ |
| Wedding profile, sides setting, location | ✅ | ❌ |
| Team members and roles | ✅ | ❌ |
| Publish website, change its address, search-engine indexing | ✅ | ❌ |
| Gallery settings and link regeneration | ✅ | ❌ |
| Archive or unarchive the wedding | ✅ | ❌ |

**Side scoping.** If the couple turns on the bride side / groom side option, each Manager can be scoped to **Bride side**, **Groom side** or **Both**. Scoping applies to guests, invitations, RSVPs, and any dashboard counts derived from them. If the option is off, side labels appear nowhere in the app.

---

## 4. Assumptions and constraints
- Each person can be an **Admin of only one wedding**: their own, as the bride or groom. Only the couple creates a wedding; either partner can add the other as co-admin. A person can still be a **Manager in any number of weddings** (for example a relative helping two families) and switch between them. A Manager can't create a wedding with that account: only the couple creates one. To plan their own wedding later, a family member signs up with a different email.
- India-focused: currency is INR, default timezone is Asia/Kolkata, and the UI is English in v1.
- A guest's email is optional. Every household always has a copyable personal link.
- Email is the only sending channel in v1.
- Live stream uses YouTube's own streaming and embed. The app does not host or stream video.
- The gallery accepts photos only.
- The expense tracker records spending only. There is no budget or forecast.

---

## 5. Functional requirements

**Priority key:** **P0** is required for that module's release. **P1** is expected in the same phase if time allows. **P2** is nice to have and can slip.

### 5.1 Auth and access (AUTH)
| ID | Requirement | Priority |
|---|---|---|
| AUTH-1 | Sign up and log in with email and password. Forgot password sends a single-use reset link. | P0 |
| AUTH-2 | After signing up, the user creates a wedding and becomes its admin. Only someone on no wedding team can create one: an admin can't create a second, and a Manager can't create one. | P0 |
| AUTH-3 | An admin can add a second admin (the partner) by email. Someone who is already an admin of another wedding cannot become an admin here. | P0 |
| AUTH-4 | An admin can invite family members as Managers by email. The invitee opens the link, signs up or logs in with that email, and joins. The link is also shown once to the admin to copy or share on WhatsApp. | P0 |
| AUTH-5 | Role (Admin or Manager) and side scope are set at invite time and editable later. At most 2 admins, always at least 1. | P0 |
| AUTH-6 | Optional bride side / groom side toggle for the wedding. | P0 |
| AUTH-7 | When the toggle is on, a Manager can be scoped to Bride side, Groom side, or Both. | P0 |
| AUTH-8 | An admin can remove a member or change their role or side scope at any time, effective on the member's next request. | P0 |
| AUTH-9 | Pending member invitations can be resent or cancelled. | P1 |
| AUTH-10 | Sessions persist for 30 days per device, and users can log out. | P1 |

**Key acceptance criteria**
- A Manager cannot see admin-only settings and receives a 403 from every admin-only endpoint.
- A Manager scoped to *Groom side* cannot see, search, export or count bride-side households anywhere, including the dashboard.

### 5.2 Wedding setup and events (SETUP)
| ID | Requirement | Priority |
|---|---|---|
| SETUP-1 | Wedding profile: bride name, groom name, primary wedding date, city, venue (optional free text), and timezone (default Asia/Kolkata, chosen when the wedding is created). | P0 |
| SETUP-2 | Add unlimited events with quick-add presets (Engagement, Mehendi, Haldi, Sangeet, Wedding, Reception) or a custom name. | P0 |
| SETUP-3 | Event fields: name, date, start time, end time (optional), venue name, address, map link, dress code, notes, and "show on public website" (default on). | P0 |
| SETUP-4 | Edit, reorder and delete events. Deleting an event that has invited households or RSVPs requires confirmation. | P0 |
| SETUP-5 | Timeline view of all events in date order. | P1 |
| SETUP-6 | After invitations are sent, changing an event's date, time or venue prompts the admin to email affected families an "event updated" notice. | P1 |

### 5.3 Guest and family management (GUEST)
A **household** is a family or group that receives one invitation.

| ID | Requirement | Priority |
|---|---|---|
| GUEST-1 | Household fields: display name (e.g. "Sharma family"), member names, headcount (defaults to member count, editable), email (optional), phone (optional), side (if enabled), tags, notes. | P0 |
| GUEST-2 | Assign events per household (multi-select, plus an "all events" shortcut). | P0 |
| GUEST-3 | Import from CSV or Excel with column mapping, a preview, row-level error reporting, and a downloadable template. | P0 |
| GUEST-4 | Search, filter (side, tag, event, invite status, RSVP status) and sort. | P0 |
| GUEST-5 | Totals: households and invited headcount per event. | P0 |
| GUEST-6 | Bulk actions on selected households: assign events, add tag, delete, send invitation. | P1 |
| GUEST-7 | Warn about possible duplicates (same name plus phone or email) on add and import. | P1 |
| GUEST-8 | Export the guest list to CSV including invite and RSVP status. | P1 |

### 5.4 Invitation and RSVP (INV)

**Invitation setup**
| ID | Requirement | Priority |
|---|---|---|
| INV-1 | The couple uploads one invitation as an image (JPG, PNG or WebP, up to 10 MB) or a video (MP4, size cap to be decided, see Open Questions). | P0 |
| INV-2 | The couple writes an invitation message shown in the email and on the guest page. A default is provided. | P0 |
| INV-3 | RSVP deadline set at wedding level. | P0 |
| INV-4 | Optional per-event invitation media and per-event RSVP deadline. | P2 |

**Sending**
| ID | Requirement | Priority |
|---|---|---|
| INV-5 | Each household has a unique personal link with an unguessable token. The couple can copy or regenerate it. | P0 |
| INV-6 | Email invitation to households that have an email address. The email contains the message, a preview image or video thumbnail, and a button to the personal page. Video is never embedded in the email itself. | P0 |
| INV-7 | Send individually or in bulk (selected or all "not sent"). A confirmation step shows the recipient count, and the admin can send a test to themselves first. | P0 |
| INV-8 | Households without an email are shown as "Link only". The admin can copy the link and mark the household "Sent manually" so tracking still works. | P0 |
| INV-9 | "Share on WhatsApp" button that opens WhatsApp with a prefilled message containing the household's link (no WhatsApp API needed). | P1 |

**Guest page (no login)**
| ID | Requirement | Priority |
|---|---|---|
| INV-10 | The guest sees a greeting with the household name, the invitation media, the message, and **only the events they are invited to** (date, time, venue, map link, dress code). | P0 |
| INV-11 | RSVP per event: Attending or Not attending. If attending, the number of people (1 up to the household's invited headcount for that event) and an optional note. | P0 |
| INV-12 | Guests can edit their reply until the deadline. After the deadline the page is read-only with a message to contact the couple. | P0 |
| INV-13 | Clear states for invalid or revoked links, deadline passed, and unavailable invitations. | P0 |
| INV-14 | Confirmation screen after RSVP, and a confirmation email if the household has an email. | P1 |
| INV-15 | "Add to calendar" (.ics) per event. | P1 |

**Tracking and follow-up**
| ID | Requirement | Priority |
|---|---|---|
| INV-16 | Invite status per household: **Not sent → Sent → Opened → Responded** (Responded means every invited event has an answer, otherwise "Partially responded"). "Opened" means the personal page was loaded in a guest's browser (not by a link-preview bot), not that an email was opened, because email open tracking is unreliable. | P0 |
| INV-17 | An admin or Manager can record or edit an RSVP on a household's behalf (for replies received by phone or WhatsApp). Such RSVPs are labelled "Recorded by host". | P0 |
| INV-18 | Resend an invitation, and send a manual reminder to non-responders (selected or all). | P0 |
| INV-19 | Live RSVP counts per event: invited, responded, attending (households and headcount), declined, pending. Export to CSV. | P0 |
| INV-20 | Removing an event from a household after sending removes it from the guest page and archives any RSVP for that event. | P1 |

**Key acceptance criteria**
- A guest can see only their own household and only their invited events. Altering the URL never exposes another household or any other wedding data.
- Attending count can never exceed the invited headcount.
- If a guest and an admin edit the same RSVP at nearly the same time, the last write wins and both changes are recorded in an audit log.

### 5.5 Dashboard (DASH)
| ID | Requirement | Priority |
|---|---|---|
| DASH-1 | Days-to-wedding countdown. | P0 |
| DASH-2 | Next three upcoming events. | P0 |
| DASH-3 | RSVP summary (invited, responded, attending headcount, pending). | P0 |
| DASH-4 | Tasks due soon and overdue. | P0 |
| DASH-5 | Total spent, with the top categories. | P0 |
| DASH-6 | Guest and RSVP numbers on every card respect the member's side scope. | P0 |
| DASH-7 | Setup checklist for new weddings (add events, add guests, upload invitation, send invitations). | P1 |

### 5.6 Task planner (TASK)
| ID | Requirement | Priority |
|---|---|---|
| TASK-1 | Task fields: title, description (optional), due date, assignee (an admin or Manager), status (To do, In progress, Done), and linked event (optional). | P0 |
| TASK-2 | List view with filters (assignee, event, status, due date) and a "My tasks" shortcut. | P0 |
| TASK-3 | Starter checklist of common wedding tasks that the couple can import and edit. | P1 |
| TASK-4 | Removed in v1.1: every member can edit tasks, so no special assignee rule is needed. | n/a |
| TASK-5 | Email to the assignee when a task is assigned, and due-date reminders (see NOTIF). | P1 |

### 5.7 Expense tracker (EXP)
| ID | Requirement | Priority |
|---|---|---|
| EXP-1 | Expense fields: amount (INR), date, category, description, event (optional), vendor (optional), paid by, notes, and receipt (image or PDF, up to 10 MB). | P0 |
| EXP-2 | Preset categories (Venue, Catering, Decor, Photography and Video, Attire, Jewellery, Makeup and Beauty, Invitations, Entertainment, Transport, Gifts, Miscellaneous) plus custom categories. | P0 |
| EXP-3 | "Paid by" can be picked from team members or entered as free text (e.g. "Papa"). | P0 |
| EXP-4 | Totals overall and grouped by category, event, vendor and paid-by, with a date-range filter. Expenses with no event appear under "General". | P0 |
| EXP-5 | Amounts are stored as integers in paise and displayed in Indian number format (e.g. ₹12,34,567). | P0 |
| EXP-6 | Search and filter the expense list. | P0 |
| EXP-7 | Export to CSV. | P1 |
| EXP-8 | Admins and Managers can view and log expenses. | P0 |

### 5.8 Vendor tracker (VEND)
| ID | Requirement | Priority |
|---|---|---|
| VEND-1 | Vendor fields: name, category (caterer, photographer, decorator, venue, makeup, mehendi artist, DJ, etc.), phone, WhatsApp number, email, notes. | P0 |
| VEND-2 | Status: Shortlisted, Booked, Completed. | P0 |
| VEND-3 | Link a vendor to one or more events. | P0 |
| VEND-4 | Link expenses to a vendor. The vendor page shows the total paid. | P0 |
| VEND-5 | Attach quotes or contracts (image or PDF, up to 10 MB each). | P0 |
| VEND-6 | Filter by category, status and event. | P0 |
| VEND-7 | Tap-to-call, WhatsApp and email actions on mobile. | P1 |

### 5.9 Wedding website and live stream (WEB)
| ID | Requirement | Priority |
|---|---|---|
| WEB-1 | Public URL `/w/{slug}` with a custom slug (e.g. `/w/riya-and-arjun`). Slugs are unique, lowercase letters, numbers and single hyphens, 3 to 60 characters, with reserved words blocked. The suggestion is `{bride}-{groom}-{dd}-{mon}-{yyyy}`, with a suffix if taken. | P0 |
| WEB-2 | At least 3 themes, each with an accent colour choice. | P0 |
| WEB-3 | Sections the couple can toggle: hero (names, date, city, cover photo), our story, events (only those marked "show on website"), photos (up to 12), live stream, and a link to the photo gallery. | P0 |
| WEB-4 | Publish and unpublish. Unpublished sites return a 404 to visitors. Admins can preview. | P0 |
| WEB-5 | Live stream: the couple pastes a YouTube live or video URL, only YouTube domains are accepted, and it is embedded with the privacy-enhanced YouTube player. The couple can set a start time and toggle the section on or off. | P0 |
| WEB-6 | Open Graph title and image so the link previews well in WhatsApp. | P1 |
| WEB-7 | Search engines are blocked by default (noindex). The couple can opt in to indexing. | P1 |
| WEB-8 | Optional password protection for the site. | P2 |

### 5.10 Private photo gallery (GAL)
| ID | Requirement | Priority |
|---|---|---|
| GAL-1 | One gallery per wedding with an unguessable link and a downloadable QR code (PNG, SVG and print-ready PDF). | P0 |
| GAL-2 | Guests open the link with no login and upload multiple photos at once (JPG, PNG, HEIC, WebP picked on the device). They can optionally enter their name and choose an album. | P0 |
| GAL-3 | The guest's browser resizes each photo to about 2000px (WebP) and makes a thumbnail before upload, which also removes location data. Originals are not kept; the display copy is the downloadable version. | P0 |
| GAL-4 | Albums by event, plus a "General" album. | P0 |
| GAL-5 | Gallery visibility setting: guests can view all photos, or the gallery is upload-only and only the couple can view. Default is guests can view. | P0 |
| GAL-6 | Couple moderation: delete, hide, move between albums, and bulk select. | P0 |
| GAL-7 | Turn uploads on or off, and turn guest viewing on or off. | P0 |
| GAL-8 | Download photos one at a time, by album, or everything. ZIPs are built in the browser in parts of about 500 photos. | P0 |
| GAL-9 | Per-wedding storage cap and per-visitor upload rate limits. | P0 |
| GAL-10 | Regenerate the gallery link, which invalidates the old link and QR. | P1 |
| GAL-11 | Upload progress, automatic retry and resume on poor connections. | P1 |
| GAL-12 | Managers can moderate photos. Gallery settings and link regeneration are admin-only. | P1 |
| GAL-13 | Optional upload window (opens and closes at set times). | P2 |

### 5.11 Email notifications and reminders (NOTIF)
| ID | Requirement | Priority |
|---|---|---|
| NOTIF-1 | Transactional emails: password reset, member invitation, guest invitation, RSVP reminder, RSVP confirmation, event-updated notice, task assigned, task due reminder, retention warning. | P0 |
| NOTIF-2 | Every send is logged with a status (sent, delivered, bounced, complained, failed). A bounced address is flagged on the household. | P0 |
| NOTIF-3 | Automatic RSVP reminders, e.g. 7 days and 2 days before the deadline. The couple can switch this on or off. They go only to households with an email address and an incomplete response. | P1 |
| NOTIF-4 | Task due reminders to the assignee, 1 day before and on the due date. (A per-user opt-out is deferred until after v1.) | P1 |
| NOTIF-5 | Deferred until after v1: daily digest to the couple summarising new RSVPs. | Deferred |
| NOTIF-6 | Guest emails include a "stop reminders" link that stops reminders but not access to the invitation. | P1 |
| NOTIF-7 | Scheduled emails are sent at 9:00 AM in the wedding timezone. | P1 |

### 5.12 Marketing homepage (HOME)
| ID | Requirement | Priority |
|---|---|---|
| HOME-1 | A public landing page at `/` for couples, following the design system (architecture §18). Static: no data and no API calls. | P0 |
| HOME-2 | Sections: header (logo, Features, How it works, Log in, Start planning), hero with product previews, six feature cards, three steps, the guest experience with a sample invite, three privacy points, a closing call to action, and a footer (Features, How it works, Log in, Privacy). | P0 |
| HOME-3 | "Start planning" goes to `/signup` and "Log in" to `/login`. "See a sample invite" scrolls to the guest section. | P0 |
| HOME-4 | Product previews are built in HTML with sample data, not screenshots, and are hidden from screen readers. | P1 |
| HOME-5 | Copy only claims what v1 does. No pricing, customer counts or features outside this PRD. | P0 |
| HOME-6 | Mobile-first: on phones the header shows the logo and "Start planning", and the hero stacks the dashboard preview above the invite preview. | P0 |

---

## 6. Key user flows

**Couple onboarding**
1. Sign up with name, email and password.
2. Enter names, wedding date and city.
3. Add events from presets, then edit details.
4. Optionally turn on bride side / groom side.
5. Invite the partner (Admin) and family members (Managers), setting side scopes.
6. Land on the dashboard with the setup checklist.

*Built so far (Oct 2026):* steps 1, 2 and 4 on one "Create your wedding" screen (`/app/new`), then a wedding overview with a setup checklist. Steps 3 and 5 join the flow as onboarding steps when events and team invites are built. After login, `/app` opens the user's only wedding, shows a picker when there are several, or goes to `/app/new` when there are none.

**Sending invitations**
1. Add households manually or import a CSV.
2. Assign events to each household.
3. Upload the invitation and write the message.
4. Set the RSVP deadline.
5. Send a test email to yourself.
6. Send in bulk, then copy links for households without email.

**Guest RSVP**
1. Guest opens the personal link from email or WhatsApp.
2. Sees the invitation and their events.
3. Answers Attending or Not attending per event, with headcount.
4. Sees a confirmation. Can return to the same link to edit until the deadline.

**Photo upload on the wedding day**
1. Guest scans the QR code or opens the gallery link.
2. Selects photos, optionally enters a name and album.
3. Uploads with a progress indicator and automatic retry.
4. Browses the gallery if the couple has allowed viewing.

---

## 7. Data model (high level)

| Entity | Key fields |
|---|---|
| **User** | id, email, name |
| **Wedding** | id, bride name, groom name, date, city, venue, timezone, sides enabled, RSVP deadline, invitation message |
| **WeddingMember** | wedding, user, role (admin or manager), side scope |
| **Event** | wedding, name, date, times, venue, address, map link, dress code, notes, show on website, order |
| **Household** | wedding, display name, members, headcount, email, phone, side, tags, notes, personal token, invite status, bounced flag |
| **HouseholdEvent** | household, event, invited headcount |
| **Rsvp** | household, event, status, attending count, note, recorded by (guest or host), timestamps |
| **InviteMedia** | wedding, type (image or video), file reference |
| **Task** | wedding, title, description, due date, assignee, status, event |
| **Expense** | wedding, amount in paise, date, category, description, event, vendor, paid by, notes |
| **Vendor** | wedding, name, category, contacts, status, notes |
| **VendorEvent** | vendor, event |
| **Attachment** | owner (expense or vendor), file reference, type, size |
| **WebsiteConfig** | wedding, slug, theme, accent colour, sections, published, story text, live stream URL and start time |
| **GalleryConfig** | wedding, token, uploads open, viewing mode, storage cap |
| **Photo** | wedding, album, uploader name, display and thumbnail file references, hidden flag, size |
| **EmailLog** | wedding, recipient, template, status, provider message id, timestamps |
| **AuditLog** | wedding, actor, action, target, timestamp |

---

## 8. Non-functional requirements

**Performance and scale**
- Guest pages and the public website load in under 2.5 seconds on 4G. Media is resized and served through a CDN.
- Design for a wedding of up to about 1,000 guests (a few hundred households) and gallery bursts of thousands of photos on the wedding day.
- Photo uploads go directly from the browser to object storage using presigned URLs, so the API server is not the bottleneck.

**Security and privacy**
- Authorization is enforced on the server for every request. Hiding UI elements is never the only control.
- Personal and gallery links use random tokens of at least 128 bits, never sequential IDs, and can be regenerated.
- Passwords are hashed with Argon2id. Password reset links are single-use and expire in 30 minutes.
- Rate limiting on login, RSVP and upload endpoints.
- Uploaded files are validated by content type, not only file extension.
- Guest personal data (names, email, phone) is limited to what is needed. Admins can export a wedding's data. Wedding deletion is not self-service in v1 and is done manually on request. Confirm obligations under India's Digital Personal Data Protection Act, 2023 before launch.

**Accessibility and compatibility**
- Mobile-first responsive design, tested in the in-app browsers of WhatsApp and Gmail as well as Chrome and Safari.
- WCAG 2.1 AA for guest-facing pages. Interface text is ready for translation later.

**Reliability**
- Daily database backups and stored files that can be recovered.
- Background jobs (email, reminders, image processing, ZIPs) retry on failure.
- Basic error monitoring and email delivery monitoring.

---

## 9. Technical approach
Superseded by `docs/system-architecture.md`, which is the source of truth for the stack (Next.js modular monolith, MongoDB Atlas, Cloudflare R2, Resend, Vercel in Mumbai).

---

## 10. Release plan

| Phase | Scope | Exit criteria |
|---|---|---|
| **1. Core** | Auth and access, wedding setup and events, guests, invitation and RSVP (including resend and manual reminders), basic email sending | A couple can import guests, send invitations, and see live RSVP counts. A side-scoped Manager works correctly. |
| **2. Planning tools** | Task planner, expense tracker, dashboard, automatic reminders and digest | A family can run tasks and expenses for a full wedding, and the dashboard reflects permissions. |
| **3. Sharing** | Wedding website, YouTube live stream embed, private photo gallery with QR code | Guests can upload from the QR code on a phone, and the couple can moderate and download everything. |
| **4. Vendors** | Vendor tracker linked to events and expenses, then Google Places wedding location and vendor search at the end of the phase | Vendor totals match linked expenses. |

**Suggested pilot:** run Phase 1 with one real family wedding before building Phase 2, so guest flows are tested with real guests.

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Scope creep across 11 modules | Ship in the four phases above with exit criteria, and do not start a phase before the previous one works. |
| Invitation emails land in spam | Dedicated sending domain with SPF, DKIM and DMARC, test send before bulk, and copyable links as a fallback. |
| Many guests have no email | Link-only households, a WhatsApp share button, and manual "Sent" marking. |
| Personal links get forwarded | Each link exposes only that household's own invitation and events, and links can be regenerated. |
| Photo storage cost and abuse | Storage cap per wedding, rate limits, moderation tools, and a retention policy. |
| Wedding-day upload burst | Presigned direct uploads, CDN, and asynchronous image processing. |
| Guest personal data handling | Data minimisation, export and delete tools, and a legal review before launch. |

---

## 12. Open questions

| # | Question | Proposed default |
|---|---|---|
| 1 | Maximum size and length for a video invitation, and where it is hosted? | **Decided:** MP4 up to 50 MB in R2. A YouTube link alternative is not in v1. |
| 2 | Storage cap per wedding, and how long are photos and data kept after the wedding? | **Decided:** 3 GB per wedding. Files kept for 12 months after the wedding date, with a warning at 11 months. |
| 3 | Should the gallery be protected by a passcode as well as the link? | Link and QR only in v1. Passcode as P2. |
| 4 | Does RSVP capture individual member names, or only a headcount? | Headcount only. |
| 5 | Should the email sender name be the couple's names or the app's name? | Couple's names as display name, sent from the app's domain. |
| 6 | How many website themes and who designs them? | 3 themes in v1. |
| 7 | Hindi or other Indian languages for guest pages? | English only in v1, with text structured for translation later. |
| 8 | Should tasks support comments and attachments? | Not in v1. |

---

## 13. Future backlog (after v1)
WhatsApp and SMS invitations and reminders, a vendor marketplace, per-module member permissions, daily RSVP digest, self-service wedding deletion, budgeting, shagun and gift tracking, guest accommodation and travel, additional languages, planner and multi-wedding accounts, invitation templates and a design tool, video uploads in the gallery, seating plans, task comments, payments, and native mobile apps.
