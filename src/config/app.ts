// Non-secret constants. Safe to import from client components.

/** The product name is not final. Use this constant everywhere; never hardcode the name. */
export const APP_NAME = 'Make My Marriage';

/** Short machine-friendly identifier (MongoDB appName, log fields). */
export const APP_ID = 'make-marriage';

export const SESSION_COOKIE_NAME = 'mmm_session';

/** Sessions last 30 days and slide forward while in use (architecture §6.1). */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
