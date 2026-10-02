# Make My Marriage: API Specification

| | |
|---|---|
| **Version** | 1.1 (Draft for review) |
| **Date** | 28 September 2026 |
| **Owner** | Irfan |
| **Style** | REST, JSON over HTTPS |
| **Related docs** | PRD v1.1, System Architecture v1.2, Database Design v1.1 |

---

## 1. Overview

The REST API is served by Next.js Route Handlers under `/api`. The couple's app, the family members' app, and the guest pages all use this one API.

| Group | Base path | Used by |
|---|---|---|
| Auth and account | `/api/auth`, `/api/me` | Everyone who logs in |
| Wedding resources | `/api/weddings/{weddingId}/...` | Logged-in members of that wedding |
| Member invites | `/api/member-invites/{token}` | People invited to join a wedding |
| Public guest access | `/api/public/...` | Guests (no account) and website visitors |
| System | `/api/cron`, `/api/webhooks`, `/api/health` | Scheduler, Resend, uptime checks |

The API is not versioned in the URL for v1, because only our own frontend uses it. If a mobile app or third party ever uses it, `/api/v2` will be added for breaking changes.

---

## 2. Conventions

### 2.1 Format
| Item | Rule |
|---|---|
| Content type | `application/json` for requests and responses (except CSV export, ICS and QR downloads) |
| Field names | camelCase |
| IDs | 24-character hex strings (MongoDB ObjectId), e.g. `"66f1b0000000000000000001"` |
| Timestamps | ISO 8601 in UTC, e.g. `"2026-09-24T06:30:00.000Z"` |
| Calendar dates | `"YYYY-MM-DD"`, in the wedding's timezone |
| Clock times | `"HH:mm"`, 24-hour |
| Money | Integer paise in `amountPaise`. ₹1,250.50 → `125050` |
| Empty values | `null` for "no value". Omitted fields in a PATCH mean "don't change" |
| Unknown fields | Rejected with `VALIDATION_ERROR` |

### 2.2 HTTP methods
| Method | Use |
|---|---|
| `GET` | Read. Never changes data |
| `POST` | Create, or run an action (`/send`, `/archive`) |
| `PATCH` | Partial update. Only the fields sent are changed |
| `PUT` | Replace a single settings object or an RSVP |
| `DELETE` | Delete. Returns `204 No Content` |

### 2.3 Success responses
Single item:
```json
{ "data": { "id": "66f1...", "name": "Mehendi" } }
```

List:
```json
{
  "data": [ { "id": "66f1..." } ],
  "meta": { "nextCursor": "eyJpZCI6IjY2ZjEuLi4ifQ", "total": 312 }
}
```
`total` is included only where noted, because counting large lists costs extra.

Action with no content: `204 No Content`.

