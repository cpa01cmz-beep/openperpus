/**
 * src/lib/supabase/index.ts — Barrel re-export untuk Supabase clients & helpers.
 * Tidak memindahkan logika; hanya re-export dari file yang sudah ada.
 */

export { createClient } from './client';
export { createClient as createServerClient } from './server';
export { updateSession } from './middleware';
export {
  type StaffRole,
  requireStaff,
  jsonError,
  jsonErrorMsg,
  slugify,
  FINE_PER_DAY,
  calcFine,
  addDaysISO,
  parsePaging,
} from './auth';
export { createPublicClient } from './public';
