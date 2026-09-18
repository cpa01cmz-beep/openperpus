/**
 * Sanitize free-text for PostgREST ilike / .or() interpolation.
 * Strips ilike wildcards (%, _) and PostgREST list syntax ((),;[]\,)
 * so raw `q` cannot break out of the intended `%q%` match.
 */
export function sanitizeIlike(q: string, maxLen = 100): string {
  return q.replace(/[%_()\[\]\\;,]/g, "").trim().slice(0, maxLen);
}
