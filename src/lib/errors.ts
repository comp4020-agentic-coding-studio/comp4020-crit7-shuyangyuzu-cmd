// Thrown by src/lib/db.ts write paths so API routes can map them to the
// right HTTP status without string-matching error messages.
export class NotFoundError extends Error {}
export class ValidationError extends Error {}
export class ConflictError extends Error {}
