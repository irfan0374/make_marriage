// Error codes from docs/api-spec.md §22. `code` is stable; `message` is a display default.

export const ERROR_CODES = {
  VALIDATION_ERROR: { status: 400, message: 'Please check the highlighted fields.' },
  WEAK_PASSWORD: { status: 400, message: 'Password is too short or too common.' },
  RESET_TOKEN_INVALID: { status: 400, message: 'This reset link has expired or was already used.' },
  NOT_INVITED_TO_EVENT: { status: 400, message: 'This household is not invited to that event.' },
  HEADCOUNT_EXCEEDED: { status: 400, message: 'Attending count is above the invited headcount.' },
  ASSIGNEE_NOT_MEMBER: { status: 400, message: 'The assignee is not a member of this wedding.' },
  LOCATION_REQUIRED: { status: 400, message: 'Set the wedding location first.' },
  INVALID_YOUTUBE_URL: { status: 400, message: 'Only YouTube links are supported.' },
  SLUG_RESERVED: { status: 400, message: 'This website address is reserved.' },
  UNSUPPORTED_FILE_TYPE: { status: 400, message: 'This file type is not allowed here.' },
  FILE_NOT_UPLOADED: { status: 400, message: 'The file was not found in storage.' },
  INVITATION_NOT_READY: { status: 400, message: 'Add invitation media or a message first.' },
  NO_EVENTS_ASSIGNED: { status: 400, message: 'A selected household has no invited events.' },
  UNAUTHENTICATED: { status: 401, message: 'Please log in.' },
  INVALID_CREDENTIALS: { status: 401, message: 'Incorrect email or password.' },
  INVALID_SIGNATURE: { status: 401, message: 'Invalid signature.' },
  FORBIDDEN: { status: 403, message: 'You are not allowed to do this.' },
  INVITE_EMAIL_MISMATCH: { status: 403, message: 'This invite was sent to a different email.' },
  UPLOADS_CLOSED: { status: 403, message: 'Uploads are closed for this gallery.' },
  GALLERY_VIEWING_OFF: { status: 403, message: 'The couple has turned off gallery viewing.' },
  NOT_FOUND: { status: 404, message: 'Not found.' },
  LINK_INVALID: { status: 404, message: 'This link is no longer valid.' },
  INVITE_INVALID: { status: 404, message: 'This invite has expired or was already used.' },
  CONFLICT: { status: 409, message: 'This conflicts with a recent change.' },
  EMAIL_TAKEN: { status: 409, message: 'An account already uses this email.' },
  ALREADY_MEMBER: { status: 409, message: 'This person is already a member.' },
  INVITE_PENDING: { status: 409, message: 'An invite is already pending for this email.' },
  ADMIN_LIMIT_REACHED: { status: 409, message: 'A wedding can have at most 2 admins.' },
  LAST_ADMIN: { status: 409, message: 'A wedding must keep at least one admin.' },
  WEDDING_ARCHIVED: { status: 409, message: 'This wedding is archived and read-only.' },
  RSVP_CLOSED: { status: 409, message: 'RSVPs are closed.' },
  SLUG_TAKEN: { status: 409, message: 'This website address is taken.' },
  CATEGORY_IN_USE: { status: 409, message: 'This category is still used by expenses.' },
  HEADCOUNT_BELOW_RSVP: { status: 409, message: 'Headcount is lower than an existing RSVP.' },
  CONFIRMATION_REQUIRED: { status: 409, message: 'Please confirm this action.' },
  VENDOR_ALREADY_SAVED: { status: 409, message: 'This vendor is already saved.' },
  ATTACHMENT_LIMIT_REACHED: { status: 409, message: 'A vendor can have at most 10 attachments.' },
  FILE_TOO_LARGE: { status: 413, message: 'The file is too large.' },
  STORAGE_LIMIT_REACHED: { status: 413, message: 'Storage for this wedding is full.' },
  RATE_LIMITED: { status: 429, message: 'Too many requests. Please try again shortly.' },
  PLACES_QUOTA_REACHED: { status: 429, message: 'Monthly vendor search limit reached.' },
  INTERNAL_ERROR: { status: 500, message: 'Something went wrong. Please try again.' },
  EMAIL_SEND_FAILED: { status: 502, message: 'The email could not be sent. Please retry.' },
  PLACES_UNAVAILABLE: { status: 502, message: 'Google Places is unavailable. Please retry.' },
} as const satisfies Record<string, { status: number; message: string }>;

export type ErrorCode = keyof typeof ERROR_CODES;

/** Field-level problems (validation errors) or a small object (e.g. `{ affectedHouseholds }`). */
export type ErrorDetails = { path: string; message: string }[] | Record<string, unknown>;

/** Thrown by services and handlers; mapped to the error envelope by `defineHandler`. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: ErrorDetails | undefined;
  /** Extra response headers, e.g. `Retry-After` for RATE_LIMITED. */
  readonly headers: Record<string, string> | undefined;

  constructor(
    code: ErrorCode,
    message?: string,
    options: { details?: ErrorDetails; headers?: Record<string, string> } = {},
  ) {
    super(message ?? ERROR_CODES[code].message);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_CODES[code].status;
    this.details = options.details;
    this.headers = options.headers;
  }
}
