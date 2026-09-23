/**
 * src/lib/content-validation.ts — SHIM (behavior-preserving).
 * Canonical module lives in src/lib/validation/content.ts.
 * This file re-exports so existing `from '@/lib/content-validation'` imports keep working.
 * Prefer `@/lib/validation/content` in new code.
 */
export {
  CONTENT_LIMITS,
  type ContentEntity,
  sanitizeHtmlContent,
  isAllowedImageUrl,
  validateContentFields,
  sanitizeContentPayload,
} from './validation/content';
