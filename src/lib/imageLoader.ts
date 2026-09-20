type LoaderParams = {
  src: string;
  width: number;
  quality?: number;
};

const OBJECT_MARKER = '/storage/v1/object/public/';
const RENDER_MARKER = '/storage/v1/render/image/public/';

/**
 * Custom Next.js image loader backed by the Supabase Storage transform API.
 * Works on Cloudflare Workers (no Next Image Optimization server): Supabase
 * renders the resized variant (?width=&quality=75&resize=cover) so mobile
 * clients get a proper srcset instead of the full-size original.
 * Non-Supabase URLs (local /og-default.jpg, data:, blob:) pass through.
 *
 * NOTE untuk layout owner (jangan edit layout dari sini): tambahkan preconnect
 * + dns-prefetch ke origin Supabase di <head> agar LCP hero lebih cepat:
 *   <link rel="preconnect" href="https://xyzcompany.supabase.co" crossorigin>
 *   <link rel="dns-prefetch" href="https://xyzcompany.supabase.co">
 * Ganti hostname dengan NEXT_PUBLIC_SUPABASE_URL aktif. Do NOT edit layout here.
 */
export default function imageLoader({ src, width, quality }: LoaderParams): string {
  if (!src.includes(OBJECT_MARKER) && !src.includes(RENDER_MARKER)) return src;
  const [base] = src.split('?');
  const rendered = (base ?? src).replace(OBJECT_MARKER, RENDER_MARKER);
  const params = new URLSearchParams();
  params.set('width', String(Math.min(Math.max(width, 16), 1600)));
  params.set('quality', String(quality ?? 75));
  params.set('resize', 'cover');
  return `${rendered}?${params.toString()}`;
}
