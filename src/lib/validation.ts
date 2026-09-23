/**
 * src/lib/validation.ts — SHIM (behavior-preserving).
 * Canonical modules live in src/lib/validation/{book,member,loan,reservation,fine,content}.ts.
 * This file re-exports the entity APIs so existing `from '@/lib/validation'` imports keep working.
 * Prefer direct subpath imports (`@/lib/validation/book`) in new code.
 */
export { isUuid, validateBook, bookSchema } from './validation/book';
export { validateMember, memberSchema } from './validation/member';
export { validateLoan, loanSchema } from './validation/loan';
export { validateReservation, reservationSchema } from './validation/reservation';
export { validateFine, fineSchema } from './validation/fine';
export type { SafeParseResult } from './validation/book';

// Content validation (Fix4b / Security) — also available via '@/lib/validation'
export {
  CONTENT_LIMITS,
  type ContentEntity,
  sanitizeHtmlContent,
  isAllowedImageUrl,
  validateContentFields,
  sanitizeContentPayload,
} from './validation/content';
