/**
 * Helper URL publik situs.
 * Prioritas: NEXT_PUBLIC_SITE_URL > VERCEL_URL > localhost.
 * Aman dipakai di Server Component maupun Client Component (hanya baca NEXT_PUBLIC_*).
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const vercel = process.env.NEXT_VERCEL_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`;

  return 'http://localhost:3000';
}
