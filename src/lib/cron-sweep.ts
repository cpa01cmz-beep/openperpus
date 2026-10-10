/** Guard murni untuk GET /api/cron/sweep-reservations (isu #76). Tanpa I/O. */

export function isCronAuthorized(
  authHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!secret) return false;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  return authHeader.slice('Bearer '.length) === secret;
}