### 2.4 Error responses
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check the highlighted fields.",
    "details": [
      { "path": "headcount", "message": "Must be at least 1" }
    ],
    "requestId": "req_7f3a9c21"
  }
}
```
- `code` is stable and safe to use in code. `message` is for display and may change.
- `details` appears only on validation errors.
- `requestId` matches the server logs, so a problem can be traced.

### 2.5 Pagination
Lists use cursor pagination.

| Query param | Default | Max | Notes |
|---|---|---|---|
| `limit` | 50 | 100 | Gallery photo lists default to 60 |
| `cursor` | none | | Pass `meta.nextCursor` from the previous response |

When `meta.nextCursor` is `null`, there are no more results. Cursors are opaque, so don't build them yourself.

### 2.6 Filtering and sorting
Filters are query parameters, e.g. `?side=bride&status=booked`. Multiple values use commas: `?tags=Office,College%20friends`. Each list endpoint documents its allowed filters and `sort` values. Unknown filters are rejected.

---

## 3. Authentication and access

### 3.1 Session cookie
- Logging in or signing up sets the `mmm_session` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, 30 days, extended while active).
- The browser sends it automatically. The frontend never reads it.
- Requests that change data (`POST`, `PATCH`, `PUT`, `DELETE`) must come from the app's own origin. The server checks the `Origin` header and rejects others with `403 FORBIDDEN`.

### 3.2 Access levels
Each endpoint lists one of these:

| Access | Meaning |
|---|---|
| **Public** | No login needed |
| **Session** | Logged in |
| **Member** | Logged in and a member (Admin or Manager) of `{weddingId}` |
| **Admin** | Logged in and an Admin of `{weddingId}` |
| **Guest token** | Valid household invitation token in the path |
| **Gallery token** | Valid gallery token in the path |
| **Cron secret** | `Authorization: Bearer <CRON_SECRET>` header |
| **Webhook signature** | Valid Resend webhook signature headers |

### 3.3 Rules applied to every wedding request
1. **Not a member → `404 NOT_FOUND`**, not 403, so wedding IDs can't be probed.
2. **Manager on an Admin-only endpoint → `403 FORBIDDEN`.**
3. **Side scoping:** a Manager scoped to one side automatically sees and changes only that side's households. Requests for the other side's households return `404 NOT_FOUND`.
4. **Archived wedding:** every write returns `409 WEDDING_ARCHIVED`, except `POST /unarchive`.

### 3.4 Rate limits
Rate-limited endpoints return `429 RATE_LIMITED` with a `Retry-After` header (seconds).

| Endpoint | Limit |
|---|---|
| `POST /api/auth/login` | 5 per 15 min per email, 20 per 15 min per IP |
| `POST /api/auth/signup` | 5 per hour per IP |
| `POST /api/auth/forgot-password` | 3 per hour per email |
| `GET /api/public/invitations/{token}` and `POST .../opened` | 60 per minute per token (shared) |
| `PUT /api/public/invitations/{token}/rsvp` | 10 per minute per token |
| `POST /api/public/gallery/{token}/uploads` | 30 per 10 min per token and device |
| `GET /api/public/gallery/{token}/photos` | 120 per minute per token and device |
| `POST /api/weddings/{id}/places/vendor-search` | 50 per wedding per month (`429 PLACES_QUOTA_REACHED`) |

---

## 4. Shared resource shapes

API responses never include password hashes, session or token hashes, or internal-only fields.

### 4.1 User
```json
{ "id": "66f1a2...", "email": "irfan@example.com", "name": "Irfan" }
```

### 4.2 Wedding summary (in lists)
```json
{
  "id": "66f1b0...",
  "brideName": "Nafiya",
  "groomName": "Irfan",
  "weddingDate": "2028-04-14",
  "city": "Kochi",
  "status": "active",
  "myRole": "admin"
}
```

### 4.3 Wedding
```json
{
  "id": "66f1b0...",
  "brideName": "Nafiya",
  "groomName": "Irfan",
  "weddingDate": "2028-04-14",
  "city": "Kochi",
  "venue": "Grand Hyatt, Bolgatty Island",
  "timezone": "Asia/Kolkata",
  "sidesEnabled": true,
  "status": "active",
  "archivedAt": null,
  "location": {
    "placeId": "ChIJ...",
    "name": "Grand Hyatt Kochi Bolgatty",
    "address": "Bolgatty Island, Mulavukad, Kochi, Kerala",
    "lat": 9.9867,
    "lng": 76.2663,
    "searchRadiusKm": 10
  },
  "customExpenseCategories": ["Mehendi artist"],
  "guestTags": ["College friends", "Office"],
  "me": { "role": "admin", "sideScope": "both" },
  "createdAt": "2026-09-20T10:05:00.000Z",
  "updatedAt": "2026-09-24T06:40:00.000Z"
}
```

### 4.4 Member
```json
{
  "id": "66f2...",
  "user": { "id": "66f1a3...", "name": "Ahmed", "email": "ahmed@example.com" },
  "role": "manager",
  "sideScope": "groom",
  "joinedAt": "2026-09-21T09:00:00.000Z"
}
```

### 4.5 Event
```json
{
  "id": "66f1d0...02",
  "name": "Mehendi",
  "presetKey": "mehendi",
  "date": "2028-04-12",
  "startTime": "17:00",
  "endTime": "22:00",
  "venueName": "Family home",
  "address": "12 MG Road, Kochi",
  "mapUrl": "https://maps.google.com/?q=...",
  "dressCode": "Green or yellow",
  "notes": "",
  "showOnWebsite": true,
  "order": 0
}
```

### 4.6 Household
```json
{
  "id": "66f1c0...101",
  "displayName": "Sharma family",
  "members": [{ "name": "Rajesh Sharma" }, { "name": "Priya Sharma" }],
  "headcount": 2,
  "email": "rajesh.sharma@example.com",
  "phone": "+919876543210",
  "side": "groom",
  "tags": ["Office"],
  "notes": "",
  "inviteLink": "https://<app-domain>/invited/Hk3nP0xQ7rT2wY5zA9bC1d",
  "invitedEvents": [{ "eventId": "66f1d0...02", "headcount": 2 }],
  "rsvps": [
    {
      "eventId": "66f1d0...02",
      "status": "attending",
      "attendingCount": 2,
      "note": "",
      "recordedBy": "guest",
      "respondedAt": "2028-02-02T12:00:00.000Z",
      "updatedAt": "2028-02-02T12:00:00.000Z"
    }
  ],
  "inviteStatus": "sent",
  "sentAt": "2028-01-15T03:30:00.000Z",
  "openedAt": "2028-01-15T09:12:00.000Z",
  "responseStatus": "complete",
  "emailBounced": false,
  "reminderCount": 0,
  "createdAt": "2026-09-24T07:00:00.000Z",
  "updatedAt": "2028-02-02T12:00:00.000Z"
}
```

### 4.7 Task
```json
{
  "id": "66f3...",
  "title": "Book mehendi artist",
  "description": "",
  "dueDate": "2027-12-01",
  "assignee": { "userId": "66f1a3...", "name": "Ahmed" },
  "status": "todo",
  "eventId": "66f1d0...02",
  "completedAt": null,
  "createdAt": "2026-09-24T07:00:00.000Z"
}
```

### 4.8 Expense
```json
{
  "id": "66f1e0...201",
  "amountPaise": 7500000,
  "date": "2027-11-02",
  "category": "photography_video",
  "description": "Photographer advance",
  "eventId": null,
  "vendor": { "id": "66f1f0...301", "name": "Lens & Light Studios" },
  "paidBy": { "type": "name", "name": "Papa" },
  "notes": "Balance due after the wedding",
  "receipt": {
    "fileName": "advance.pdf",
    "contentType": "application/pdf",
    "sizeBytes": 182340,
    "url": "https://<r2-signed-url>"
  },
  "createdAt": "2027-11-02T10:00:00.000Z"
}
```
`vendor.id` is `null` and `vendor.name` shows the saved name if the vendor was deleted. `receipt.url` is a signed link valid for 1 hour.

### 4.9 Vendor
```json
{
  "id": "66f1f0...301",
  "name": "Lens & Light Studios",
  "category": "photographer",
  "phone": "+919812345678",
  "whatsapp": "+919812345678",
  "email": "hello@lenslight.example",
  "notes": "",
  "status": "booked",
  "eventIds": ["66f1d0...02", "66f1d0...03"],
  "source": "google",
  "placeId": "ChIJ...",
  "attachments": [
    { "id": "att_1", "fileName": "quote.pdf", "contentType": "application/pdf", "sizeBytes": 220000, "url": "https://<r2-signed-url>" }
  ],
  "totalPaidPaise": 7500000,
  "createdAt": "2027-10-10T10:00:00.000Z"
}
```

### 4.10 Photo
```json
{
  "id": "66f4...",
  "albumEventId": "66f1d0...02",
  "uploaderName": "Sana",
  "width": 2000,
  "height": 1500,
  "thumbUrl": "https://<r2-signed-url>",
  "displayUrl": "https://<r2-signed-url>",
  "hidden": false,
  "createdAt": "2028-04-12T14:30:00.000Z"
}
```
`hidden` is only included in the couple's view.

### 4.11 Enums reference
| Field | Values |
|---|---|
| `role` | `admin`, `manager` |
| `sideScope` | `bride`, `groom`, `both` |
| `side` | `bride`, `groom`, `null` |
| `wedding.status` | `active`, `archived` |
| `presetKey` | `engagement`, `mehendi`, `haldi`, `sangeet`, `wedding`, `reception`, `custom` |
| `inviteStatus` | `not_sent`, `queued`, `sent`, `sent_manually`, `failed` |
| `responseStatus` | `none`, `partial`, `complete` |
| `rsvp.status` | `attending`, `declined` |
| `task.status` | `todo`, `in_progress`, `done` |
| `expense.category` (presets) | `venue`, `catering`, `decor`, `photography_video`, `attire`, `jewellery`, `makeup_beauty`, `invitations`, `entertainment`, `transport`, `gifts`, `miscellaneous`, or a custom category |
| `vendor.category` | `venue`, `caterer`, `photographer`, `videographer`, `decorator`, `makeup_artist`, `mehendi_artist`, `dj_music`, `florist`, `transport`, `priest_officiant`, `other` |
| `vendor.status` | `shortlisted`, `booked`, `completed` |
| `website.theme` | `classic`, `floral`, `modern` |

---

## 5. Auth and account

### 5.1 `POST /api/auth/signup`
**Access:** Public

Request:
```json
{ "name": "Irfan", "email": "irfan@example.com", "password": "correct-horse-42" }
```
| Field | Rules |
|---|---|
| `name` | 1-80 characters |
| `email` | Valid email, max 254 |
| `password` | 8-128 characters, not a common password |

Response `201`: sets the session cookie.
```json
{ "data": { "user": { "id": "66f1a2...", "email": "irfan@example.com", "name": "Irfan" } } }
```
Errors: `VALIDATION_ERROR`, `EMAIL_TAKEN` (409), `WEAK_PASSWORD` (400), `RATE_LIMITED`.

### 5.2 `POST /api/auth/login`
**Access:** Public

Request:
```json
{ "email": "irfan@example.com", "password": "correct-horse-42" }
```
Response `200`: sets the session cookie, returns `{ "data": { "user": { ... } } }`.

Errors: `INVALID_CREDENTIALS` (401, same message whether the email exists or not), `RATE_LIMITED`.

### 5.3 `POST /api/auth/logout`
**Access:** Session. Ends the current session and clears the cookie. Response `204`.

### 5.4 `POST /api/auth/logout-all`
**Access:** Session. Ends every session for the user, including this one. Response `204`.

### 5.5 `POST /api/auth/forgot-password`
**Access:** Public

Request: `{ "email": "irfan@example.com" }`

Response `200` always, whether or not the account exists:
```json
{ "data": { "message": "If an account exists for this email, a reset link has been sent." } }
```
Errors: `RATE_LIMITED`.

### 5.6 `POST /api/auth/reset-password`
**Access:** Public

Request:
```json
{ "token": "from-the-email-link", "password": "new-strong-password" }
```
Response `200`: ends all old sessions, starts a new session, returns `{ "data": { "user": { ... } } }`.

Errors: `RESET_TOKEN_INVALID` (400, covers expired and already used), `WEAK_PASSWORD`.

### 5.7 `GET /api/me`
**Access:** Session

Response `200`:
```json
{
  "data": {
    "user": { "id": "66f1a2...", "email": "irfan@example.com", "name": "Irfan" },
    "weddings": [ { "id": "66f1b0...", "brideName": "Nafiya", "groomName": "Irfan", "weddingDate": "2028-04-14", "city": "Kochi", "status": "active", "myRole": "admin" } ]
  }
}
```
Errors: `UNAUTHENTICATED` (401).

### 5.8 `PATCH /api/me`
**Access:** Session. Request: `{ "name": "Irfan K" }`. Response `200` with the updated user.

---

## 6. Weddings

### 6.1 `POST /api/weddings`
**Access:** Session. Creates a wedding. The caller becomes its first Admin.

Request:
```json
{
  "brideName": "Nafiya",
  "groomName": "Irfan",
  "weddingDate": "2028-04-14",
  "city": "Kochi",
  "venue": "Grand Hyatt, Bolgatty Island",
  "timezone": "Asia/Kolkata",
  "sidesEnabled": true
}
```
Response `201`: `{ "data": <Wedding> }`. Errors: `VALIDATION_ERROR`, `ALREADY_HAS_WEDDING` (409).

Rules: `brideName` and `groomName` 1-60 characters with at least one letter (any script), `city` 1-80, `venue` optional free text up to 200 (default `""`), `timezone` optional valid IANA timezone (default `Asia/Kolkata`; stored in its standard spelling, so `asia/kolkata` becomes `Asia/Kolkata`), `weddingDate` from today to 5 years ahead in that timezone (`VALIDATION_ERROR` otherwise), `sidesEnabled` optional (default `false`).

Each person can be an admin of only one wedding: a caller who is already an admin of a wedding gets `409 ALREADY_HAS_WEDDING`. Being a Manager in other weddings doesn't count.

Server-side defaults: timezone `Asia/Kolkata`, invitation message, website settings (unpublished, suggested slug `{bride}-{groom}-{dd}-{mon}-{yyyy}` with `-2`, `-3`... if taken), gallery token, 3 GB storage cap. The wedding and the caller's admin membership are created in one transaction.

### 6.2 `GET /api/weddings/{weddingId}`
**Access:** Member. Response `200`: `{ "data": <Wedding> }`.

### 6.3 `PATCH /api/weddings/{weddingId}`
**Access:** Admin

Request (any subset):
```json
{
  "brideName": "Nafiya",
  "groomName": "Irfan",
  "weddingDate": "2028-04-14",
  "city": "Kochi",
  "venue": "Grand Hyatt, Bolgatty Island",
  "timezone": "Asia/Kolkata",
  "sidesEnabled": true,
  "customExpenseCategories": ["Mehendi artist"],
  "guestTags": ["College friends", "Office"]
}
```
Response `200`: `{ "data": <Wedding> }`

Rules:
- Admins only: a Manager gets `403 FORBIDDEN`, a non-member `404 NOT_FOUND`. An archived wedding returns `409 WEDDING_ARCHIVED`.
- Field rules are the same as §6.1. Unknown fields return `VALIDATION_ERROR`; only fields that differ from the saved values are written.
- A **changed** `weddingDate` must be from today to 5 years ahead in the wedding's timezone (the new one if `timezone` is changed in the same request). An unchanged date is never re-checked, so a wedding that has already happened can still be edited.
- Changing the names or date does **not** change the website address (`website.slug`), so links already shared keep working. The address is changed only through §17.4.
- `customExpenseCategories` and `guestTags` are accepted once the expenses and guests modules are built; until then they are rejected as unknown fields.
- Turning `sidesEnabled` off keeps each household's `side` value but hides it everywhere, and Managers' side scopes stop applying.
- Removing a tag from `guestTags` removes it from all households.
- Removing a custom category that is used by expenses returns `409 CATEGORY_IN_USE`.

### 6.4 `POST /api/weddings/{weddingId}/archive`
**Access:** Admin. Makes the wedding read-only. Response `200`: `{ "data": <Wedding> }`.

### 6.5 `POST /api/weddings/{weddingId}/unarchive`
**Access:** Admin. Response `200`: `{ "data": <Wedding> }`.

---

## 7. Team members

### 7.1 `GET /api/weddings/{weddingId}/members`
**Access:** Member

Response `200`:
```json
{
  "data": {
    "members": [ <Member> ],
    "pendingInvites": [
      { "id": "66f5...", "email": "uncle@example.com", "role": "manager", "sideScope": "bride", "expiresAt": "2026-10-01T09:00:00.000Z" }
    ]
  }
}
```
Managers see the member list but not pending invites.

### 7.2 `POST /api/weddings/{weddingId}/members/invites`
**Access:** Admin. Sends a member invite email immediately.

Request:
```json
{ "email": "uncle@example.com", "role": "manager", "sideScope": "bride" }
```
| Field | Rules |
|---|---|
| `role` | `admin` or `manager`. Only 2 admins allowed |
| `sideScope` | Required if sides are enabled. Forced to `both` for admins |

Response `201`: the pending invite.

Errors: `ALREADY_MEMBER` (409), `INVITE_PENDING` (409), `ADMIN_LIMIT_REACHED` (409), `ALREADY_HAS_WEDDING` (409, role `admin` for someone who is already an admin of another wedding), `EMAIL_SEND_FAILED` (502, invite saved, can be resent).

### 7.3 `POST /api/weddings/{weddingId}/members/invites/{inviteId}/resend`
**Access:** Admin. Sends the email again with a new link and a fresh 7-day expiry. Response `200`.

### 7.4 `DELETE /api/weddings/{weddingId}/members/invites/{inviteId}`
**Access:** Admin. Cancels a pending invite. Response `204`.

### 7.5 `PATCH /api/weddings/{weddingId}/members/{memberId}`
**Access:** Admin

Request: `{ "role": "manager", "sideScope": "groom" }`

Response `200`: `<Member>`

Errors: `ADMIN_LIMIT_REACHED`, `ALREADY_HAS_WEDDING` (409, promoting someone who is already an admin of another wedding), `LAST_ADMIN` (409, can't demote the last admin).

### 7.6 `DELETE /api/weddings/{weddingId}/members/{memberId}`
**Access:** Admin. Removes the member. Their tasks become unassigned. Response `204`.

Errors: `LAST_ADMIN`.

### 7.7 `POST /api/weddings/{weddingId}/members/leave`
**Access:** Member. The caller leaves the wedding. Response `204`. Errors: `LAST_ADMIN`.

### 7.8 `GET /api/member-invites/{token}`
**Access:** Public. Shows the invite before joining. Used by the `/join/{token}` page.

Response `200`:
```json
{ "data": { "weddingName": "Nafiya & Irfan", "invitedEmail": "uncle@example.com", "role": "manager", "expiresAt": "2026-10-01T09:00:00.000Z" } }
```
Errors: `INVITE_INVALID` (404, covers expired, cancelled and used).

### 7.9 `POST /api/member-invites/{token}/accept`
**Access:** Session. The logged-in user's email must match the invited email.

Response `200`: `{ "data": { "weddingId": "66f1b0..." } }`

Errors: `INVITE_INVALID`, `INVITE_EMAIL_MISMATCH` (403), `ALREADY_MEMBER`, `ADMIN_LIMIT_REACHED`, `ALREADY_HAS_WEDDING` (admin invite, but the user is already an admin of another wedding).

---

## 8. Events

### 8.1 `GET /api/weddings/{weddingId}/events`
**Access:** Member. Returns all events sorted by `order`. No pagination (at most a few dozen).

Response `200`: `{ "data": [ <Event> ] }`

### 8.2 `POST /api/weddings/{weddingId}/events`
**Access:** Member

Request:
```json
{
  "name": "Mehendi",
  "presetKey": "mehendi",
  "date": "2028-04-12",
  "startTime": "17:00",
  "endTime": "22:00",
  "venueName": "Family home",
  "address": "12 MG Road, Kochi",
  "mapUrl": "https://maps.google.com/?q=...",
  "dressCode": "Green or yellow",
  "notes": "",
  "showOnWebsite": true
}
```
Required: `name`, `date`, `startTime`. New events are added at the end of the order.

Response `201`: `<Event>`

### 8.3 `POST /api/weddings/{weddingId}/events/presets`
**Access:** Member. Quick-add several preset events at once.

Request:
```json
{ "events": [ { "presetKey": "mehendi", "date": "2028-04-12", "startTime": "17:00" }, { "presetKey": "wedding", "date": "2028-04-14", "startTime": "11:00" } ] }
```
Response `201`: `{ "data": [ <Event> ] }`

### 8.4 `PATCH /api/weddings/{weddingId}/events/{eventId}`
**Access:** Member. Any subset of the create fields.

Response `200`:
```json
{
  "data": <Event>,
  "meta": { "guestFacingChange": true, "affectedHouseholds": 142 }
}
```
`guestFacingChange` is `true` when the date, time or venue changed and invitations were already sent, so the app can offer to notify families (see 10.8).

### 8.5 `DELETE /api/weddings/{weddingId}/events/{eventId}`
**Access:** Member

Query: `?confirm=true` is required if any household is invited to the event.

Effects: removed from every household (RSVPs archived), unlinked from tasks, expenses and vendors, photos moved to the General album.

Response `204`. Errors: `CONFIRMATION_REQUIRED` (409, with `details.affectedHouseholds`).

### 8.6 `POST /api/weddings/{weddingId}/events/reorder`
**Access:** Member

Request: `{ "eventIds": ["66f1d0...03", "66f1d0...02", "66f1d0...05"] }` (must contain every event exactly once)

Response `200`: `{ "data": [ <Event> ] }`

---

## 9. Guests (households)

### 9.1 `GET /api/weddings/{weddingId}/households`
**Access:** Member (side-scoped)

| Query param | Values |
|---|---|
| `q` | Search text (name, member names, email, phone) |
| `side` | `bride`, `groom` |
| `tags` | Comma-separated tags |
| `eventId` | Invited to this event |
| `inviteStatus` | Comma-separated `inviteStatus` values |
| `responseStatus` | `none`, `partial`, `complete` |
| `rsvpForEvent` + `rsvpStatus` | e.g. `rsvpForEvent=66f1...&rsvpStatus=attending` (`attending`, `declined`, `pending`) |
| `emailBounced` | `true` |
| `sort` | `name` (default), `-createdAt`, `-updatedAt` |
| `limit`, `cursor` | Pagination |

Response `200`: `{ "data": [ <Household> ], "meta": { "nextCursor": "...", "total": 312 } }`

### 9.2 `POST /api/weddings/{weddingId}/households`
**Access:** Member

Request:
```json
{
  "displayName": "Sharma family",
  "members": [{ "name": "Rajesh Sharma" }, { "name": "Priya Sharma" }],
  "headcount": 2,
  "email": "rajesh.sharma@example.com",
  "phone": "+919876543210",
  "side": "groom",
  "tags": ["Office"],
  "notes": "",
  "invitedEvents": [{ "eventId": "66f1d0...02", "headcount": 2 }]
}
```
| Field | Rules |
|---|---|
| `displayName` | Required, 1-100 |
| `headcount` | 1-50. Defaults to the number of members, or 1 |
| `side` | Required if sides are enabled. A side-scoped Manager can only use their own side |
| `tags` | Must exist in the wedding's `guestTags` |
| `invitedEvents[].headcount` | 1 to `headcount`. Defaults to `headcount` if omitted |

Response `201`:
```json
{
  "data": <Household>,
  "meta": { "possibleDuplicates": [ { "id": "66f1c0...099", "displayName": "Sharma Family" } ] }
}
```
Duplicates are a warning only. The household is still created.

### 9.3 `GET /api/weddings/{weddingId}/households/{householdId}`
**Access:** Member (side-scoped). Response `200`: `<Household>` plus `meta.emailHistory` (last 10 emails: template, status, sentAt).

### 9.4 `PATCH /api/weddings/{weddingId}/households/{householdId}`
**Access:** Member (side-scoped). Any subset of the create fields.

Rules:
- Removing an event from `invitedEvents` archives that event's RSVP.
- Lowering a headcount below an existing `attendingCount` returns `409 HEADCOUNT_BELOW_RSVP`.

Response `200`: `<Household>`

### 9.5 `DELETE /api/weddings/{weddingId}/households/{householdId}`
**Access:** Member (side-scoped). Cancels any pending email jobs for the household. Response `204`.

### 9.6 `POST /api/weddings/{weddingId}/households/import`
**Access:** Member

The browser parses the CSV or Excel file, maps columns, and sends rows as JSON.

Request:
```json
{
  "rows": [
    {
      "displayName": "Khan family",
      "members": ["Imran Khan", "Sara Khan"],
      "headcount": 2,
      "email": "imran@example.com",
      "phone": "+971501234567",
      "side": "bride",
      "tags": ["College friends"],
      "eventIds": ["66f1d0...02", "66f1d0...05"]
    }
  ],
  "createMissingTags": true,
  "dryRun": false
}
```
- Maximum 1,000 rows per request.
- `dryRun: true` validates without saving, for the preview screen.
- Valid rows are saved even if some rows fail.

Response `200`:
```json
{
  "data": {
    "importBatchId": "imp_2026_09_24_01",
    "created": 148,
    "failed": 2,
    "errors": [ { "row": 17, "path": "email", "message": "Invalid email" } ],
    "possibleDuplicates": [ { "row": 42, "existingHouseholdId": "66f1c0...099" } ]
  }
}
```

### 9.7 `GET /api/weddings/{weddingId}/households/import-template`
**Access:** Member. Returns a CSV template (`text/csv`).

### 9.8 `POST /api/weddings/{weddingId}/households/bulk`
**Access:** Member (side-scoped)

Request:
```json
{
  "householdIds": ["66f1c0...101", "66f1c0...102"],
  "action": "assign_events",
  "eventIds": ["66f1d0...02"]
}
```
| `action` | Extra fields |
|---|---|
| `assign_events` | `eventIds` (adds, with headcount = household headcount) |
| `remove_events` | `eventIds` (RSVPs archived) |
| `add_tags` | `tags` |
| `remove_tags` | `tags` |
| `delete` | none |

Maximum 500 households per request. Response `200`: `{ "data": { "updated": 2 } }`

### 9.9 `GET /api/weddings/{weddingId}/households/export`
**Access:** Member (side-scoped). Same filters as the list. Returns `text/csv` with one row per household and one attending column per event.

### 9.10 `POST /api/weddings/{weddingId}/households/{householdId}/regenerate-link`
**Access:** Member (side-scoped). Issues a new token. The old link stops working immediately.

Response `200`: `{ "data": { "inviteLink": "https://<app-domain>/invited/<new-token>" } }`

### 9.11 `POST /api/weddings/{weddingId}/households/{householdId}/mark-sent`
**Access:** Member (side-scoped). Marks the invitation as shared manually (e.g. on WhatsApp). Sets `inviteStatus` to `sent_manually`.

Response `200`: `<Household>`

### 9.12 `PUT /api/weddings/{weddingId}/households/{householdId}/rsvps/{eventId}`
**Access:** Member (side-scoped). Records or edits an RSVP on the household's behalf. Allowed even after the deadline.

Request:
```json
{ "status": "attending", "attendingCount": 2, "note": "Confirmed by phone" }
```
Response `200`: `<Household>` (with `recordedBy: "host"` on that RSVP)

Errors: `NOT_INVITED_TO_EVENT` (400), `HEADCOUNT_EXCEEDED` (400).

### 9.13 `DELETE /api/weddings/{weddingId}/households/{householdId}/rsvps/{eventId}`
**Access:** Member (side-scoped). Clears an RSVP back to pending. Response `204`.

---

## 10. Invitations and RSVP management

### 10.1 `GET /api/weddings/{weddingId}/invitation`
**Access:** Member

Response `200`:
```json
{
  "data": {
    "media": { "type": "image", "url": "https://<r2-signed-url>", "sizeBytes": 845123 },
    "message": "With the blessings of our families...",
    "rsvpDeadline": "2028-03-31",
    "autoRemindersEnabled": true
  }
}
```

### 10.2 `PUT /api/weddings/{weddingId}/invitation`
**Access:** Member

Request:
```json
{
  "mediaKey": "weddings/66f1b.../invitation/abc.jpg",
  "message": "With the blessings of our families...",
  "rsvpDeadline": "2028-03-31",
  "autoRemindersEnabled": true
}
```
- `mediaKey` comes from the file upload flow (Section 15). Send `null` to remove the media.
- `rsvpDeadline` must be on or before the last event date.

Response `200`: same shape as 10.1. Errors: `FILE_NOT_UPLOADED` (400).

### 10.3 `POST /api/weddings/{weddingId}/invitation/test`
**Access:** Member. Sends a sample invitation to the caller's own email immediately, using a sample household. Response `200`.

Errors: `INVITATION_NOT_READY` (400, no media and no message), `EMAIL_SEND_FAILED` (502).

### 10.4 `POST /api/weddings/{weddingId}/invitation/send`
**Access:** Member (side-scoped). Queues invitation emails.

Request (one of):
```json
{ "householdIds": ["66f1c0...101", "66f1c0...102"] }
```
```json
{ "filter": "all_not_sent" }
```
- Households without an email are skipped and reported.
- Households already `queued` are skipped.
- Households already `sent` are included only with `"resend": true`.

Response `202`:
```json
{
  "data": {
    "batchId": "send_20280115_01",
    "queued": 280,
    "skippedNoEmail": 30,
    "skippedAlreadySent": 2,
    "estimatedDays": 3
  }
}
```
`estimatedDays` reflects the daily email limit (100/day on the free tier).

Errors: `INVITATION_NOT_READY`, `NO_EVENTS_ASSIGNED` (400, when a selected household has no events).

### 10.5 `GET /api/weddings/{weddingId}/invitation/batches/{batchId}`
**Access:** Member. Progress of a send.

Response `200`:
```json
{ "data": { "batchId": "send_20280115_01", "queued": 180, "sent": 98, "failed": 2, "cancelled": 0 } }
```

### 10.6 `POST /api/weddings/{weddingId}/invitation/batches/{batchId}/cancel`
**Access:** Member. Cancels jobs not yet sent. Response `200` with updated counts.

### 10.7 `POST /api/weddings/{weddingId}/invitation/remind`
**Access:** Member (side-scoped). Queues RSVP reminders.

Request (one of): `{ "householdIds": [...] }` or `{ "filter": "all_incomplete" }`

Only households with an email, an incomplete response, and reminders not turned off by the guest are included.

Response `202`: same shape as 10.4.

### 10.8 `POST /api/weddings/{weddingId}/events/{eventId}/notify-change`
**Access:** Member. Queues an "event updated" email to every household invited to this event that has an email and has been sent an invitation.

Response `202`: `{ "data": { "batchId": "...", "queued": 142 } }`

### 10.9 `GET /api/weddings/{weddingId}/rsvp/summary`
**Access:** Member (side-scoped)

Response `200`:
```json
{
  "data": {
    "overall": { "households": 312, "sent": 290, "opened": 240, "complete": 190, "partial": 20, "none": 102 },
    "events": [
      {
        "eventId": "66f1d0...02",
        "name": "Mehendi",
        "invitedHouseholds": 180,
        "invitedHeadcount": 520,
        "respondedHouseholds": 130,
        "attendingHouseholds": 118,
        "attendingHeadcount": 344,
        "declinedHouseholds": 12,
        "pendingHouseholds": 50
      }
    ]
  }
}
```

---

## 11. Public invitation (guests)

These endpoints never reveal other households or any private wedding data.

### 11.1 `GET /api/public/invitations/{token}`
**Access:** Guest token. Read-only. It does **not** mark the invitation opened, because link-preview bots fetch the server-rendered page; see 11.5.

Response `200`:
```json
{
  "data": {
    "wedding": { "brideName": "Nafiya", "groomName": "Irfan", "weddingDate": "2028-04-14", "city": "Kochi" },
    "household": { "displayName": "Sharma family", "members": [{ "name": "Rajesh Sharma" }, { "name": "Priya Sharma" }] },
    "invitation": {
      "media": { "type": "image", "url": "https://<r2-signed-url>" },
      "message": "With the blessings of our families..."
    },
    "rsvpDeadline": "2028-03-31",
    "rsvpOpen": true,
    "events": [
      {
        "id": "66f1d0...02",
        "name": "Mehendi",
        "date": "2028-04-12",
        "startTime": "17:00",
        "endTime": "22:00",
        "venueName": "Family home",
        "address": "12 MG Road, Kochi",
        "mapUrl": "https://maps.google.com/?q=...",
        "dressCode": "Green or yellow",
        "maxHeadcount": 2,
        "rsvp": { "status": "attending", "attendingCount": 2, "note": "" }
      }
    ],
    "websiteUrl": "https://<app-domain>/w/nafiya-irfan-14-apr-2028"
  }
}
```
- `rsvp` is `null` for events not yet answered.
- `rsvpOpen` is `false` after the deadline or if the wedding is archived.
- `websiteUrl` is `null` if the website isn't published.

Errors: `LINK_INVALID` (404, unknown or regenerated token).

### 11.2 `PUT /api/public/invitations/{token}/rsvp`
**Access:** Guest token. Submits or edits replies for one or more events at once.

Request:
```json
{
  "responses": [
    { "eventId": "66f1d0...02", "status": "attending", "attendingCount": 2, "note": "Looking forward!" },
    { "eventId": "66f1d0...03", "status": "declined" }
  ]
}
```
| Rule | Error |
|---|---|
| Event must be one the household is invited to | `NOT_INVITED_TO_EVENT` (400) |
| `attendingCount` 1 to `maxHeadcount` when attending (forced to 0 when declined) | `HEADCOUNT_EXCEEDED` (400) |
| Before the deadline and wedding active | `RSVP_CLOSED` (409) |

Response `200`: same shape as 11.1. A confirmation email is sent if the household has an email (failure doesn't fail the request).

### 11.3 `GET /api/public/invitations/{token}/events/{eventId}/calendar.ics`
**Access:** Guest token. Returns a `text/calendar` file for the event, in the wedding's timezone.

### 11.4 `POST /api/public/invitations/{token}/stop-reminders`
**Access:** Guest token. Stops reminder emails for this household (the invitation link keeps working). Response `204`.

### 11.5 `POST /api/public/invitations/{token}/opened`
**Access:** Guest token. Called by the guest page from the browser after it loads. Sets `openedAt` if it isn't set yet; later calls change nothing. Requests with a known link-preview or bot user agent are accepted but ignored. Response `204`.

Errors: `LINK_INVALID` (404).

---

## 12. Tasks

### 12.1 `GET /api/weddings/{weddingId}/tasks`
**Access:** Member

| Query param | Values |
|---|---|
| `status` | Comma-separated `todo`, `in_progress`, `done` |
| `assignee` | A user ID, `me`, or `none` |
| `eventId` | Event ID |
| `due` | `overdue`, `this_week`, `none` |
| `sort` | `dueDate` (default, no-date last), `-createdAt` |
| `limit`, `cursor` | Pagination |

Response `200`: `{ "data": [ <Task> ], "meta": { "nextCursor": null } }`

### 12.2 `POST /api/weddings/{weddingId}/tasks`
**Access:** Member

Request:
```json
{ "title": "Book mehendi artist", "description": "", "dueDate": "2027-12-01", "assigneeUserId": "66f1a3...", "eventId": "66f1d0...02" }
```
Required: `title`. If assigned to someone else, they get an email immediately.

Response `201`: `<Task>`. Errors: `ASSIGNEE_NOT_MEMBER` (400).

### 12.3 `PATCH /api/weddings/{weddingId}/tasks/{taskId}`
**Access:** Member. Any subset of fields, plus `status`. Setting `status: "done"` sets `completedAt`.

Response `200`: `<Task>`

### 12.4 `DELETE /api/weddings/{weddingId}/tasks/{taskId}`
**Access:** Member. Response `204`.

### 12.5 `GET /api/weddings/{weddingId}/tasks/starter-checklist`
**Access:** Member. Returns the built-in list of common wedding tasks (not yet saved).

Response `200`: `{ "data": [ { "key": "book_venue", "title": "Book the venue", "suggestedMonthsBefore": 10 } ] }`

### 12.6 `POST /api/weddings/{weddingId}/tasks/starter-checklist`
**Access:** Member. Adds selected starter tasks, with due dates counted back from the wedding date.

Request: `{ "keys": ["book_venue", "book_photographer"] }`

Response `201`: `{ "data": [ <Task> ] }`

---

## 13. Expenses

### 13.1 `GET /api/weddings/{weddingId}/expenses`
**Access:** Member

| Query param | Values |
|---|---|
| `q` | Search description and notes |
| `category` | Comma-separated categories |
| `eventId` | Event ID, or `general` for no event |
| `vendorId` | Vendor ID |
| `paidBy` | Payer name |
| `from`, `to` | `YYYY-MM-DD` |
| `sort` | `-date` (default), `date`, `-amountPaise` |
| `limit`, `cursor` | Pagination |

Response `200`: `{ "data": [ <Expense> ], "meta": { "nextCursor": "...", "total": 84, "totalAmountPaise": 245000000 } }`

`totalAmountPaise` is the total of all expenses matching the filters.

### 13.2 `POST /api/weddings/{weddingId}/expenses`
**Access:** Member

Request:
```json
{
  "amountPaise": 7500000,
  "date": "2027-11-02",
  "category": "photography_video",
  "description": "Photographer advance",
  "eventId": null,
  "vendorId": "66f1f0...301",
  "paidBy": { "type": "name", "name": "Papa" },
  "notes": "Balance due after the wedding",
  "receipt": { "key": "weddings/66f1b.../receipts/r1.pdf", "fileName": "advance.pdf" }
}
```
| Field | Rules |
|---|---|
| `amountPaise` | Integer, 1 to 100,000,000,000 |
| `category` | Preset or custom category of this wedding |
| `paidBy` | `{ "type": "member", "userId": "..." }` or `{ "type": "name", "name": "Papa" }` |
| `receipt.key` | From the upload flow (Section 15), purpose `receipt` |

Response `201`: `<Expense>`. Errors: `FILE_NOT_UPLOADED`, `VALIDATION_ERROR`.

### 13.3 `PATCH /api/weddings/{weddingId}/expenses/{expenseId}`
**Access:** Member. Any subset of fields. `"receipt": null` removes the receipt. Response `200`: `<Expense>`.

### 13.4 `DELETE /api/weddings/{weddingId}/expenses/{expenseId}`
**Access:** Member. Response `204`.

### 13.5 `GET /api/weddings/{weddingId}/expenses/summary`
**Access:** Member. Query: `from`, `to` (optional).

Response `200`:
```json
{
  "data": {
    "totalAmountPaise": 245000000,
    "count": 84,
    "byCategory": [ { "category": "venue", "amountPaise": 90000000 } ],
    "byEvent": [ { "eventId": null, "name": "General", "amountPaise": 30000000 } ],
    "byVendor": [ { "vendorId": "66f1f0...301", "name": "Lens & Light Studios", "amountPaise": 7500000 } ],
    "byPaidBy": [ { "name": "Papa", "amountPaise": 120000000 } ]
  }
}
```

### 13.6 `GET /api/weddings/{weddingId}/expenses/export`
**Access:** Member. Same filters as the list. Returns `text/csv` with amounts in rupees.

---

## 14. Vendors

### 14.1 `GET /api/weddings/{weddingId}/vendors`
**Access:** Member

| Query param | Values |
|---|---|
| `q` | Search name and notes |
| `category` | Comma-separated categories |
| `status` | Comma-separated statuses |
| `eventId` | Event ID |
| `sort` | `name` (default), `-createdAt`, `-totalPaid` |

Response `200`: `{ "data": [ <Vendor> ] }` (no pagination, at most a few dozen)

### 14.2 `POST /api/weddings/{weddingId}/vendors`
**Access:** Member

Request:
```json
{
  "name": "Lens & Light Studios",
  "category": "photographer",
  "phone": "+919812345678",
  "whatsapp": "+919812345678",
  "email": "hello@lenslight.example",
  "notes": "",
  "status": "shortlisted",
  "eventIds": ["66f1d0...02"],
  "placeId": null
}
```
Required: `name`, `category`. Set `placeId` when saving a Google result (Section 16.4).

Response `201`: `<Vendor>`. Errors: `VENDOR_ALREADY_SAVED` (409, same `placeId`).

### 14.3 `GET /api/weddings/{weddingId}/vendors/{vendorId}`
**Access:** Member. Response `200`: `<Vendor>` plus `meta.expenses` (linked expenses, newest first).

### 14.4 `PATCH /api/weddings/{weddingId}/vendors/{vendorId}`
**Access:** Member. Any subset of fields. Response `200`: `<Vendor>`.

### 14.5 `DELETE /api/weddings/{weddingId}/vendors/{vendorId}`
**Access:** Member. Linked expenses keep the vendor's name. Attachments are deleted. Response `204`.

### 14.6 `POST /api/weddings/{weddingId}/vendors/{vendorId}/attachments`
**Access:** Member

Request: `{ "key": "weddings/66f1b.../vendors/66f1f.../q1.pdf", "fileName": "quote.pdf" }`

Response `201`: `<Vendor>`. Errors: `FILE_NOT_UPLOADED`, `ATTACHMENT_LIMIT_REACHED` (409, max 10).

### 14.7 `DELETE /api/weddings/{weddingId}/vendors/{vendorId}/attachments/{attachmentId}`
**Access:** Member. Response `204`.

---

## 15. File uploads (private app)

Used for invitation media, website photos, receipts and vendor attachments. Gallery uploads have their own flow (Section 19).

### 15.1 Flow
1. Ask the API for an upload URL.
2. `PUT` the file directly to R2 with the returned headers.
3. Send the returned `key` in the related request (e.g. create expense). The API checks the file exists and belongs to this wedding.

### 15.2 `POST /api/weddings/{weddingId}/files/presign`
**Access:** Member (website purposes: Admin for cover, Member for photos)

Request:
```json
{
  "purpose": "receipt",
  "fileName": "advance.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 182340,
  "vendorId": null
}
```
| `purpose` | Allowed types | Max size |
|---|---|---|
| `invitation` | `image/jpeg`, `image/png`, `image/webp`, `video/mp4` | 10 MB image, 50 MB video |
| `website_cover` | `image/jpeg`, `image/webp` | 2 MB (resized in the browser) |
| `website_photo` | `image/jpeg`, `image/webp` | 2 MB (resized in the browser) |
| `receipt` | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` | 10 MB |
| `vendor_attachment` | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` | 10 MB (`vendorId` required) |

Response `200`:
```json
{
  "data": {
    "key": "weddings/66f1b.../receipts/7c1e9a.pdf",
    "uploadUrl": "https://<account>.r2.cloudflarestorage.com/...",
    "method": "PUT",
    "headers": { "Content-Type": "application/pdf", "Content-Length": "182340" },
    "expiresAt": "2026-09-24T07:10:00.000Z"
  }
}
```
Errors: `UNSUPPORTED_FILE_TYPE` (400), `FILE_TOO_LARGE` (413), `STORAGE_LIMIT_REACHED` (413).

---

## 16. Google Places

### 16.1 `POST /api/weddings/{weddingId}/places/autocomplete`
**Access:** Admin. Suggestions while typing the wedding venue or area.

Request:
```json
{ "input": "Grand Hyatt Koc", "sessionToken": "b3f1c2d4-..." }
```
`sessionToken` is a UUID the browser creates once per search session and reuses until a place is picked.

Response `200`:
```json
{ "data": [ { "placeId": "ChIJ...", "primaryText": "Grand Hyatt Kochi Bolgatty", "secondaryText": "Mulavukad, Kochi, Kerala" } ] }
```
Not counted in the monthly vendor search quota.

### 16.2 `PUT /api/weddings/{weddingId}/location`
**Access:** Admin. Saves the chosen place as the wedding location.

Request:
```json
{ "placeId": "ChIJ...", "sessionToken": "b3f1c2d4-...", "searchRadiusKm": 10 }
```
The server fetches name, address and coordinates from Google.

Response `200`: `{ "data": <Wedding> }`

### 16.3 `PATCH /api/weddings/{weddingId}/location`
**Access:** Admin. Request: `{ "searchRadiusKm": 15 }` (1-50). Response `200`: `{ "data": <Wedding> }`.

### 16.4 `POST /api/weddings/{weddingId}/places/vendor-search`
**Access:** Member. Counts toward the 50-per-month quota.

Request:
```json
{ "category": "photographer", "keywords": "candid", "pageToken": null }
```
Response `200`:
```json
{
  "data": [
    {
      "placeId": "ChIJ...",
      "name": "Lens & Light Studios",
      "address": "Panampilly Nagar, Kochi",
      "distanceKm": 4.2,
      "alreadySaved": false
    }
  ],
  "meta": {
    "nextPageToken": "AeJbb3...",
    "attribution": "Results from Google",
    "quota": { "used": 13, "limit": 50, "resetsOn": "2026-10-01" }
  }
}
```
Loading the next page with `pageToken` also counts as one search.

Errors: `LOCATION_REQUIRED` (400, no wedding location set), `PLACES_QUOTA_REACHED` (429), `PLACES_UNAVAILABLE` (502).

### 16.5 `GET /api/weddings/{weddingId}/places/{placeId}`
**Access:** Member. Contact details for one result, fetched only when the couple opens it. Not counted in the quota.

Response `200`:
```json
{
  "data": {
    "placeId": "ChIJ...",
    "name": "Lens & Light Studios",
    "address": "Panampilly Nagar, Kochi",
    "phone": "+91 98123 45678",
    "website": "https://lenslight.example",
    "googleMapsUrl": "https://maps.google.com/?cid=...",
    "attribution": "Data from Google"
  }
}
```
This data isn't stored. To save the vendor, the app calls `POST /vendors` (14.2) with the `placeId` and the details the couple confirms.

### 16.6 `GET /api/weddings/{weddingId}/places/usage`
**Access:** Member. Response `200`: `{ "data": { "used": 13, "limit": 50, "resetsOn": "2026-10-01" } }`

---

## 17. Wedding website

### 17.1 `GET /api/weddings/{weddingId}/website`
**Access:** Member

Response `200`:
```json
{
  "data": {
    "slug": "nafiya-irfan-14-apr-2028",
    "url": "https://<app-domain>/w/nafiya-irfan-14-apr-2028",
    "published": false,
    "publishedAt": null,
    "theme": "floral",
    "accentColor": "#B4535F",
    "sections": { "hero": true, "story": true, "events": true, "photos": true, "liveStream": true, "gallery": true },
    "story": "We met at...",
    "cover": { "key": "weddings/.../cover.webp", "url": "https://<r2-signed-url>" },
    "photos": [ { "key": "weddings/.../website/p1.webp", "url": "https://<r2-signed-url>" } ],
    "liveStream": { "url": "https://youtu.be/xyz123", "videoId": "xyz123", "startsAt": "2028-04-14T05:30:00.000Z", "enabled": true },
    "indexable": false
  }
}
```

### 17.2 `PATCH /api/weddings/{weddingId}/website`
**Access:** Member (`indexable` is Admin only)

Request (any subset):
```json
{
  "theme": "floral",
  "accentColor": "#B4535F",
  "sections": { "story": false },
  "story": "We met at...",
  "coverKey": "weddings/.../cover.webp",
  "photoKeys": ["weddings/.../website/p1.webp"],
  "liveStream": { "url": "https://youtu.be/xyz123", "startsAt": "2028-04-14T05:30:00.000Z", "enabled": true },
  "indexable": false
}
```
| Rule | Error |
|---|---|
| `liveStream.url` must be a `youtube.com` or `youtu.be` link | `INVALID_YOUTUBE_URL` (400) |
| `photoKeys` max 12 | `VALIDATION_ERROR` |
| Keys must come from the upload flow | `FILE_NOT_UPLOADED` |

Response `200`: same shape as 17.1. Changes to a published site appear within a minute (the cache is refreshed on save).

### 17.3 `GET /api/weddings/{weddingId}/website/slug-check?slug=nafiya-irfan-14-apr-2028`
**Access:** Admin

Response `200`:
```json
{ "data": { "slug": "nafiya-irfan-14-apr-2028", "available": false, "suggestion": "nafiya-irfan-14-apr-2028-2" } }
```

### 17.4 `PUT /api/weddings/{weddingId}/website/slug`
**Access:** Admin. Request: `{ "slug": "irfan-and-nafiya" }`

Rules: 3-60 characters, lowercase letters, numbers and single hyphens, not reserved.

Response `200`: website object. Errors: `SLUG_TAKEN` (409), `SLUG_RESERVED` (400).

### 17.5 `POST /api/weddings/{weddingId}/website/publish` and `/unpublish`
**Access:** Admin. Response `200`: website object.

---

## 18. Public wedding website

### 18.1 `GET /api/public/sites/{slug}`
**Access:** Public. Used by the server-rendered `/w/{slug}` page.

Response `200`:
```json
{
  "data": {
    "brideName": "Nafiya",
    "groomName": "Irfan",
    "weddingDate": "2028-04-14",
    "city": "Kochi",
    "theme": "floral",
    "accentColor": "#B4535F",
    "sections": { "hero": true, "story": true, "events": true, "photos": true, "liveStream": true, "gallery": true },
    "story": "We met at...",
    "coverUrl": "https://<r2-signed-url>",
    "photoUrls": ["https://<r2-signed-url>"],
    "events": [
      { "name": "Wedding", "date": "2028-04-14", "startTime": "11:00", "endTime": "14:00", "venueName": "Grand Hyatt", "address": "...", "mapUrl": "...", "dressCode": "" }
    ],
    "liveStream": { "videoId": "xyz123", "startsAt": "2028-04-14T05:30:00.000Z" },
    "galleryUrl": "https://<app-domain>/gallery/q8Zt2mKp4vX9sL1aB7cD3e",
    "indexable": false,
    "og": { "title": "Nafiya & Irfan · 14 April 2028", "description": "Join us in Kochi", "imageUrl": "https://<r2-signed-url>" }
  }
}
```
- Only events with `showOnWebsite: true` are returned.
- Disabled sections are returned as `null`.
- `galleryUrl` is `null` if the gallery section is off.

Errors: `NOT_FOUND` (404, unknown or unpublished).

---

## 19. Photo gallery

### 19.1 Management (couple)

#### `GET /api/weddings/{weddingId}/gallery`
**Access:** Member

Response `200`:
```json
{
  "data": {
    "url": "https://<app-domain>/gallery/q8Zt2mKp4vX9sL1aB7cD3e",
    "uploadsOpen": true,
    "guestViewing": true,
    "storage": { "usedBytes": 1240000000, "reservedBytes": 4000000, "capBytes": 3221225472 },
    "counts": { "total": 2410, "hidden": 12, "byAlbum": [ { "albumEventId": null, "name": "General", "count": 300 } ] },
    "filesDeleteOn": "2029-04-14"
  }
}
```

#### `PATCH /api/weddings/{weddingId}/gallery`
**Access:** Admin. Request: `{ "uploadsOpen": false, "guestViewing": true }`. Response `200`: gallery object.

#### `POST /api/weddings/{weddingId}/gallery/regenerate-link`
**Access:** Admin. The old link and QR code stop working. Response `200`: gallery object with the new `url`.

#### `GET /api/weddings/{weddingId}/gallery/qr?format=png|svg|pdf`
**Access:** Member. Returns the QR code file. `pdf` is a printable A5 card with the couple's names.

#### `GET /api/weddings/{weddingId}/gallery/photos`
**Access:** Member

| Query param | Values |
|---|---|
| `album` | Event ID or `general` |
| `hidden` | `true`, `false` |
| `limit`, `cursor` | Default 60, max 100 |

Response `200`: `{ "data": [ <Photo> ], "meta": { "nextCursor": "..." } }`

#### `PATCH /api/weddings/{weddingId}/gallery/photos/{photoId}`
**Access:** Member. Request: `{ "hidden": true }` or `{ "albumEventId": null }`. Response `200`: `<Photo>`.

#### `DELETE /api/weddings/{weddingId}/gallery/photos/{photoId}`
**Access:** Member. Deletes the photo and frees its storage. Response `204`.

#### `POST /api/weddings/{weddingId}/gallery/photos/bulk`
**Access:** Member

Request:
```json
{ "photoIds": ["66f4...", "66f4..."], "action": "hide" }
```
| `action` | Extra fields |
|---|---|
| `hide`, `unhide`, `delete` | none |
| `move` | `albumEventId` (`null` for General) |

Maximum 200 photos per request. Response `200`: `{ "data": { "updated": 2 } }`

#### `POST /api/weddings/{weddingId}/gallery/download-urls`
**Access:** Member. Used by the browser to build ZIP files.

Request: `{ "album": "all", "cursor": null }` (`album` can be `all`, `general`, or an event ID)

Response `200`:
```json
{
  "data": [ { "photoId": "66f4...", "fileName": "mehendi_0001.webp", "url": "https://<r2-signed-url>" } ],
  "meta": { "nextCursor": "...", "part": 1, "totalParts": 5 }
}
```
Returns up to 500 photos per call (one ZIP part). URLs are valid for 1 hour.

### 19.2 Public gallery (guests)

#### `GET /api/public/gallery/{token}`
**Access:** Gallery token

Response `200`:
```json
{
  "data": {
    "weddingName": "Nafiya & Irfan",
    "uploadsOpen": true,
    "guestViewing": true,
    "albums": [ { "albumEventId": null, "name": "General" }, { "albumEventId": "66f1d0...02", "name": "Mehendi" } ],
    "limits": { "maxFilesPerRequest": 50, "maxDisplayBytes": 2097152, "maxThumbBytes": 204800 }
  }
}
```
Errors: `LINK_INVALID` (404).

#### `GET /api/public/gallery/{token}/photos`
**Access:** Gallery token. Only works when `guestViewing` is on. Hidden photos are never returned.

Query: `album`, `limit` (default 60), `cursor`.

Response `200`: `{ "data": [ <Photo without hidden> ], "meta": { "nextCursor": "..." } }`

Errors: `GALLERY_VIEWING_OFF` (403).

#### `POST /api/public/gallery/{token}/uploads`
**Access:** Gallery token. Reserves storage and returns signed upload URLs. The browser has already resized each photo and made a thumbnail.

Request:
```json
{
  "albumEventId": "66f1d0...02",
  "uploaderName": "Sana",
  "files": [
    { "clientId": "f1", "width": 2000, "height": 1500, "displayBytes": 512340, "thumbBytes": 38120 },
    { "clientId": "f2", "width": 1500, "height": 2000, "displayBytes": 498001, "thumbBytes": 36540 }
  ]
}
```
| Rule | Error |
|---|---|
| Uploads open and wedding active | `UPLOADS_CLOSED` (403) |
| 1-50 files per request | `VALIDATION_ERROR` |
| `displayBytes` ≤ 2 MB, `thumbBytes` ≤ 200 KB | `FILE_TOO_LARGE` (413) |
| Enough storage left | `STORAGE_LIMIT_REACHED` (413) |

Response `200`:
```json
{
  "data": {
    "batchId": "up_8k2m1x",
    "expiresAt": "2028-04-12T14:40:00.000Z",
    "uploads": [
      {
        "clientId": "f1",
        "photoId": "66f4...",
        "display": { "url": "https://<r2-presigned-put>", "headers": { "Content-Type": "image/webp", "Content-Length": "512340" } },
        "thumb":   { "url": "https://<r2-presigned-put>", "headers": { "Content-Type": "image/webp", "Content-Length": "38120" } }
      }
    ]
  }
}
```
All photos are uploaded as `image/webp`.

#### `POST /api/public/gallery/{token}/uploads/complete`
**Access:** Gallery token. Confirms files have been uploaded to R2.

Request: `{ "photoIds": ["66f4...", "66f4..."] }`

Response `200`:
```json
{ "data": { "ready": ["66f4..."], "missing": ["66f4..."] } }
```
`missing` photos weren't found in R2. The browser can retry their upload with the same URLs until they expire. Unconfirmed photos are cleaned up after 24 hours.

---

## 20. Dashboard

### 20.1 `GET /api/weddings/{weddingId}/dashboard`
**Access:** Member (side-scoped for guest numbers)

Response `200`:
```json
{
  "data": {
    "countdown": { "weddingDate": "2028-04-14", "daysLeft": 568 },
    "upcomingEvents": [ { "id": "66f1d0...02", "name": "Mehendi", "date": "2028-04-12", "startTime": "17:00" } ],
    "rsvp": { "households": 312, "responded": 210, "pending": 102, "attendingHeadcount": 780 },
    "tasks": {
      "overdue": 3,
      "dueThisWeek": 5,
      "items": [ { "id": "66f3...", "title": "Book mehendi artist", "dueDate": "2027-12-01", "assignee": { "userId": "66f1a3...", "name": "Ahmed" } } ]
    },
    "expenses": {
      "totalAmountPaise": 245000000,
      "topCategories": [ { "category": "venue", "amountPaise": 90000000 } ]
    },
    "setupChecklist": {
      "eventsAdded": true,
      "guestsAdded": true,
      "invitationUploaded": false,
      "invitationsSent": false,
      "locationSet": true,
      "websitePublished": false
    }
  }
}
```
Up to 3 upcoming events and 5 task items are returned.

---

## 21. System endpoints

### 21.1 `POST /api/cron/process-jobs`
**Access:** Cron secret. Called every minute.

Processes up to 50 due jobs, stopping after about 8 seconds. Respects the daily email limit.

Response `200`:
```json
{ "data": { "claimed": 50, "done": 48, "retried": 2, "failed": 0, "dailyEmailRemaining": 12, "durationMs": 6120 } }
```

### 21.2 `POST /api/cron/daily`
**Access:** Cron secret. Called once a day at 9:00 AM IST.

Work: queue automatic RSVP reminders (7 and 2 days before deadlines), queue task due reminders, expire old member invites, clean up abandoned uploads, send retention warnings, delete files for weddings past retention.

Response `200`: `{ "data": { "rsvpRemindersQueued": 40, "taskRemindersQueued": 12, "pendingPhotosCleaned": 8, "retentionWarnings": 1, "retentionDeletions": 0 } }`

Both cron endpoints are safe to call twice: duplicate work is prevented by idempotency keys.

### 21.3 `POST /api/webhooks/resend`
**Access:** Webhook signature. Receives delivery events from Resend.

| Event | Effect |
|---|---|
| `email.delivered` | Email log marked `delivered` |
| `email.bounced` | Email log marked `bounced`, household `emailBounced` set to `true` |
| `email.complained` | Email log marked `complained`, household reminders turned off |

Response `200` (Resend retries on other responses). Errors: `INVALID_SIGNATURE` (401).

### 21.4 `GET /api/health`
**Access:** Public

Response `200`: `{ "data": { "status": "ok", "db": "ok", "time": "2026-09-24T07:00:00.000Z" } }`

Response `503` if the database is unreachable.

---

## 22. Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid input. See `details` |
| `WEAK_PASSWORD` | 400 | Password too short or too common |
| `RESET_TOKEN_INVALID` | 400 | Reset link expired, used or unknown |
| `NOT_INVITED_TO_EVENT` | 400 | Household isn't invited to that event |
| `HEADCOUNT_EXCEEDED` | 400 | Attending count above the invited headcount |
| `ASSIGNEE_NOT_MEMBER` | 400 | Task assignee isn't a member of the wedding |
| `LOCATION_REQUIRED` | 400 | Wedding location not set |
| `INVALID_YOUTUBE_URL` | 400 | Live stream link isn't YouTube |
| `SLUG_RESERVED` | 400 | Website address is a reserved word |
| `UNSUPPORTED_FILE_TYPE` | 400 | File type not allowed for this purpose |
| `FILE_NOT_UPLOADED` | 400 | File key not found in storage or not from this wedding |
| `INVITATION_NOT_READY` | 400 | Invitation has no media or message |
| `NO_EVENTS_ASSIGNED` | 400 | A household has no invited events |
| `UNAUTHENTICATED` | 401 | Not logged in, or session expired |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `INVALID_SIGNATURE` | 401 | Webhook or cron secret invalid |
| `FORBIDDEN` | 403 | Role not allowed, or request from another origin |
| `INVITE_EMAIL_MISMATCH` | 403 | Logged-in email doesn't match the member invite |
| `UPLOADS_CLOSED` | 403 | Gallery uploads are turned off or wedding archived |
| `GALLERY_VIEWING_OFF` | 403 | Couple turned off guest viewing |
| `NOT_FOUND` | 404 | Doesn't exist, or not accessible to you |
| `LINK_INVALID` | 404 | Guest or gallery link unknown or regenerated |
| `INVITE_INVALID` | 404 | Member invite expired, cancelled or used |
| `CONFLICT` | 409 | General conflict |
| `EMAIL_TAKEN` | 409 | An account already uses this email |
| `ALREADY_MEMBER` | 409 | Person is already a member |
| `INVITE_PENDING` | 409 | A pending invite already exists for this email |
| `ADMIN_LIMIT_REACHED` | 409 | Wedding already has 2 admins |
| `ALREADY_HAS_WEDDING` | 409 | The user is already an admin of a wedding; each person can be an admin of one wedding only |
| `LAST_ADMIN` | 409 | Action would leave the wedding without an admin |
| `WEDDING_ARCHIVED` | 409 | Wedding is read-only |
| `RSVP_CLOSED` | 409 | Deadline passed or wedding archived |
| `SLUG_TAKEN` | 409 | Website address in use |
| `CATEGORY_IN_USE` | 409 | Custom category still used by expenses |
| `HEADCOUNT_BELOW_RSVP` | 409 | New headcount is lower than an existing RSVP |
| `CONFIRMATION_REQUIRED` | 409 | Resend with `confirm=true` |
| `VENDOR_ALREADY_SAVED` | 409 | This Google place is already in the vendor list |
| `ATTACHMENT_LIMIT_REACHED` | 409 | Vendor already has 10 attachments |
| `FILE_TOO_LARGE` | 413 | File above the size limit |
| `STORAGE_LIMIT_REACHED` | 413 | Wedding storage cap reached |
| `RATE_LIMITED` | 429 | Too many requests. See `Retry-After` |
| `PLACES_QUOTA_REACHED` | 429 | Monthly vendor search limit reached |
| `INTERNAL_ERROR` | 500 | Unexpected error. Logged with `requestId` |
| `EMAIL_SEND_FAILED` | 502 | Email provider failed. Safe to retry |
| `PLACES_UNAVAILABLE` | 502 | Google Places failed. Safe to retry |

---

## 23. Endpoint index

| Method | Path | Access |
|---|---|---|
| POST | `/api/auth/signup` | Public |
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/logout` | Session |
| POST | `/api/auth/logout-all` | Session |
| POST | `/api/auth/forgot-password` | Public |
| POST | `/api/auth/reset-password` | Public |
| GET, PATCH | `/api/me` | Session |
| POST | `/api/weddings` | Session |
| GET | `/api/weddings/{id}` | Member |
| PATCH | `/api/weddings/{id}` | Admin |
| POST | `/api/weddings/{id}/archive`, `/unarchive` | Admin |
| GET | `/api/weddings/{id}/members` | Member |
| POST | `/api/weddings/{id}/members/invites` | Admin |
| POST | `/api/weddings/{id}/members/invites/{inviteId}/resend` | Admin |
| DELETE | `/api/weddings/{id}/members/invites/{inviteId}` | Admin |
| PATCH, DELETE | `/api/weddings/{id}/members/{memberId}` | Admin |
| POST | `/api/weddings/{id}/members/leave` | Member |
| GET | `/api/member-invites/{token}` | Public |
| POST | `/api/member-invites/{token}/accept` | Session |
| GET, POST | `/api/weddings/{id}/events` | Member |
| POST | `/api/weddings/{id}/events/presets` | Member |
| PATCH, DELETE | `/api/weddings/{id}/events/{eventId}` | Member |
| POST | `/api/weddings/{id}/events/reorder` | Member |
| POST | `/api/weddings/{id}/events/{eventId}/notify-change` | Member |
| GET, POST | `/api/weddings/{id}/households` | Member |
| GET, PATCH, DELETE | `/api/weddings/{id}/households/{hid}` | Member |
| POST | `/api/weddings/{id}/households/import` | Member |
| GET | `/api/weddings/{id}/households/import-template` | Member |
| POST | `/api/weddings/{id}/households/bulk` | Member |
| GET | `/api/weddings/{id}/households/export` | Member |
| POST | `/api/weddings/{id}/households/{hid}/regenerate-link` | Member |
| POST | `/api/weddings/{id}/households/{hid}/mark-sent` | Member |
| PUT, DELETE | `/api/weddings/{id}/households/{hid}/rsvps/{eventId}` | Member |
| GET, PUT | `/api/weddings/{id}/invitation` | Member |
| POST | `/api/weddings/{id}/invitation/test` | Member |
| POST | `/api/weddings/{id}/invitation/send` | Member |
| GET | `/api/weddings/{id}/invitation/batches/{batchId}` | Member |
| POST | `/api/weddings/{id}/invitation/batches/{batchId}/cancel` | Member |
| POST | `/api/weddings/{id}/invitation/remind` | Member |
| GET | `/api/weddings/{id}/rsvp/summary` | Member |
| GET | `/api/public/invitations/{token}` | Guest token |
| PUT | `/api/public/invitations/{token}/rsvp` | Guest token |
| GET | `/api/public/invitations/{token}/events/{eventId}/calendar.ics` | Guest token |
| POST | `/api/public/invitations/{token}/stop-reminders` | Guest token |
| POST | `/api/public/invitations/{token}/opened` | Guest token |
| GET, POST | `/api/weddings/{id}/tasks` | Member |
| PATCH, DELETE | `/api/weddings/{id}/tasks/{taskId}` | Member |
| GET, POST | `/api/weddings/{id}/tasks/starter-checklist` | Member |
| GET, POST | `/api/weddings/{id}/expenses` | Member |
| PATCH, DELETE | `/api/weddings/{id}/expenses/{expenseId}` | Member |
| GET | `/api/weddings/{id}/expenses/summary` | Member |
| GET | `/api/weddings/{id}/expenses/export` | Member |
| GET, POST | `/api/weddings/{id}/vendors` | Member |
| GET, PATCH, DELETE | `/api/weddings/{id}/vendors/{vendorId}` | Member |
| POST | `/api/weddings/{id}/vendors/{vendorId}/attachments` | Member |
| DELETE | `/api/weddings/{id}/vendors/{vendorId}/attachments/{attachmentId}` | Member |
| POST | `/api/weddings/{id}/files/presign` | Member |
| POST | `/api/weddings/{id}/places/autocomplete` | Admin |
| PUT, PATCH | `/api/weddings/{id}/location` | Admin |
| POST | `/api/weddings/{id}/places/vendor-search` | Member |
| GET | `/api/weddings/{id}/places/usage` | Member |
| GET | `/api/weddings/{id}/places/{placeId}` | Member |
| GET, PATCH | `/api/weddings/{id}/website` | Member |
| GET | `/api/weddings/{id}/website/slug-check` | Admin |
| PUT | `/api/weddings/{id}/website/slug` | Admin |
| POST | `/api/weddings/{id}/website/publish`, `/unpublish` | Admin |
| GET | `/api/public/sites/{slug}` | Public |
| GET | `/api/weddings/{id}/gallery` | Member |
| PATCH | `/api/weddings/{id}/gallery` | Admin |
| POST | `/api/weddings/{id}/gallery/regenerate-link` | Admin |
| GET | `/api/weddings/{id}/gallery/qr` | Member |
| GET | `/api/weddings/{id}/gallery/photos` | Member |
| PATCH, DELETE | `/api/weddings/{id}/gallery/photos/{photoId}` | Member |
| POST | `/api/weddings/{id}/gallery/photos/bulk` | Member |
| POST | `/api/weddings/{id}/gallery/download-urls` | Member |
| GET | `/api/public/gallery/{token}` | Gallery token |
| GET | `/api/public/gallery/{token}/photos` | Gallery token |
| POST | `/api/public/gallery/{token}/uploads` | Gallery token |
| POST | `/api/public/gallery/{token}/uploads/complete` | Gallery token |
| GET | `/api/weddings/{id}/dashboard` | Member |
| POST | `/api/cron/process-jobs` | Cron secret |
| POST | `/api/cron/daily` | Cron secret |
| POST | `/api/webhooks/resend` | Webhook signature |
| GET | `/api/health` | Public |
