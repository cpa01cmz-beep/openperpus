/**
 * src/lib/validation/index.ts — Barrel re-export untuk seluruh validation module.
 * Preserves ALL public APIs from original validation.ts + content-validation.ts.
 * Importers keep: import { validateBook, bookSchema, ... } from '@/lib/validation'
 * atau: import { bookSchema, validateContentFields, ... } from '@/lib/validation'
 */

// Core entity validation
export { isUuid, validateBook, bookSchema } from './book';
export { validateMember, memberSchema } from './member';
export { validateLoan, loanSchema } from './loan';
export { validateReservation, reservationSchema } from './reservation';
export { validateFine, fineSchema } from './fine';

// Content validation (Fix4b / Security)
export {
  CONTENT_LIMITS,
  type ContentEntity,
  sanitizeHtmlContent,
  isAllowedImageUrl,
  validateContentFields,
  sanitizeContentPayload,
} from './content';

// Re-export shared types
export type { SafeParseResult } from './book';
