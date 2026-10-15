/** Guard murni untuk GET /api/cron/sweep-reservations (isu #76). Tanpa I/O. */

export function isCronAuthorized(
  authHeader: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!secret) return false;
  if (!authHeader?.startsWith('Bearer ')) return false;
  const input = authHeader.slice(7);
  if (input.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ input.charCodeAt(i);
  return diff === 0;
}
